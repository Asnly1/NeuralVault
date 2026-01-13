//! AI 配置服务
//! 使用 AES-256-GCM 加密存储 API Key 配置
// TODO: 默认是否太复杂？
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::utils::crypto::CryptoService;

/// Provider 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub api_key: String,
    pub base_url: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorConfig {
    pub lancedb_path: String,
    pub lancedb_table_name: String,
    pub dense_embedding_model: String,
    pub dense_vector_size: u64,
    pub clip_text_embedding_model: String,
    pub image_embedding_model: String,
    pub clip_text_vector_size: u64,
    pub image_vector_size: u64,
    pub chunk_size: usize,
    pub chunk_overlap: usize,
}

impl Default for VectorConfig {
    fn default() -> Self {
        Self {
            lancedb_path: String::new(),
            lancedb_table_name: "neuralvault_vectors".to_string(),
            dense_embedding_model: "BAAI/bge-m3".to_string(),
            dense_vector_size: 1024,
            clip_text_embedding_model: "Qdrant/clip-ViT-B-32-text".to_string(),
            image_embedding_model: "Qdrant/clip-ViT-B-32-vision".to_string(),
            clip_text_vector_size: 512,
            image_vector_size: 512,
            chunk_size: 512,
            chunk_overlap: 50,
        }
    }
}

impl VectorConfig {
    fn apply_defaults(&mut self, app_data_dir: &PathBuf) {
        if self.lancedb_path.trim().is_empty() {
            let path = app_data_dir.join("lancedb");
            self.lancedb_path = path.to_string_lossy().to_string();
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClassificationMode {
    Manual,
    Aggressive,
}

impl Default for ClassificationMode {
    fn default() -> Self {
        ClassificationMode::Manual
    }
}

/// AI 配置数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIConfigData {
    pub version: u32,
    pub providers: HashMap<String, ProviderConfig>,
    pub processing_provider: Option<String>, // 处理任务（summary/topic）的provider
    pub processing_model: Option<String>, // 处理任务（summary/topic）的model
    #[serde(default)]
    pub classification_mode: ClassificationMode,
    #[serde(default)]
    pub vector_config: VectorConfig,
}

impl Default for AIConfigData {
    fn default() -> Self {
        Self {
            version: 1,
            providers: HashMap::new(),
            processing_provider: None,
            processing_model: None,
            classification_mode: ClassificationMode::Manual,
            vector_config: VectorConfig::default(),
        }
    }
}

impl AIConfigData {
    fn apply_defaults(&mut self, app_data_dir: &PathBuf) {
        self.vector_config.apply_defaults(app_data_dir);
    }
}

/// AI 配置服务
pub struct AIConfigService {
    config_path: PathBuf,
    crypto: CryptoService,
    app_data_dir: PathBuf,
}

impl AIConfigService {
    /// 创建新的配置服务实例
    pub fn new(app_data_dir: &PathBuf) -> Result<Self, String> {
        let crypto = CryptoService::new()?;
        let config_path = app_data_dir.join("ai_config.enc");

        Ok(Self {
            config_path,
            crypto,
            app_data_dir: app_data_dir.clone(),
        })
    }

    fn default_config(&self) -> AIConfigData {
        let mut config = AIConfigData::default();
        config.apply_defaults(&self.app_data_dir);
        config
    }

    /// 加载配置（如果文件不存在则返回默认配置）
    pub fn load(&self) -> Result<AIConfigData, String> {
        if !self.config_path.exists() {
            return Ok(self.default_config());
        }

        let encrypted = fs::read(&self.config_path).map_err(|e| e.to_string())?;
        let decrypted = self.crypto.decrypt(&encrypted)?;

        let mut config: AIConfigData = serde_json::from_slice(&decrypted).map_err(|e| e.to_string())?;
        config.apply_defaults(&self.app_data_dir);
        Ok(config)
    }

    /// 保存配置
    pub fn save(&self, config: &AIConfigData) -> Result<(), String> {
        let json = serde_json::to_vec(config).map_err(|e| e.to_string())?;
        let encrypted = self.crypto.encrypt(&json)?;

        fs::write(&self.config_path, encrypted).map_err(|e| e.to_string())
    }

    /// 设置单个 provider 的 API Key
    pub fn set_api_key(
        &self,
        provider: &str,
        api_key: &str,
        base_url: Option<String>,
    ) -> Result<(), String> {
        let mut config = self.load()?;

        config.providers.insert(
            provider.to_string(),
            ProviderConfig {
                api_key: api_key.to_string(),
                base_url,
                enabled: true,
            },
        );

        self.save(&config)
    }

    /// 删除单个 provider 的配置
    pub fn remove_provider(&self, provider: &str) -> Result<(), String> {
        let mut config = self.load()?;
        config.providers.remove(provider);

        // 如果删除的是processing provider，清除processing provider和model
        if config.processing_provider.as_deref() == Some(provider) {
            config.processing_provider = None;
            config.processing_model = None;
        }

        self.save(&config)
    }

    /// 获取 API Key
    pub fn get_api_key(&self, provider: &str) -> Result<Option<String>, String> {
        let config = self.load()?;
        Ok(config.providers.get(provider).map(|p| p.api_key.clone()))
    }

    /// 检查 provider 是否有 API Key
    pub fn has_api_key(&self, provider: &str) -> Result<bool, String> {
        let config = self.load()?;
        Ok(config.providers.get(provider).map(|p| !p.api_key.is_empty()).unwrap_or(false))
    }

    /// 获取 provider 的配置
    pub fn get_provider_config(&self, provider: &str) -> Result<Option<ProviderConfig>, String> {
        let config = self.load()?;
        Ok(config.providers.get(provider).cloned())
    }

    pub fn get_vector_config(&self) -> Result<VectorConfig, String> {
        let config = self.load()?;
        Ok(config.vector_config)
    }

    /// 设置processing provider和model
    pub fn set_processing_provider_model(&self, provider: &str, model: &str) -> Result<(), String> {
        let mut config = self.load()?;
        config.processing_provider = Some(provider.to_string());
        config.processing_model = Some(model.to_string());
        self.save(&config)
    }

    pub fn set_classification_mode(&self, mode: ClassificationMode) -> Result<(), String> {
        let mut config = self.load()?;
        config.classification_mode = mode;
        self.save(&config)
    }
}
