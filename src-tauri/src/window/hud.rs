use tauri::{App, Emitter, Listener, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// 切换 HUD 窗口的显示/隐藏状态
#[tauri::command]
pub async fn toggle_hud(app: tauri::AppHandle) -> Result<(), String> {
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
pub async fn hide_hud(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(hud_window) = app.get_webview_window("hud") {
        hud_window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn setup_hud(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    // 定义快捷键: Option + Space (macOS) / Alt + Space (Windows/Linux)
    // Shortcut::new(修饰键, 主键)
    // Modifiers::ALT 在 macOS 上对应 Option 键
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);

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
}
