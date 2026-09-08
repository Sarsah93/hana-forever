use tauri::{Manager, Position, PhysicalPosition};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![move_mascot_by, set_click_through])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main mascot window");
            window.set_always_on_top(true)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Hana Forever");
}
