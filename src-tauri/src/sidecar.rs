use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{App, Manager};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

const CARGO_MANIFEST_DIR: &str = env!("CARGO_MANIFEST_DIR");

pub struct PythonSidecar {
    process: Arc<Mutex<Option<Child>>>,
    pub client: reqwest::Client,
    pub stream_client: reqwest::Client,
    port: Mutex<u16>,
}

impl PythonSidecar {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .pool_max_idle_per_host(5)
                .build()
                .expect("Failed to create HTTP client"),
            stream_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(300))
                .pool_max_idle_per_host(5)
                .build()
                .expect("Failed to create stream HTTP client"),
            port: Mutex::new(0),
        }
    }

    fn find_available_port() -> Result<u16, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("Failed to bind to find available port: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local address: {}", e))?
            .port();
        Ok(port)
    }

    pub fn get_base_url(&self) -> String {
        let port = *self.port.lock().unwrap();
        format!("http://127.0.0.1:{}", port)
    }

    pub fn get_port(&self) -> u16 {
        *self.port.lock().unwrap()
    }

    fn get_python_dir() -> PathBuf {
        PathBuf::from(CARGO_MANIFEST_DIR)
            .parent()
            .expect("Failed to get project root directory")
            .join("src-python")
    }

    pub fn start(&self, app: &mut App) -> Result<(), String> {
        let app_handle = app.handle();
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;

        let qdrant_path = app_dir.join("qdrant_data");
        let port = Self::find_available_port()?;
        *self.port.lock().unwrap() = port;

        #[cfg(debug_assertions)]
        {
            let python_dir = Self::get_python_dir();
            println!("[Sidecar] Starting Python in development mode from {:?}", python_dir);
            println!("[Sidecar] Using dynamically allocated port: {}", port);

            let qdrant_path_str = qdrant_path.to_string_lossy();
            if qdrant_path_str.contains('\u{FFFD}') {
                return Err("qdrant_path contains invalid UTF-8".to_string());
            }
            let qdrant_path_str = qdrant_path_str.into_owned();

            let mut cmd = Command::new("uv");
            cmd.args(&[
                "run",
                "python",
                "-m",
                "app.main",
                "--port",
                &port.to_string(),
                "--qdrant-path",
                &qdrant_path_str,
            ])
            .current_dir(python_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());

            #[cfg(unix)]
            cmd.process_group(0);

            let child = cmd
                .spawn()
                .map_err(|e| format!("Failed to spawn Python process: {}", e))?;

            println!("[Sidecar] Python process spawned with PID: {:?}", child.id());
            *self.process.lock().unwrap() = Some(child);
        }

        #[cfg(not(debug_assertions))]
        {
            return Err("Production mode not yet implemented. Use debug build.".to_string());
        }

        Ok(())
    }

    pub fn is_running(&self) -> bool {
        if let Ok(mut process) = self.process.lock() {
            if let Some(child) = process.as_mut() {
                return child.try_wait().ok().flatten().is_none();
            }
        }
        false
    }

    pub async fn check_health(&self) -> Result<serde_json::Value, String> {
        let url = format!("{}/health", self.get_base_url());
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to call Python health: {}", e))?;

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| format!("Invalid health response: {}", e))
    }

    pub async fn wait_for_health(&self, retries: usize) -> Result<(), String> {
        for _ in 0..retries {
            if self.check_health().await.is_ok() {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        Err("Python backend did not become healthy".to_string())
    }

    pub async fn shutdown(&self) -> Result<(), String> {
        let mut process = self.process.lock().unwrap();
        if let Some(child) = process.as_mut() {
            #[cfg(unix)]
            {
                unsafe {
                    libc::killpg(child.id() as i32, libc::SIGTERM);
                }
            }

            #[cfg(not(unix))]
            {
                let _ = child.kill();
            }
        }
        *process = None;
        Ok(())
    }
}
