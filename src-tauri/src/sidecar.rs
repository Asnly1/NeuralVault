use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{App, AppHandle, Emitter, Manager};
use serde::Deserialize;

// Unix 进程组支持
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use futures_util::StreamExt;

use crate::db::{
    DbPool, IngestionResultData, ResourceRecord, ResourceSyncStatus,
    insert_context_chunks, update_resource_embedding_status, update_resource_processing_stage,
    delete_context_chunks, list_pending_resources,
};
use crate::utils::{notify_python, resolve_file_path, IngestPayload, NotifyAction};

/// 编译时获取项目根目录（Cargo.toml 所在目录）
/// 在开发模式下，这会指向 src-tauri 目录
const CARGO_MANIFEST_DIR: &str = env!("CARGO_MANIFEST_DIR");

fn build_ingest_payload_for_resource(
    app_handle: &AppHandle,
    resource: &ResourceRecord,
    action: NotifyAction,
) -> Result<IngestPayload, String> {
    let resolved_path = match &resource.file_path {
        Some(path) => Some(resolve_file_path(app_handle, path)?),
        None => None,
    };

    Ok(IngestPayload::new(
        resource.resource_id,
        action,
        resource.file_hash.clone(),
        resource.file_type,
        resource.content.clone(),
        resolved_path,
    ))
}

pub struct PythonSidecar {
    process: Arc<Mutex<Option<Child>>>,
    // Child: 在操作系统层面，当你的 Rust 程序（父进程）启动 Python 脚本时，它会派生（spawn）出一个子进程。
    // Option: 因为进程可能还没启动（None），或者已经启动了（Some(Child)）。
    // Mutex: 提供了内部可变性（Interior Mutability），允许你在只拥有不可变引用 &self 的情况下，通过 lock() 拿到锁来修改内部的 Child
    // Arc: 允许这个 PythonSidecar 实例被克隆（Clone），但所有克隆体都指向内存中同一个 Mutex。这意味着无论你在哪个线程、哪个 Tauri 命令里访问 process，操作的都是同一个 Python 进程
    
    /// HTTP 客户端，用于与 Python 后端通信
    /// 复用同一个 Client 可以利用连接池，提高性能
    pub client: reqwest::Client,
    pub stream_client: reqwest::Client,
    
    /// 动态分配的端口号
    /// 使用 Mutex 包装，因为端口在 start() 时才确定
    port: Mutex<u16>,
}

impl PythonSidecar {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            // 创建一个带有合理默认配置的 HTTP 客户端
            // reqwest::Client 内部维护了连接池，应该被复用而非每次请求都创建
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))  // 全局超时
                .pool_max_idle_per_host(5)         // 每个 host 最多保持 5 个空闲连接
                .build()
                .expect("Failed to create HTTP client"),
            stream_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(300))  // 全局超时
                .pool_max_idle_per_host(5)         // 每个 host 最多保持 5 个空闲连接
                .build()
                .expect("Failed to create stream HTTP client"),
            port: Mutex::new(0),  // 初始化为 0，在 start() 时分配实际端口
        }
    }
    fn find_available_port() -> Result<u16, String> {
        // 通过绑定到端口 0，让操作系统自动分配一个可用端口
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("Failed to bind to find available port: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local address: {}", e))?
            .port();
        // listener 在这里被 drop，端口被释放
        // Python 进程会立即使用这个端口，所以有很小的概率被其他进程抢占
        // 但在实际使用中这种情况非常罕见
        Ok(port)
    }

    /// 获取 Python 后端的基础 URL
    pub fn get_base_url(&self) -> String {
        let port = *self.port.lock().unwrap();
        // self.port.lock() 获取 Result<MutexGuard<u16>, PoisonError...>
        // .unwrap(): 如果结果是 Ok(MutexGuard<u16>)，则返回 Ok 中的值；如果结果是 Err(PoisonError) 则 panic
        // *: 解引用，获取 MutexGuard<u16> 中的值（即u16）
        format!("http://127.0.0.1:{}", port)
    }

    /// 获取当前分配的端口号
    pub fn get_port(&self) -> u16 {
        *self.port.lock().unwrap()
    }

    /// 获取 Python 项目目录
    /// 开发模式：返回项目根目录下的 src-python
    fn get_python_dir() -> PathBuf {
        // CARGO_MANIFEST_DIR 指向 src-tauri 目录
        // 需要获取父目录（项目根目录）再拼接 src-python
        PathBuf::from(CARGO_MANIFEST_DIR)
            .parent()
            .expect("Failed to get project root directory")
            .join("src-python")
    }

    /// 启动 Python sidecar 进程
    /// TODO: 生产模式
    pub fn start(&self, app: &mut App) -> Result<(), String> {
        let app_handle = app.handle();
        // 获取应用数据目录
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        
        let qdrant_path = app_dir.join("qdrant_data");
        
        // 动态分配端口
        let port = Self::find_available_port()?;
        *self.port.lock().unwrap() = port;
        
        #[cfg(debug_assertions)]
        {
            // 开发模式：使用 uv run 直接运行 Python
            // 使用编译时常量获取项目路径，避免运行时路径计算的不确定性
            let python_dir = Self::get_python_dir();
            
            println!("[Sidecar] Starting Python in development mode from {:?}", python_dir);
            println!("[Sidecar] Using dynamically allocated port: {}", port);

            let qdrant_path_str = qdrant_path.to_string_lossy(); // 把非UTF-8的字符用 � 替换
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
                .stdin(Stdio::piped()) // 把 Python 的输入管子接到了这个 Child 结构体里
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit());
            
            // Unix: 创建新的进程组，这样可以一次性杀掉整个进程树
            // process_group(0) 让子进程成为新进程组的 leader
            // 只有在目标平台是 Unix 系列（Linux / macOS / BSD 等）时，这段代码才会被编译
            #[cfg(unix)]
            cmd.process_group(0);
            
            let child = cmd.spawn()
                .map_err(|e| format!("Failed to spawn Python process: {}", e))?;
            
            println!("[Sidecar] Python process spawned with PID: {:?} (as process group leader)", child.id());
            
            *self.process.lock().unwrap() = Some(child);
        }
        
        #[cfg(not(debug_assertions))]
        {
            // 生产模式：使用打包的二进制文件（TODO: 第四阶段实现）
            return Err("Production mode not yet implemented. Use debug build.".to_string());
        }

        Ok(())
    }

    /// 检查 Python 进程是否存活
    pub fn is_running(&self) -> bool {
        if let Ok(mut process) = self.process.lock() {
            // process 被锁在Mutex里，需要用lock获取到 process: Option<Child>
            // Arc允许所有所有线程访问，只是个计数器，但是Mutex保证同一时间只有一个线程能访问被保护的数据，所以要获取Mutex的锁而不是Arc的锁
            // 如果成功拿到了锁（Ok），就把锁住的内容借给我，叫它 process，并且允许我修改它（mut）；如果拿锁失败了，直接走 else 返回 false
            if let Some(child) = process.as_mut() {
                // 如果我们直接写 if let Some(child) = process，在 Rust 中这叫"移动（Move）"
                // 你想把 Child 从盒子里拿走。但你不能拿走，因为 PythonSidecar 还要继续用它，而且它被锁保护着
                // process.as_mut() 的意思是："我不拿走里面的东西，我只是要一个指向里面数据的可变引用
                // 所以这里的 child 类型其实是 &mut Child
                match child.try_wait() {
                    // try_wait 不会阻塞，返回一个Result<Option<ExitStatus>, Error>
                    // 1. 已死：Ok(Some(ExitStatus)) —— 进程已退出，拿到了退出码
                    // 2. 活着：Ok(None) —— 进程还在运行
                    // 3. 错误：Err(e) —— 出错了，可能是权限问题或者其他系统调用错误
                    Ok(None) => true,  // 进程还在运行
                    _ => false,        // 进程已退出或出错
                }
            } else {
                false
            }
        } else {
            false
        }
    }

    /// 等待 Python 服务健康检查通过
    pub async fn wait_for_health(&self, max_retries: u32) -> Result<(), String> {
        for i in 0..max_retries {
            tokio::time::sleep(Duration::from_millis(500)).await;
            
            match self.check_health().await {
                Ok(_) => {
                    println!("[Sidecar] Python backend is healthy");
                    return Ok(());
                }
                Err(e) => {
                    println!(
                        "[Sidecar] Health check attempt {}/{} failed: {}",
                        i + 1,
                        max_retries,
                        e
                    );
                }
            }
        }
        
        Err(format!(
            "Python backend failed to become healthy after {} attempts",
            max_retries
        ))
    }

    /// 重建待处理队列（由 Rust 触发）
    pub async fn rebuild_pending_queue(
        &self,
        app_handle: AppHandle,
        db_pool: DbPool,
    ) -> Result<(), String> {
        let resources = list_pending_resources(&db_pool)
            .await
            .map_err(|e| format!("Failed to list pending resources: {}", e))?;

        if resources.is_empty() {
            return Ok(());
        }

        let base_url = self.get_base_url();
        for resource in resources {
            let action = match resource.sync_status {
                ResourceSyncStatus::Dirty => NotifyAction::Updated,
                _ => NotifyAction::Created,
            };

            let payload = match build_ingest_payload_for_resource(&app_handle, &resource, action) {
                Ok(payload) => payload,
                Err(e) => {
                    eprintln!("[Sidecar] Failed to build ingest payload: {}", e);
                    continue;
                }
            };

            notify_python(&self.client, &base_url, &payload).await;
        }

        Ok(())
    }

    /// 调用 Python 的健康检查接口
    /// 使用结构体中缓存的 HTTP 客户端，复用连接池
    pub async fn check_health(&self) -> Result<serde_json::Value, String> {
        let base_url = self.get_base_url();
        let response = self.client
            .get(&format!("{}/health", base_url)) // 1. 构造请求
            .timeout(Duration::from_secs(2)) // 2. 设置超时
            .send() // 3. 发送请求
            .await // 4. 等待响应
            .map_err(|e| format!("Health check request failed: {}", e))?; // 5. 处理错误
        
        let json = response
            .json::<serde_json::Value>() // 6. 说明想把Response解析成通用的json格式
            .await // 7. 等待解析
            .map_err(|e| format!("Failed to parse health check response: {}", e))?; // 8. 处理解析错误
        
        Ok(json)
    }

    /// 优雅关闭 Python 进程
    pub async fn shutdown(&self) -> Result<(), String> {
        println!("[Sidecar] Shutting down Python backend...");
        
        // 尝试调用 shutdown 接口
        if let Err(e) = self.call_shutdown_endpoint().await {
            println!("[Sidecar] Shutdown endpoint call failed: {}", e);
        }
        
        // 等待进程退出
        tokio::time::sleep(Duration::from_secs(1)).await;
        
        // 如果还在运行，强制终止
        if let Ok(mut process) = self.process.lock() {
            if let Some(mut child) = process.take() {
                // process.take() 会把 Option<Child> 里的 Some(child) 拿走，留下 None
                // 防止别的线程再次执行kill
                if child.try_wait().unwrap_or(None).is_none() {
                    // unwarp_or: 如果是 Ok，就拿出里面的东西；如果是 Err，就给我个默认值 None
                    // None的情况： 进程还活着 / 检查出错
                    println!("[Sidecar] Force killing Python process group");
                    
                    // Unix: 杀掉整个进程组（使用负的 PID）
                    #[cfg(unix)]
                    {
                        let pid = child.id();
                        // kill(-pid, SIGTERM) 会杀掉整个进程组
                        // 这确保 uv 和其子进程 python 都会被终止
                        unsafe {
                            libc::kill(-(pid as i32), libc::SIGTERM);
                        }
                    }
                    
                    // 非 Unix 或作为备选方案
                    #[cfg(not(unix))]
                    {
                        let _ = child.kill();
                    }

                    // 把"收尸"工作扔到后台线程去做，不要卡住当前的 async 任务
                    tokio::task::spawn_blocking(move || {
                        // || { ... } 是什么？
                        // 这是 Rust 的 闭包（Closure） 语法，你可以理解为"匿名函数"。
                        // || 表示没有参数（管道符中间是空的）。
                        // { ... } 里面是具体要执行的代码逻辑
                        // move: 把 child 彻底移交给后台线程，防止主线程提前退场导致工具失效
                        let _ = child.wait();
                    });
                }
            }
        }
        
        Ok(())
    }

    /// 调用 Python 的 shutdown 接口
    /// 使用结构体中缓存的 HTTP 客户端
    async fn call_shutdown_endpoint(&self) -> Result<(), String> {
        let base_url = self.get_base_url();
        self.client
            .post(&format!("{}/shutdown", base_url))
            .timeout(Duration::from_secs(2))
            .send()
            .await
            .map_err(|e| format!("Shutdown request failed: {}", e))?;

        Ok(())
    }

    /// 启动全局进度流连接
    ///
    /// 建立到 Python `/ingest/stream` 端点的 HTTP 长连接，
    /// 读取 NDJSON 格式的消息，区分进度消息和结果消息：
    /// - 进度消息 (type: "progress")：通过 Tauri Events 转发给前端
    /// - 结果消息 (type: "result")：写入数据库并通知前端
    ///
    /// 该方法会在后台持续运行，连接断开后自动重连。
    pub fn start_progress_stream(&self, app_handle: AppHandle, db_pool: DbPool) {
        let url = format!("{}/ingest/stream", self.get_base_url());
        let stream_client = self.stream_client.clone();

        println!("[Sidecar] Starting progress stream to {}", url);

        tauri::async_runtime::spawn(async move {
            loop {
                match Self::connect_and_read_stream(&stream_client, &url, &app_handle, &db_pool).await {
                    Ok(_) => {
                        println!("[Sidecar] Progress stream ended normally");
                    }
                    Err(e) => {
                        eprintln!("[Sidecar] Progress stream error: {}", e);
                    }
                }

                // 连接断开后等待重连
                println!("[Sidecar] Reconnecting progress stream in 2 seconds...");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        });
    }

    /// 建立连接并读取 NDJSON 流
    async fn connect_and_read_stream(
        stream_client: &reqwest::Client,
        url: &str,
        app_handle: &AppHandle,
        db_pool: &DbPool,
    ) -> Result<(), String> {
        let response = stream_client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to progress stream: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Progress stream returned error status: {}",
                response.status()
            ));
        }

        println!("[Sidecar] Progress stream connected");

        let mut stream = response.bytes_stream();
        // 使用 Vec<u8> 而不是 String，防止字节截断
        let mut buffer: Vec<u8> = Vec::new();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    // 将新收到的原始字节追加到 buffer 尾部
                    buffer.extend_from_slice(&bytes);

                    // 按行解析 NDJSON
                    // 在字节流中查找换行符 (0xA 是 '\n' 的 ASCII 码)
                    while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                        // 提取完整的一行（不包含换行符）
                        let line_bytes = &buffer[..pos];
                        let line = String::from_utf8_lossy(line_bytes).to_string();

                        // 使用 drain 移除已处理的字节（包含换行符）
                        buffer.drain(..pos + 1);

                        // 跳过空行
                        if line.trim().is_empty() {
                            continue;
                        }

                        // 解析 JSON 并根据消息类型处理
                        match serde_json::from_str::<StreamMessage>(&line) {
                            Ok(msg) => {
                                match msg.msg_type.as_str() {
                                    "progress" => {
                                        // 进度消息：更新数据库 processing_stage 并 emit 给前端
                                        if let (Some(resource_id), Some(status)) = (
                                            msg.payload.get("resource_id").and_then(|v| v.as_i64()),
                                            msg.payload.get("status").and_then(|v| v.as_str())
                                        ) {
                                            // 仅更新处理阶段，避免覆盖结果写入的 sync_status
                                            if let Err(e) = update_resource_processing_stage(
                                                db_pool,
                                                resource_id,
                                                status,
                                            ).await {
                                                eprintln!("[Sidecar] Failed to update processing stage: {}", e);
                                            }
                                        }

                                        // emit 给前端
                                        if let Err(e) = app_handle.emit("ingest-progress", &msg.payload) {
                                            eprintln!("[Sidecar] Failed to emit progress event: {}", e);
                                        }
                                    }
                                    "result" => {
                                        // 结果消息：写入数据库
                                        match serde_json::from_value::<IngestionResultData>(msg.payload.clone()) {
                                            Ok(result) => {
                                                if let Err(e) = Self::handle_ingestion_result(db_pool, &result).await {
                                                    eprintln!("[Sidecar] Failed to handle ingestion result: {}", e);
                                                }
                                                // emit done 状态给前端
                                                let done_msg = serde_json::json!({
                                                    "type": "progress",
                                                    "resource_id": result.resource_id,
                                                    "status": if result.success { "done" } else { "error" },
                                                    "percentage": if result.success { 100 } else { 0 },
                                                    "error": result.error
                                                });
                                                if let Err(e) = app_handle.emit("ingest-progress", &done_msg) {
                                                    eprintln!("[Sidecar] Failed to emit done event: {}", e);
                                                }
                                            }
                                            Err(e) => {
                                                eprintln!("[Sidecar] Failed to parse ingestion result: {}", e);
                                            }
                                        }
                                    }
                                    _ => {
                                        // 未知消息类型，忽略
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("[Sidecar] Failed to parse stream message: {} - line: {}", e, line);
                            }
                        }
                    }
                }
                Err(e) => {
                    return Err(format!("Stream read error: {}", e));
                }
            }
        }

        Ok(())
    }

    /// 处理 Python 返回的 Ingestion 结果
    ///
    /// 将处理结果写入数据库：
    /// - 成功：插入 context_chunks，更新 resources 状态为 synced
    /// - 失败：更新 resources 状态为 error
    async fn handle_ingestion_result(
        db_pool: &DbPool,
        result: &IngestionResultData,
    ) -> Result<(), String> {
        let resource_id = result.resource_id;

        if result.success {
            // 成功：写入 chunks 并更新状态
            if let Some(chunks) = &result.chunks {
                // 先删除旧的 chunks（如果是更新操作）
                delete_context_chunks(db_pool, resource_id)
                    .await
                    .map_err(|e| format!("Failed to delete old chunks: {}", e))?;

                // 插入新的 chunks
                if !chunks.is_empty() {
                    insert_context_chunks(
                        db_pool,
                        resource_id,
                        chunks,
                        result.embedding_model.as_deref(),
                    )
                    .await
                    .map_err(|e| format!("Failed to insert chunks: {}", e))?;
                }
            }

            // 更新资源状态为 synced
            update_resource_embedding_status(
                db_pool,
                resource_id,
                "synced",
                "done",
                result.indexed_hash.as_deref(),
                None,
            )
            .await
            .map_err(|e| format!("Failed to update resource status: {}", e))?;

            println!(
                "[Sidecar] Ingestion result processed: resource_id={}, chunks={}",
                resource_id,
                result.chunks.as_ref().map(|c| c.len()).unwrap_or(0)
            );
        } else {
            // 失败：更新状态为 error
            update_resource_embedding_status(
                db_pool,
                resource_id,
                "error",
                "done",
                None,
                result.error.as_deref(),
            )
            .await
            .map_err(|e| format!("Failed to update resource error status: {}", e))?;

            eprintln!(
                "[Sidecar] Ingestion failed: resource_id={}, error={:?}",
                resource_id, result.error
            );
        }

        Ok(())
    }
}

/// Stream 消息结构
#[derive(Debug, Deserialize)]
struct StreamMessage {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(flatten)]
    payload: serde_json::Value,
}

impl Drop for PythonSidecar {
    //析构函数, 当 PythonSidecar 实例被销毁时调用
    fn drop(&mut self) {
        println!("[Sidecar] Dropping PythonSidecar, killing process group if still running");
        if let Ok(mut process) = self.process.lock() {
            if let Some(mut child) = process.take() {
                // Unix: 杀掉整个进程组
                #[cfg(unix)]
                {
                    let pid = child.id();
                    unsafe {
                        libc::kill(-(pid as i32), libc::SIGTERM);
                    }
                }
                
                // 非 Unix: 使用标准 kill
                #[cfg(not(unix))]
                {
                    let _ = child.kill();
                }
                
                let _ = child.wait(); // 阻塞当前线程，直到子进程彻底从操作系统中消失
                // 仅仅 kill 是不够的。在 Linux/Unix 系统中，子进程死后会变成僵尸进程 (Zombie Process)，保留在进程表中，等待父进程来"收尸"（读取它的退出码）。
                // wait() 就是这个"收尸"的操作。如果不做这一步，你的 Python 进程虽然不跑了，但在任务管理器里可能还会看到一个 <defunct> 的条目占用着 PID
            }
        }
    }
}
