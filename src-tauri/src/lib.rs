mod commands;
mod db;

use std::fs;

use tauri::{Emitter, Listener, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub use commands::{
    capture_resource, create_task, get_dashboard, get_task_resources, link_resource,
    seed_demo_data, unlink_resource,
};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// 切换 HUD 窗口的显示/隐藏状态
#[tauri::command]
async fn toggle_hud(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(hud_window) = app.get_webview_window("hud") {
        if hud_window.is_visible().unwrap_or(false) {
            hud_window.hide().map_err(|e| e.to_string())?;
        } else {
            hud_window.show().map_err(|e| e.to_string())?;
            hud_window.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// 隐藏 HUD 窗口
#[tauri::command]
async fn hide_hud(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(hud_window) = app.get_webview_window("hud") {
        hud_window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Clone)]
pub struct AppState {
    pub db: db::DbPool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 定义快捷键: Option + Space (macOS) / Alt + Space (Windows/Linux)
    // Shortcut::new(修饰键, 主键)
    // Modifiers::ALT 在 macOS 上对应 Option 键
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // move: 将 shortcut 的所有权移入闭包，因为闭包需要 'static 生命周期
        .setup(move |app| {
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
            // 初始化好的 AppState（包含数据库连接池）注入到 Tauri 的全局管理器中
            // 以后你的 greet 或 capture_resource 命令只要在参数里写 state: State<AppState>，Tauri 就会自动把这个存好的数据库连接给你
            app.manage(AppState { db: pool });

            // ========== 全局快捷键注册 ==========
            // 注册 Option + Space 快捷键来切换 HUD 窗口
            // on_shortcut: 当快捷键被触发时执行回调
            app.global_shortcut().on_shortcut(shortcut, {
                // clone app_handle，因为闭包需要拥有自己的引用
                let app_handle = app.handle().clone();
                move |_app, _shortcut, event| {
                    // 只在按下时触发（避免按下和释放都触发）
                    // ShortcutState::Pressed 表示按键按下，ShortcutState::Released 表示按键释放
                    if event.state == ShortcutState::Pressed {
                        // get_webview_window: 根据 label 获取窗口实例
                        // "hud" 是在 tauri.conf.json 中配置的窗口 label
                        if let Some(hud_window) = app_handle.get_webview_window("hud") {
                            if hud_window.is_visible().unwrap_or(false) {
                                // 窗口可见则隐藏
                                let _ = hud_window.hide();
                            } else {
                                // 窗口不可见则显示并聚焦
                                let _ = hud_window.show();
                                let _ = hud_window.set_focus();
                                // emit: 向前端发送事件，通知前端聚焦输入框
                                // 前端通过 listen("hud-focus", ...) 监听此事件
                                let _ = hud_window.emit("hud-focus", ());
                            }
                        }
                    }
                }
            })?;

            // ========== HUD 窗口失焦自动隐藏 ==========
            // listen: 监听前端发送的事件
            // 当前端调用 emit("hud-blur") 时，这里的回调会被触发
            let app_handle = app.handle().clone();
            app.listen("hud-blur", move |_event| {
                if let Some(hud_window) = app_handle.get_webview_window("hud") {
                    let _ = hud_window.hide();
                }
            });

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
            get_dashboard,
            get_task_resources,
            seed_demo_data,
            link_resource,
            unlink_resource,
            toggle_hud,
            hide_hud
        ])
        // 启动应用
        // tauri::generate_context!()：这个宏会读取你的 tauri.conf.json 配置文件，并在编译时将其转化为代码。它告诉构建器应用的名称、版本、图标等信息。
        // 一旦调用 .run()，程序就会进入事件循环（Event Loop），直到你关闭窗口，程序才会退出。
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
