use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, PhysicalPosition, Position};

#[tauri::command]
fn move_mascot_by(window: tauri::Window, dx: i32, dy: i32) -> Result<(), String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    window.set_position(Position::Physical(PhysicalPosition::new(position.x + dx, position.y + dy)))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_click_through(window: tauri::Window, enabled: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(enabled).map_err(|error| error.to_string())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// The mascot window has no decorations and is kept out of the taskbar, so the tray
/// icon is the only always-available way to reach it. Keep it minimal but complete.
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let toggle_panel = MenuItem::with_id(app, "toggle-panel", "행동 패널 열기/닫기 (F2)", true, None::<&str>)?;
    let recenter = MenuItem::with_id(app, "recenter", "화면 중앙으로 데려오기", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "하나 보내주기 (종료)", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle_panel, &recenter, &quit])?;

    TrayIconBuilder::with_id("hana-tray")
        .icon(app.default_window_icon().expect("bundle icon").clone())
        .tooltip("Hana Forever")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "toggle-panel" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("hana://toggle-panel", ());
                }
            }
            "recenter" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.center();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![move_mascot_by, set_click_through, quit_app])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main mascot window");
            window.set_always_on_top(true)?;
            build_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Hana Forever");
}
