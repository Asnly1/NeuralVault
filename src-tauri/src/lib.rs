mod commands;
mod db;

use std::fs;

use tauri::Manager;

pub use commands::{capture_resource, create_task, get_dashboard, seed_demo_data};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Clone)]
pub struct AppState {
    pub db: db::DbPool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app // 整个应用程序的运行时句柄
                // 返回一个路径解析器 (Path Resolver) 实例
                .path()
                //调用 Tauri 的 API 获取操作系统标准的“应用数据目录”
                .app_data_dir()
                // 把 TautiError 转成 std::io::Error
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

            // 标准库 std::fs 的操作。如果目录不存在，就创建它；如果已存在，则什么都不做
            fs::create_dir_all(&app_dir)?;

            // 安全地将文件名拼接到目录后面，生成数据库文件的完整绝对路径
            let db_path = app_dir.join("neuralvault.sqlite3");
            // 强制阻塞当前线程，直到数据库连接池初始化完成
            let pool = tauri::async_runtime::block_on(db::init_pool(&db_path))?; 
            // 初始化好的 AppState（包含数据库连接池）注入到 Tauri 的全局管理器中
            // 以后你的 greet 或 capture_resource 命令只要在参数里写 state: State<AppState>，Tauri 就会自动把这个存好的数据库连接给你
            app.manage(AppState { db: pool });
            Ok(())
        })
        // 初始化 Shell 插件。允许你的 Rust 代码或前端代码执行系统命令（如打开终端、运行脚本）
        .plugin(tauri_plugin_shell::init())
        // 初始化 Opener 插件。用于调用系统默认程序打开文件或 URL（例如用默认浏览器打开网页）
        .plugin(tauri_plugin_opener::init())
        // 注册前端（JavaScript）可以调用的 Rust 函数
        .invoke_handler(tauri::generate_handler![
            greet,
            capture_resource,
            create_task,
            get_dashboard,
            seed_demo_data
        ])
        // 启动应用
        // tauri::generate_context!()：这个宏会读取你的 tauri.conf.json 配置文件，并在编译时将其转化为代码。它告诉构建器应用的名称、版本、图标等信息。
        // 一旦调用 .run()，程序就会进入事件循环（Event Loop），直到你关闭窗口，程序才会退出。
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
