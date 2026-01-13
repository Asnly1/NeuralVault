//! EmbeddingService - core embedding functionality

use std::sync::Arc;

use arrow_array::RecordBatchIterator;
use arrow_schema::Schema;
use fastembed::{
    EmbeddingModel, ImageEmbedding, ImageEmbeddingModel, ImageInitOptions, TextEmbedding,
    TextInitOptions,
};
use lancedb::index::scalar::FullTextSearchQuery;
use lancedb::query::{ExecutableQuery, QueryBase, QueryExecutionOptions};
use lancedb::{DistanceType, Table};
use text_splitter::{ChunkConfig, TextSplitter};
use tokenizers::Tokenizer;
use tokio::sync::Mutex;
use uuid::Uuid;

use super::store::{
    build_filter, build_record_batch, build_schema, collect_search_results, compute_embedding_hash,
    embedding_type_label, merge_results, normalize_embedding_type, open_or_create_table,
    LanceChunk, SearchResult,
};
use super::{COLUMN_IMAGE_VECTOR, COLUMN_NODE_ID, COLUMN_TEXT_VECTOR, VECTOR_KIND_IMAGE, VECTOR_KIND_TEXT};
use crate::db::{EmbedChunkResult, EmbeddingType};
use crate::services::VectorConfig;

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

// TODO: 使用bge-m3量化
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
        let type_label = embedding_type_label(embedding_type);

        for (idx, chunk) in chunks.iter().enumerate() {
            let vector_id = uuid::Uuid::new_v4().to_string();
            let embedding_hash = compute_embedding_hash(&chunk.text);
            let chunk_text = chunk.text.clone();

            rows.push(LanceChunk {
                vector_id: vector_id.clone(),
                node_id,
                embedding_type: type_label.to_string(),
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
        let type_label = embedding_type_label(embedding_type);

        let row = LanceChunk {
            vector_id: vector_id.clone(),
            node_id,
            embedding_type: type_label.to_string(),
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
            filters.push(format!("{} = '{}'", super::COLUMN_EMBEDDING_TYPE, embedding_type));
        }
        if let Some(vector_kind) = vector_kind {
            filters.push(format!("{} = '{}'", super::COLUMN_VECTOR_KIND, vector_kind));
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
            .distance_type(DistanceType::Cosine) // TODO: 为什么用Cosine？
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
