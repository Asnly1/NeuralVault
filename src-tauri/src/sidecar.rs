use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{App, Manager};

const PYTHON_PORT: u16 = 8765;
const PYTHON_BASE_URL: &str = "http://127.0.0.1:8765";

pub struct PythonSidecar {
    process: Arc<Mutex<Option<Child>>>,
    // Child: 在操作系统层面，当你的 Rust 程序（父进程）启动 Python 脚本时，它会派生（spawn）出一个子进程。
    // Option: 因为进程可能还没启动（None），或者已经启动了（Some(Child)）。
    // Mutex: 提供了内部可变性（Interior Mutability），允许你在只拥有不可变引用 &self 的情况下，通过 lock() 拿到锁来修改内部的 Child
    // Arc: 允许这个 PythonSidecar 实例被克隆（Clone），但所有克隆体都指向内存中同一个 Mutex。这意味着无论你在哪个线程、哪个 Tauri 命令里访问 process，操作的都是同一个 Python 进程
}

impl PythonSidecar {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
        }
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
        
        #[cfg(debug_assertions)]
        {
            // 开发模式：使用 uv run 直接运行 Python
            // TODO: 配置路径而不是硬编码
            let python_dir = app_handle
                .path()
                .resource_dir()
                .map_err(|e| format!("Failed to get resource dir: {}", e))?
                .parent()
                .ok_or("Failed to get parent dir")?
                .parent()
                .ok_or("Failed to get grandparent dir")?
                .join("src-python");
            
            println!("[Sidecar] Starting Python in development mode from {:?}", python_dir);
            
            let child = Command::new("uv")
                .args(&[
                    "run",
                    "python",
                    "-m",
                    "app.main",
                    "--port",
                    &PYTHON_PORT.to_string(),
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
                // 如果我们直接写 if let Some(child) = process，在 Rust 中这叫“移动（Move）”
                // 你想把 Child 从盒子里拿走。但你不能拿走，因为 PythonSidecar 还要继续用它，而且它被锁保护着
                // process.as_mut() 的意思是：“我不拿走里面的东西，我只是要一个指向里面数据的可变引用
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
    /// TODO: 重复使用client
    pub async fn check_health(&self) -> Result<serde_json::Value, String> {
        let client = reqwest::Client::new();
        let response = client
            .get(&format!("{}/health", PYTHON_BASE_URL))       // 1. 构造请求：GET http://127.0.0.1:8765/health
            .timeout(Duration::from_secs(2))                       // 2. 设置超时：如果 Python 2秒没理我，就不等了
            .send()                            // 3. 发送：此时请求刚发出去
            .await                                        // 4. 等待：让出 CPU，直到网络层收到响应头
            .map_err(|e| format!("Health check request failed: {}", e))?; // 5. 错误转换与传播
        
        let json = response
            .json::<serde_json::Value>()       // 1. 告诉它我想把 Body 解析成通用的 JSON 格式
            .await                                           // 2. 等待：读取 TCP 流中的 Body 数据并反序列化
            .map_err(|e| format!("Failed to parse health check response: {}", e))?; // 3. 再次错误转换与传播
        
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

                    // 把“收尸”工作扔到后台线程去做，不要卡住当前的 async 任务
                    tokio::task::spawn_blocking(move || {
                        // || { ... } 是什么？
                        // 这是 Rust 的 闭包（Closure） 语法，你可以理解为“匿名函数”。
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
    async fn call_shutdown_endpoint(&self) -> Result<(), String> {
        let client = reqwest::Client::new();
        client
            .post(&format!("{}/shutdown", PYTHON_BASE_URL))
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
                // 仅仅 kill 是不够的。在 Linux/Unix 系统中，子进程死后会变成僵尸进程 (Zombie Process)，保留在进程表中，等待父进程来“收尸”（读取它的退出码）。
                // wait() 就是这个“收尸”的操作。如果不做这一步，你的 Python 进程虽然不跑了，但在任务管理器里可能还会看到一个 <defunct> 的条目占用着 PID
            }
        }
    }
}
