use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{App, Manager};

/// 编译时获取项目根目录（Cargo.toml 所在目录）
/// 在开发模式下，这会指向 src-tauri 目录
const CARGO_MANIFEST_DIR: &str = env!("CARGO_MANIFEST_DIR");

pub struct PythonSidecar {
    process: Arc<Mutex<Option<Child>>>,
    // Child: 在操作系统层面，当你的 Rust 程序（父进程）启动 Python 脚本时，它会派生（spawn）出一个子进程。
    // Option: 因为进程可能还没启动（None），或者已经启动了（Some(Child)）。
    // Mutex: 提供了内部可变性（Interior Mutability），允许你在只拥有不可变引用 &self 的情况下，通过 lock() 拿到锁来修改内部的 Child
    // Arc: 允许这个 PythonSidecar 实例被克隆（Clone），但所有克隆体都指向内存中同一个 Mutex。这意味着无论你在哪个线程、哪个 Tauri 命令里访问 process，操作的都是同一个 Python 进程
    
    /// HTTP 客户端，用于与 Python 后端通信
    /// 复用同一个 Client 可以利用连接池，提高性能
    client: reqwest::Client,
    
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
        
        let db_path = app_dir.join("neuralvault.sqlite3");
        
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
            
            let child = Command::new("uv")
                .args(&[
                    "run",
                    "python",
                    "-m",
                    "app.main",
                    "--port",
                    &port.to_string(),
                    "--db-path",
                    db_path.to_str().unwrap(),
                ])
                .current_dir(python_dir)
                .stdin(Stdio::piped()) // 把 Python 的输入管子接到了这个 Child 结构体里
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .spawn()
                .map_err(|e| format!("Failed to spawn Python process: {}", e))?;
            
            println!("[Sidecar] Python process spawned with PID: {:?}", child.id());
            
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
                    println!("[Sidecar] Force killing Python process");
                    let _ = child.kill();

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
}

impl Drop for PythonSidecar {
    //析构函数, 当 PythonSidecar 实例被销毁时调用
    fn drop(&mut self) {
        println!("[Sidecar] Dropping PythonSidecar, killing process if still running");
        if let Ok(mut process) = self.process.lock() {
            if let Some(mut child) = process.take() {
                let _ = child.kill();
                let _ = child.wait(); // 阻塞当前线程，直到子进程彻底从操作系统中消失
                // 仅仅 kill 是不够的。在 Linux/Unix 系统中，子进程死后会变成僵尸进程 (Zombie Process)，保留在进程表中，等待父进程来"收尸"（读取它的退出码）。
                // wait() 就是这个"收尸"的操作。如果不做这一步，你的 Python 进程虽然不跑了，但在任务管理器里可能还会看到一个 <defunct> 的条目占用着 PID
            }
        }
    }
}
