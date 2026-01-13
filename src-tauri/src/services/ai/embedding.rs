use std::cmp::Ordering;
use std::sync::Arc;

use arrow_array::builder::{FixedSizeListBuilder, Float32Builder};
use arrow_array::{Float32Array, Int32Array, Int64Array, RecordBatch, RecordBatchIterator, StringArray};
use arrow_schema::{DataType, Field, Schema};
use fastembed::{
    EmbeddingModel, ImageEmbedding, ImageEmbeddingModel, ImageInitOptions, TextEmbedding,
    TextInitOptions,
};
use futures_util::TryStreamExt;
use lancedb::index::scalar::FullTextSearchQuery;
use lancedb::arrow::SendableRecordBatchStream;
use lancedb::index::scalar::FtsIndexBuilder;
use lancedb::index::Index;
use lancedb::query::{ExecutableQuery, QueryBase, QueryExecutionOptions};
use lancedb::{connect, DistanceType, Error as LanceError, Table};
use text_splitter::{ChunkConfig, TextSplitter};
use tokenizers::Tokenizer;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::db::{EmbedChunkResult, EmbeddingType};
use crate::services::VectorConfig;
use crate::utils::compute_sha256;

const VECTOR_KIND_TEXT: &str = "text";
const VECTOR_KIND_IMAGE: &str = "image";
const RELEVANCE_SCORE_COLUMN: &str = "_relevance_score";
const SCORE_COLUMN: &str = "_score";
const DISTANCE_COLUMN: &str = "_distance";
const COLUMN_VECTOR_ID: &str = "vector_id";
const COLUMN_NODE_ID: &str = "node_id";
const COLUMN_EMBEDDING_TYPE: &str = "embedding_type";
const COLUMN_VECTOR_KIND: &str = "vector_kind";
const COLUMN_EMBEDDING_MODEL: &str = "embedding_model";
const COLUMN_CHUNK_TEXT: &str = "chunk_text";
const COLUMN_CHUNK_INDEX: &str = "chunk_index";
const COLUMN_TOKEN_COUNT: &str = "token_count";
const COLUMN_EMBEDDING_HASH: &str = "embedding_hash";
const COLUMN_TEXT_VECTOR: &str = "text_vector";
const COLUMN_IMAGE_VECTOR: &str = "image_vector";

pub struct EmbeddingService {
    dense: Mutex<TextEmbedding>,
    clip_text: Mutex<TextEmbedding>,
    image: Mutex<ImageEmbedding>,
    tokenizer: Tokenizer,
    splitter: TextSplitter<Tokenizer>,
    table: Table,
    schema: Arc<Schema>,
    config: VectorConfig,
}

pub struct EmbeddingResponse {
    pub chunks: Vec<EmbedChunkResult>,
}

impl EmbeddingService {
    pub async fn new(config: VectorConfig) -> Result<Self, String> {
        let dense_model: EmbeddingModel = config
            .dense_embedding_model
            .parse::<EmbeddingModel>()
            .map_err(|e| e.to_string())?;
        let clip_text_model: EmbeddingModel = config
            .clip_text_embedding_model
            .parse::<EmbeddingModel>()
            .map_err(|e| e.to_string())?;
        let image_model: ImageEmbeddingModel = config
            .image_embedding_model
            .parse::<ImageEmbeddingModel>()
            .map_err(|e| e.to_string())?;

        let dense = TextEmbedding::try_new(TextInitOptions::new(dense_model))
            .map_err(|e| e.to_string())?;
        let clip_text = TextEmbedding::try_new(TextInitOptions::new(clip_text_model))
            .map_err(|e| e.to_string())?;
        let image = ImageEmbedding::try_new(ImageInitOptions::new(image_model))
            .map_err(|e| e.to_string())?;

        let tokenizer = Tokenizer::from_pretrained(&config.dense_embedding_model, None)
            .map_err(|e| e.to_string())?;

        let chunk_config = ChunkConfig::new(config.chunk_size)
            .with_overlap(config.chunk_overlap)
            .map_err(|e| e.to_string())?
            .with_sizer(tokenizer.clone());
        let splitter = TextSplitter::new(chunk_config);

        let schema = build_schema(&config)?;
        let table = open_or_create_table(&config, schema.clone()).await?;

        Ok(Self {
            dense: Mutex::new(dense),
            clip_text: Mutex::new(clip_text),
            image: Mutex::new(image),
            tokenizer,
            splitter,
            table,
            schema,
            config,
        })
    }

    pub fn config(&self) -> &VectorConfig {
        &self.config
    }

    pub async fn embed_text(
        &self,
        node_id: i64,
        embedding_type: EmbeddingType,
        text: &str,
        chunk: bool,
    ) -> Result<EmbeddingResponse, String> {
        let text = text.trim();
        if text.is_empty() {
            return Ok(EmbeddingResponse { chunks: Vec::new() });
        }

        let chunks = if chunk {
            self.chunk_text(text)
        } else {
            vec![TextChunk::from_text(text, 0, self.token_count(text))]
        };

        let texts: Vec<&str> = chunks.iter().map(|chunk| chunk.text.as_str()).collect();
        let dense_vectors = {
            let mut model = self.dense.lock().await;
            model.embed(texts.as_slice(), None)
        }
        .map_err(|e| e.to_string())?;

        if dense_vectors.len() != chunks.len() {
            return Err("embedding result count mismatch".to_string());
        }

        let mut rows = Vec::with_capacity(chunks.len());
        let mut results = Vec::with_capacity(chunks.len());
        let embedding_type_label = embedding_type_label(embedding_type);

        for (idx, chunk) in chunks.iter().enumerate() {
            let vector_id = Uuid::new_v4().to_string();
            let embedding_hash = compute_embedding_hash(&chunk.text);
            let chunk_text = chunk.text.clone();

            rows.push(LanceChunk {
                vector_id: vector_id.clone(),
                node_id,
                embedding_type: embedding_type_label.to_string(),
                vector_kind: VECTOR_KIND_TEXT.to_string(),
                embedding_model: self.config.dense_embedding_model.clone(),
                chunk_text: chunk_text.clone(),
                chunk_index: chunk.chunk_index,
                token_count: chunk.token_count,
                embedding_hash: embedding_hash.clone(),
                text_vector: Some(dense_vectors[idx].clone()),
                image_vector: None,
            });

            results.push(EmbedChunkResult {
                chunk_text,
                chunk_index: chunk.chunk_index,
                vector_id,
                embedding_hash,
                token_count: chunk.token_count,
                vector_kind: VECTOR_KIND_TEXT.to_string(),
                embedding_model: self.config.dense_embedding_model.clone(),
            });
        }

        self.insert_chunks(&rows).await?;

        Ok(EmbeddingResponse { chunks: results })
    }

    pub async fn embed_image(
        &self,
        node_id: i64,
        embedding_type: EmbeddingType,
        image_path: &str,
        preview_text: &str,
    ) -> Result<EmbedChunkResult, String> {
        let vectors = {
            let mut model = self.image.lock().await;
            model.embed(vec![image_path], None)
        }
        .map_err(|e| e.to_string())?;

        let vector = vectors
            .get(0)
            .ok_or_else(|| "image embedding returned no vectors".to_string())?;

        let vector_id = Uuid::new_v4().to_string();
        let embedding_hash = compute_embedding_hash(preview_text);
        let token_count = self.token_count(preview_text);
        let embedding_type_label = embedding_type_label(embedding_type);

        let row = LanceChunk {
            vector_id: vector_id.clone(),
            node_id,
            embedding_type: embedding_type_label.to_string(),
            vector_kind: VECTOR_KIND_IMAGE.to_string(),
            embedding_model: self.config.image_embedding_model.clone(),
            chunk_text: preview_text.to_string(),
            chunk_index: 0,
            token_count,
            embedding_hash: embedding_hash.clone(),
            text_vector: None,
            image_vector: Some(vector.clone()),
        };

        self.insert_chunks(&[row]).await?;

        Ok(EmbedChunkResult {
            chunk_text: preview_text.to_string(),
            chunk_index: 0,
            vector_id,
            embedding_hash,
            token_count,
            vector_kind: VECTOR_KIND_IMAGE.to_string(),
            embedding_model: self.config.image_embedding_model.clone(),
        })
    }

    pub async fn delete_by_node(
        &self,
        node_id: i64,
        embedding_type: Option<&str>,
        vector_kind: Option<&str>,
    ) -> Result<(), String> {
        let mut filters = Vec::new();
        filters.push(format!("{} = {}", COLUMN_NODE_ID, node_id));
        if let Some(embedding_type) = embedding_type {
            filters.push(format!("{} = '{}'", COLUMN_EMBEDDING_TYPE, embedding_type));
        }
        if let Some(vector_kind) = vector_kind {
            filters.push(format!("{} = '{}'", COLUMN_VECTOR_KIND, vector_kind));
        }
        let predicate = filters.join(" AND ");

        self.table
            .delete(&predicate)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub async fn embed_query(&self, text: &str) -> Result<(Vec<f32>, Vec<f32>), String> {
        let text = text.trim();
        if text.is_empty() {
            return Err("query text is empty".to_string());
        }

        let dense = {
            let mut model = self.dense.lock().await;
            model.embed(vec![text], None)
        }
        .map_err(|e| e.to_string())?;

        let clip_text = {
            let mut model = self.clip_text.lock().await;
            model.embed(vec![text], None)
        }
        .map_err(|e| e.to_string())?;

        let dense_vector = dense
            .into_iter()
            .next()
            .ok_or_else(|| "dense query embedding missing".to_string())?;
        let clip_text_vector = clip_text
            .into_iter()
            .next()
            .ok_or_else(|| "clip text query embedding missing".to_string())?;

        Ok((dense_vector, clip_text_vector))
    }

    pub async fn search_hybrid(
        &self,
        query: &str,
        embedding_type: &str,
        node_ids: Option<&[i64]>,
        limit: u64,
    ) -> Result<Vec<SearchResult>, String> {
        let embedding_type = normalize_embedding_type(embedding_type)?;
        let (dense_vector, clip_text_vector) = self.embed_query(query).await?;

        let text_filter = build_filter(embedding_type, node_ids, VECTOR_KIND_TEXT);
        let image_filter = build_filter(embedding_type, node_ids, VECTOR_KIND_IMAGE);

        let text_results = self
            .search_text_hybrid(query, dense_vector, text_filter.as_deref(), limit as usize)
            .await?;
        let image_results = self
            .search_image_vector(clip_text_vector, image_filter.as_deref(), limit as usize)
            .await?;

        Ok(merge_results(text_results, image_results, limit as usize))
    }

    async fn search_text_hybrid(
        &self,
        query: &str,
        dense_vector: Vec<f32>,
        filter: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SearchResult>, String> {
        let mut query_builder = self
            .table
            .query()
            .full_text_search(FullTextSearchQuery::new(query.to_string()))
            .nearest_to(dense_vector)
            .map_err(|e| e.to_string())?
            .column(COLUMN_TEXT_VECTOR)
            .distance_type(DistanceType::Cosine)
            .limit(limit);

        if let Some(filter) = filter {
            query_builder = query_builder.only_if(filter);
        }

        let stream = query_builder
            .execute_hybrid(QueryExecutionOptions::default())
            .await
            .map_err(|e| e.to_string())?;

        collect_search_results(stream).await
    }

    async fn search_image_vector(
        &self,
        clip_text_vector: Vec<f32>,
        filter: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SearchResult>, String> {
        let mut query_builder = self
            .table
            .query()
            .nearest_to(clip_text_vector)
            .map_err(|e| e.to_string())?
            .column(COLUMN_IMAGE_VECTOR)
            .distance_type(DistanceType::Cosine)
            .limit(limit);

        if let Some(filter) = filter {
            query_builder = query_builder.only_if(filter);
        }

        let stream = query_builder.execute().await.map_err(|e| e.to_string())?;
        collect_search_results(stream).await
    }

    async fn insert_chunks(&self, rows: &[LanceChunk]) -> Result<(), String> {
        if rows.is_empty() {
            return Ok(());
        }

        let batch = build_record_batch(self.schema.clone(), rows)?;
        let batches = RecordBatchIterator::new(vec![Ok(batch)], self.schema.clone());
        self.table
            .add(batches)
            .execute()
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    fn chunk_text(&self, text: &str) -> Vec<TextChunk> {
        self.splitter
            .chunks(text)
            .enumerate()
            .map(|(idx, chunk)| {
                TextChunk::from_text(chunk, idx as i32, self.token_count(chunk))
            })
            .collect()
    }

    fn token_count(&self, text: &str) -> Option<i32> {
        self.tokenizer
            .encode(text, false)
            .ok()
            .map(|encoding| encoding.len() as i32)
    }
}

#[derive(Debug, Clone)]
pub struct SearchResult {
    pub node_id: i64,
    pub chunk_index: i32,
    pub chunk_text: String,
    pub score: f64,
}

#[derive(Debug, Clone)]
struct LanceChunk {
    vector_id: String,
    node_id: i64,
    embedding_type: String,
    vector_kind: String,
    embedding_model: String,
    chunk_text: String,
    chunk_index: i32,
    token_count: Option<i32>,
    embedding_hash: String,
    text_vector: Option<Vec<f32>>,
    image_vector: Option<Vec<f32>>,
}

fn build_schema(config: &VectorConfig) -> Result<Arc<Schema>, String> {
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

async fn open_or_create_table(
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

async fn create_indexes(table: &Table) -> Result<(), String> {
    table
        .create_index(&[COLUMN_CHUNK_TEXT], Index::FTS(FtsIndexBuilder::default()))
        .execute()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn build_record_batch(schema: Arc<Schema>, rows: &[LanceChunk]) -> Result<RecordBatch, String> {
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

async fn collect_search_results(
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

        let score_column = if let Some(column) = batch.column_by_name(RELEVANCE_SCORE_COLUMN) {
            column
                .as_any()
                .downcast_ref::<Float32Array>()
                .ok_or_else(|| "relevance_score column type mismatch".to_string())?
                .iter()
                .map(|value| value.unwrap_or(0.0) as f64)
                .collect::<Vec<f64>>()
        } else if let Some(column) = batch.column_by_name(DISTANCE_COLUMN) {
            column
                .as_any()
                .downcast_ref::<Float32Array>()
                .ok_or_else(|| "distance column type mismatch".to_string())?
                .iter()
                .map(|value| 1.0 - value.unwrap_or(1.0) as f64)
                .collect::<Vec<f64>>()
        } else if let Some(column) = batch.column_by_name(SCORE_COLUMN) {
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

fn merge_results(
    mut text_results: Vec<SearchResult>,
    mut image_results: Vec<SearchResult>,
    limit: usize,
) -> Vec<SearchResult> {
    text_results.append(&mut image_results);
    let mut seen = std::collections::HashSet::new();
    let mut deduped = Vec::new();

    for item in text_results {
        let key = (item.node_id, item.chunk_index, item.chunk_text.clone());
        if seen.insert(key) {
            deduped.push(item);
        }
    }

    deduped.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(Ordering::Equal)
    });
    deduped.truncate(limit);
    deduped
}

fn normalize_embedding_type(value: &str) -> Result<&str, String> {
    match value {
        "summary" | "content" => Ok(value),
        _ => Err(format!("invalid embedding_type: {}", value)),
    }
}

fn build_filter(embedding_type: &str, node_ids: Option<&[i64]>, vector_kind: &str) -> Option<String> {
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

fn embedding_type_label(embedding_type: EmbeddingType) -> &'static str {
    match embedding_type {
        EmbeddingType::Summary => "summary",
        EmbeddingType::Content => "content",
    }
}

fn compute_embedding_hash(text: &str) -> String {
    let hash = compute_sha256(text.as_bytes());
    hash.chars().take(16).collect()
}

struct TextChunk {
    text: String,
    chunk_index: i32,
    token_count: Option<i32>,
}

impl TextChunk {
    fn from_text(text: &str, chunk_index: i32, token_count: Option<i32>) -> Self {
        Self {
            text: text.to_string(),
            chunk_index,
            token_count,
        }
    }
}
