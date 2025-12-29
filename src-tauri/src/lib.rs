mod app_state;
mod commands;
mod db;
mod sidecar;
mod utils;
mod window;

use std::fs;
use std::sync::Arc;

use tauri::Manager;

pub use app_state::AppState;
pub use commands::{
    capture_resource, create_task, soft_delete_resource_command, soft_delete_task_command,
    get_assets_path, get_dashboard, get_task_resources, hard_delete_resource_command,
    hard_delete_task_command, link_resource, read_clipboard, seed_demo_data, unlink_resource,
    mark_task_as_done_command, mark_task_as_todo_command, update_task_priority_command,
    update_task_due_date_command, update_task_title_command, update_task_description_command,
    get_tasks_by_date, get_all_tasks, update_resource_content_command, update_resource_display_name_command,
    check_python_health, is_python_running, get_python_port,
};
pub use sidecar::PythonSidecar;
pub use window::{hide_hud, toggle_hud};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // ========== 数据库初始化 ==========
            let app_dir = app // 整个应用程序的运行时句柄
                // 返回一个路径解析器 (Path Resolver) 实例
                .path()
                // 调用 Tauri 的 API 获取操作系统标准的"应用数据目录"
                .app_data_dir()
                // 把 TauriError 转成 std::io::Error
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

            // 标准库 std::fs 的操作。如果目录不存在，就创建它；如果已存在，则什么都不做
            fs::create_dir_all(&app_dir)?;

            // 安全地将文件名拼接到目录后面，生成数据库文件的完整绝对路径
            let db_path = app_dir.join("neuralvault.sqlite3");
            // 强制阻塞当前线程，直到数据库连接池初始化完成
            let pool = tauri::async_runtime::block_on(db::init_pool(&db_path))?;
            
            // ========== Python Sidecar 初始化 ==========
            let python_sidecar = Arc::new(PythonSidecar::new());
            // 名称含义： Arc = Atomic Reference Counting。
            // 内存模型： 当你用 Arc::new(data) 时，数据会被分配在堆（Heap）上。除了数据本身，堆上还会维护一个原子计数器（Atomic Counter）。
            // 所有权机制： Rust 的核心规则是“一个值只能有一个所有者”。但在多线程场景下（比如多个 Tauri Command 都要访问同一个数据库连接池），你需要多重所有权。
            // 每次调用 Arc::clone(&ptr)，原子计数器 +1（这是一个浅拷贝，只复制指针和增加计数，不复制底层数据，开销极小）。
            // 每次 Arc 离开作用域被 drop，原子计数器 -1。
            // 当计数器归零时，底层数据被物理释放。

            python_sidecar.start(app)?;
            
            // 等待 Python 后端健康检查通过
            println!("[Tauri] Waiting for Python backend to be ready...");
            tauri::async_runtime::block_on(python_sidecar.wait_for_health(20))?;
            println!("[Tauri] Python backend is ready");
            
            // 初始化好的 AppState（包含数据库连接池和 Python sidecar）注入到 Tauri 的全局管理器中
            app.manage(AppState { 
                db: pool,
                python: python_sidecar.clone(),
            });

            // ========== HUD 窗口设置 ==========
            window::setup_hud(app)?;

            Ok(())
        })
        // 初始化 Shell 插件。允许你的 Rust 代码或前端代码执行系统命令（如打开终端、运行脚本）
        .plugin(tauri_plugin_shell::init())
        // 初始化 Opener 插件。用于调用系统默认程序打开文件或 URL（例如用默认浏览器打开网页）
        .plugin(tauri_plugin_opener::init())
        // 初始化全局快捷键插件
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // 注册前端（JavaScript）可以调用的 Rust 函数
        .invoke_handler(tauri::generate_handler![
            greet,
            capture_resource,
            create_task,
            soft_delete_task_command,
            hard_delete_task_command,
            soft_delete_resource_command,
            hard_delete_resource_command,
            get_dashboard,
            get_task_resources,
            seed_demo_data,
            link_resource,
            unlink_resource,
            toggle_hud,
            hide_hud,
            read_clipboard,
            get_assets_path,
            mark_task_as_done_command,
            mark_task_as_todo_command,
            update_task_priority_command,
            update_task_due_date_command,
            update_task_title_command,
            update_task_description_command,
            get_tasks_by_date,
            get_all_tasks,
            update_resource_content_command,
            update_resource_display_name_command,
            check_python_health,
            is_python_running,
            get_python_port
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // 当主窗口关闭时，关闭 Python sidecar
                if let Some(state) = window.try_state::<AppState>() {
                    let python = state.python.clone();
                    tauri::async_runtime::spawn(async move {
                        // Tokio 维护了一个专门用来处理笨重任务的线程池（Blocking Thread Pool）。
                        //spawn_blocking 会把花括号里的代码扔到那个池子里去跑，让核心线程继续去接待别的请求
                        let _ = python.shutdown().await;
                    });
                }
            }
        })
        // 启动应用
        // tauri::generate_context!()：这个宏会读取你的 tauri.conf.json 配置文件，并在编译时将其转化为代码。它告诉构建器应用的名称、版本、图标等信息。
        // 一旦调用 .run()，程序就会进入事件循环（Event Loop），直到你关闭窗口，程序才会退出。
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
