//! AES-256-GCM 加密模块
//! 使用随机生成的主密钥加密敏感数据，密钥存储在受保护的文件中

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use directories::ProjectDirs;
use rand::{rngs::OsRng, RngCore};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const NONCE_SIZE: usize = 12;
const KEY_SIZE: usize = 32; // AES-256
const TAG_SIZE: usize = 16;

/// 加密服务
pub struct CryptoService {
    cipher: Aes256Gcm,
}

impl CryptoService {
    /// 初始化：自动查找、生成并加载密钥
    pub fn new() -> Result<Self, String> {
        let key_path = get_key_file_path()?;
        let key = load_or_create_key(&key_path)?;

        let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
        Ok(Self { cipher })
    }

    /// 加密数据
    /// nonce: Number used once
    /// 返回格式: [nonce 12B][ciphertext][tag 16B]
    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let mut nonce_bytes = [0u8; NONCE_SIZE];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = self
            .cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| e.to_string())?;

        let mut result = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
        result.extend_from_slice(&nonce_bytes);
        result.extend_from_slice(&ciphertext);

        Ok(result)
    }

    /// 解密数据
    pub fn decrypt(&self, encrypted: &[u8]) -> Result<Vec<u8>, String> {
        if encrypted.len() < NONCE_SIZE + TAG_SIZE {
            return Err("Invalid encrypted data length".to_string());
        }

        let nonce = Nonce::from_slice(&encrypted[..NONCE_SIZE]);
        let ciphertext = &encrypted[NONCE_SIZE..];

        self.cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| e.to_string())
    }
}

/// 获取密钥文件的存储路径
/// macOS: ~/Library/Application Support/com.neuralvault.app/master.key
/// Windows: C:\Users\Name\AppData\Roaming\neuralvault\app\data\master.key
/// Linux: ~/.local/share/neuralvault/master.key
fn get_key_file_path() -> Result<PathBuf, String> {
    let proj_dirs = ProjectDirs::from("com", "hovsco", "neuralvault")
        .ok_or("Could not determine application data directory")?;

    let data_dir = proj_dirs.data_dir();

    // 确保目录存在
    if !data_dir.exists() {
        fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    }

    Ok(data_dir.join("master.key"))
}

/// 加载或创建密钥，并应用权限控制
fn load_or_create_key(path: &Path) -> Result<Vec<u8>, String> {
    if path.exists() {
        // 文件存在，直接读取
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        let mut key = vec![0u8; KEY_SIZE];
        file.read_exact(&mut key)
            .map_err(|_| "Key file corrupted or invalid size".to_string())?;
        Ok(key)
    } else {
        // 文件不存在，生成新密钥
        let mut key = [0u8; KEY_SIZE];
        OsRng.fill_bytes(&mut key);

        // 写入文件
        let mut file = File::create(path).map_err(|e| e.to_string())?;
        file.write_all(&key).map_err(|e| e.to_string())?;

        // 设置文件权限（仅当前用户可读写）
        restrict_file_permissions(path)?;

        Ok(key.to_vec())
    }
}

// ==========================================
// 平台特定的权限控制
// ==========================================

/// macOS / Linux: 设置文件权限为 600 (仅所有者读写)
#[cfg(unix)]
fn restrict_file_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let mut perms = fs::metadata(path)
        .map_err(|e| e.to_string())?
        .permissions();
    perms.set_mode(0o600); // rw-------
    fs::set_permissions(path, perms).map_err(|e| e.to_string())?;

    Ok(())
}

/// Windows: 使用 icacls 命令移除继承权限并仅授予当前用户完全控制权
#[cfg(windows)]
fn restrict_file_permissions(path: &Path) -> Result<(), String> {
    use std::process::Command;

    let path_str = path.to_str().ok_or("Invalid path encoding")?;
    let username =
        std::env::var("USERNAME").map_err(|_| "Cannot get current username".to_string())?;

    // /inheritance:r -> 移除所有继承的权限
    // /grant:r USERNAME:F -> 赋予当前用户 Full access
    let output = Command::new("icacls")
        .arg(path_str)
        .arg("/inheritance:r")
        .arg("/grant:r")
        .arg(format!("{}:F", username))
        .output()
        .map_err(|e| format!("Failed to execute icacls: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to secure key file: {}", err_msg));
    }

    Ok(())
}
