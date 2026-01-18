//! LanceDB storage operations

use std::cmp::Ordering;
use std::sync::Arc;

use arrow_array::builder::{FixedSizeListBuilder, Float32Builder};
use arrow_array::{Float32Array, Int32Array, Int64Array, RecordBatch, StringArray};
use arrow_schema::{DataType, Field, Schema};
use futures_util::TryStreamExt;
use lancedb::arrow::SendableRecordBatchStream;
use lancedb::index::scalar::FtsIndexBuilder;
use lancedb::index::Index;
use lancedb::{connect, Error as LanceError, Table};

use super::{
    COLUMN_CHUNK_INDEX, COLUMN_CHUNK_TEXT, COLUMN_EMBEDDING_HASH, COLUMN_EMBEDDING_MODEL,
    COLUMN_EMBEDDING_TYPE, COLUMN_IMAGE_VECTOR, COLUMN_NODE_ID, COLUMN_TEXT_VECTOR,
    COLUMN_TOKEN_COUNT, COLUMN_VECTOR_ID, COLUMN_VECTOR_KIND, COLUMN_DISTANCE,
    COLUMN_RELEVANCE_SCORE, COLUMN_SCORE,
};
use crate::db::EmbeddingType;
use crate::services::VectorConfig;
use crate::utils::compute_sha256;

/// Internal representation of a chunk stored in LanceDB
#[derive(Debug, Clone)]
pub struct LanceChunk {
    pub vector_id: String,
    pub node_id: i64,
    pub embedding_type: String,
    pub vector_kind: String,
    pub embedding_model: String,
    pub chunk_text: String,
    pub chunk_index: i32,
    pub token_count: Option<i32>,
    pub embedding_hash: String,
    pub text_vector: Option<Vec<f32>>,
    pub image_vector: Option<Vec<f32>>,
}

pub fn build_schema(config: &VectorConfig) -> Result<Arc<Schema>, String> {
    let dense_dim = i32::try_from(config.dense_vector_size)
        .map_err(|_| "dense_vector_size overflow".to_string())?;
    let image_dim = i32::try_from(config.image_vector_size)
        .map_err(|_| "image_vector_size overflow".to_string())?;

    let text_vector = DataType::FixedSizeList(
        Arc::new(Field::new("item", DataType::Float32, true)),
        dense_dim,
    );
    let image_vector = DataType::FixedSizeList(
        Arc::new(Field::new("item", DataType::Float32, true)),
        image_dim,
    );

    Ok(Arc::new(Schema::new(vec![
        Field::new(COLUMN_VECTOR_ID, DataType::Utf8, false),
        Field::new(COLUMN_NODE_ID, DataType::Int64, false),
        Field::new(COLUMN_EMBEDDING_TYPE, DataType::Utf8, false),
        Field::new(COLUMN_VECTOR_KIND, DataType::Utf8, false),
        Field::new(COLUMN_EMBEDDING_MODEL, DataType::Utf8, false),
        Field::new(COLUMN_CHUNK_TEXT, DataType::Utf8, false),
        Field::new(COLUMN_CHUNK_INDEX, DataType::Int32, false),
        Field::new(COLUMN_TOKEN_COUNT, DataType::Int32, true),
        Field::new(COLUMN_EMBEDDING_HASH, DataType::Utf8, false),
        Field::new(COLUMN_TEXT_VECTOR, text_vector, true),
        Field::new(COLUMN_IMAGE_VECTOR, image_vector, true),
    ])))
}

pub async fn open_or_create_table(
    config: &VectorConfig,
    schema: Arc<Schema>,
) -> Result<Table, String> {
    let db = connect(&config.lancedb_path)
        .execute()
        .await
        .map_err(|e| e.to_string())?;

    match db.open_table(&config.lancedb_table_name).execute().await {
        Ok(table) => Ok(table),
        Err(LanceError::TableNotFound { .. }) => {
            let table = db
                .create_empty_table(&config.lancedb_table_name, schema)
                .execute()
                .await
                .map_err(|e| e.to_string())?;
            create_indexes(&table).await?;
            Ok(table)
        }
        Err(err) => Err(err.to_string()),
    }
}

pub async fn create_indexes(table: &Table) -> Result<(), String> {
    table
        .create_index(&[COLUMN_CHUNK_TEXT], Index::FTS(FtsIndexBuilder::default()))
        .execute()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn build_record_batch(schema: Arc<Schema>, rows: &[LanceChunk]) -> Result<RecordBatch, String> {
    let vector_ids = StringArray::from_iter_values(rows.iter().map(|row| row.vector_id.as_str()));
    let node_ids = Int64Array::from_iter_values(rows.iter().map(|row| row.node_id));
    let embedding_types =
        StringArray::from_iter_values(rows.iter().map(|row| row.embedding_type.as_str()));
    let vector_kinds =
        StringArray::from_iter_values(rows.iter().map(|row| row.vector_kind.as_str()));
    let embedding_models =
        StringArray::from_iter_values(rows.iter().map(|row| row.embedding_model.as_str()));
    let chunk_texts =
        StringArray::from_iter_values(rows.iter().map(|row| row.chunk_text.as_str()));
    let chunk_indices = Int32Array::from_iter_values(rows.iter().map(|row| row.chunk_index));
    let token_counts = Int32Array::from_iter(rows.iter().map(|row| row.token_count));
    let embedding_hashes =
        StringArray::from_iter_values(rows.iter().map(|row| row.embedding_hash.as_str()));

    let dense_dim = match schema
        .field_with_name(COLUMN_TEXT_VECTOR)
        .map_err(|e| e.to_string())?
        .data_type()
    {
        DataType::FixedSizeList(_, size) => *size as usize,
        _ => return Err("text_vector is not fixed size list".to_string()),
    };
    let image_dim = match schema
        .field_with_name(COLUMN_IMAGE_VECTOR)
        .map_err(|e| e.to_string())?
        .data_type()
    {
        DataType::FixedSizeList(_, size) => *size as usize,
        _ => return Err("image_vector is not fixed size list".to_string()),
    };

    let text_vectors = build_vector_column(rows, dense_dim, true)?;
    let image_vectors = build_vector_column(rows, image_dim, false)?;

    RecordBatch::try_new(
        schema,
        vec![
            Arc::new(vector_ids),
            Arc::new(node_ids),
            Arc::new(embedding_types),
            Arc::new(vector_kinds),
            Arc::new(embedding_models),
            Arc::new(chunk_texts),
            Arc::new(chunk_indices),
            Arc::new(token_counts),
            Arc::new(embedding_hashes),
            Arc::new(text_vectors),
            Arc::new(image_vectors),
        ],
    )
    .map_err(|e| e.to_string())
}

fn build_vector_column(
    rows: &[LanceChunk],
    dim: usize,
    use_text_vector: bool,
) -> Result<arrow_array::FixedSizeListArray, String> {
    let mut builder = FixedSizeListBuilder::with_capacity(
        Float32Builder::with_capacity(rows.len() * dim),
        dim as i32,
        rows.len(),
    );

    for row in rows {
        let vector = if use_text_vector {
            row.text_vector.as_deref()
        } else {
            row.image_vector.as_deref()
        };
        if let Some(vector) = vector {
            if vector.len() != dim {
                return Err("embedding vector size mismatch".to_string());
            }
            builder.values().append_slice(vector);
            builder.append(true);
        } else {
            for _ in 0..dim {
                builder.values().append_null();
            }
            builder.append(false);
        }
    }

    Ok(builder.finish())
}

/// Search result from vector search
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub node_id: i64,
    pub chunk_index: i32,
    pub chunk_text: String,
    pub score: f64,
}

pub async fn collect_search_results(
    mut stream: SendableRecordBatchStream,
) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();

    while let Some(batch) = stream.try_next().await.map_err(|e| e.to_string())? {
        if batch.num_rows() == 0 {
            continue;
        }

        let node_ids = batch
            .column_by_name(COLUMN_NODE_ID)
            .ok_or_else(|| "search result missing node_id".to_string())?
            .as_any()
            .downcast_ref::<Int64Array>()
            .ok_or_else(|| "node_id column type mismatch".to_string())?;
        let chunk_indices = batch
            .column_by_name(COLUMN_CHUNK_INDEX)
            .ok_or_else(|| "search result missing chunk_index".to_string())?
            .as_any()
            .downcast_ref::<Int32Array>()
            .ok_or_else(|| "chunk_index column type mismatch".to_string())?;
        let chunk_texts = batch
            .column_by_name(COLUMN_CHUNK_TEXT)
            .ok_or_else(|| "search result missing chunk_text".to_string())?
            .as_any()
            .downcast_ref::<StringArray>()
            .ok_or_else(|| "chunk_text column type mismatch".to_string())?;

        let score_column = if let Some(column) = batch.column_by_name(COLUMN_RELEVANCE_SCORE) {
            column
                .as_any()
                .downcast_ref::<Float32Array>()
                .ok_or_else(|| "relevance_score column type mismatch".to_string())?
                .iter()
                .map(|value| value.unwrap_or(0.0) as f64)
                .collect::<Vec<f64>>()
        } else if let Some(column) = batch.column_by_name(COLUMN_DISTANCE) {
            column
                .as_any()
                .downcast_ref::<Float32Array>()
                .ok_or_else(|| "distance column type mismatch".to_string())?
                .iter()
                .map(|value| 1.0 - value.unwrap_or(1.0) as f64)
                .collect::<Vec<f64>>()
        } else if let Some(column) = batch.column_by_name(COLUMN_SCORE) {
            column
                .as_any()
                .downcast_ref::<Float32Array>()
                .ok_or_else(|| "score column type mismatch".to_string())?
                .iter()
                .map(|value| value.unwrap_or(0.0) as f64)
                .collect::<Vec<f64>>()
        } else {
            vec![0.0; batch.num_rows()]
        };

        for row_idx in 0..batch.num_rows() {
            let node_id = node_ids.value(row_idx);
            let chunk_index = chunk_indices.value(row_idx);
            let chunk_text = chunk_texts.value(row_idx).to_string();
            let score = score_column.get(row_idx).copied().unwrap_or(0.0);

            results.push(SearchResult {
                node_id,
                chunk_index,
                chunk_text,
                score,
            });
        }
    }

    Ok(results)
}

pub fn merge_results(
    mut text_results: Vec<SearchResult>,
    mut image_results: Vec<SearchResult>,
    limit: usize,
) -> Vec<SearchResult> {
    text_results.append(&mut image_results);
    let mut best_by_key: std::collections::HashMap<(i64, i32, String), SearchResult> =
        std::collections::HashMap::new();

    for item in text_results {
        let key = (item.node_id, item.chunk_index, item.chunk_text.clone());
        match best_by_key.get_mut(&key) {
            Some(existing) => {
                let replace = match (item.score.is_nan(), existing.score.is_nan()) {
                    (true, true) => false,
                    (true, false) => false,
                    (false, true) => true,
                    (false, false) => item.score > existing.score,
                };
                if replace {
                    *existing = item;
                }
            }
            None => {
                best_by_key.insert(key, item);
            }
        }
    }

    let mut deduped: Vec<SearchResult> = best_by_key.into_values().collect();
    deduped.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(Ordering::Equal)
    });
    deduped.truncate(limit);
    deduped
}

pub fn normalize_embedding_type(value: &str) -> Result<&str, String> {
    match value {
        "summary" | "content" => Ok(value),
        _ => Err(format!("invalid embedding_type: {}", value)),
    }
}

pub fn build_filter(embedding_type: &str, node_ids: Option<&[i64]>, vector_kind: &str) -> Option<String> {
    let mut filters = Vec::new();
    filters.push(format!("{} = '{}'", COLUMN_EMBEDDING_TYPE, embedding_type));
    filters.push(format!("{} = '{}'", COLUMN_VECTOR_KIND, vector_kind));

    if let Some(node_ids) = node_ids {
        if !node_ids.is_empty() {
            let values = node_ids
                .iter()
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(", ");
            filters.push(format!("{} IN ({})", COLUMN_NODE_ID, values));
        }
    }

    if filters.is_empty() {
        None
    } else {
        Some(filters.join(" AND "))
    }
}

pub fn embedding_type_label(embedding_type: EmbeddingType) -> &'static str {
    match embedding_type {
        EmbeddingType::Summary => "summary",
        EmbeddingType::Content => "content",
    }
}

pub fn compute_embedding_hash(text: &str) -> String {
    let hash = compute_sha256(text.as_bytes());
    hash.chars().take(16).collect()
}
