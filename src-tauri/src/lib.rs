mod desktop;
use serde::Deserialize;
use std::sync::Mutex;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Position, State, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const LUNCH_OPTIONS: [&str; 4] = ["11:30", "12:00", "12:30", "13:00"];
const LEAVE_OPTIONS: [&str; 5] = ["17:00", "17:30", "18:00", "18:30", "19:00"];

/// Tray check items so the menu can mirror the settings the webview persists (and the OS autostart registration).
struct TrayMenus { reminders: CheckMenuItem<Wry>, focus: CheckMenuItem<Wry>, autostart: CheckMenuItem<Wry>, lunch: Vec<(String, CheckMenuItem<Wry>)>, leave: Vec<(String, CheckMenuItem<Wry>)> }
type Tray = Mutex<Option<TrayMenus>>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReminderSettings { lunch: String, leave: String, reminders: bool, #[serde(default)] focus: bool }

#[tauri::command]
fn position_mascot(window: tauri::Window, x: i32, y: i32) -> Result<(), String> {
    window.set_position(Position::Physical(PhysicalPosition::new(x, y))).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_click_through(window: tauri::Window, enabled: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(enabled).map_err(|error| error.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) { app.exit(0); }

/// Focus mode hides the mascot when no window-free spot exists; showing never steals focus.
/// Both directions go through ShowWindow directly: tao only issues a ShowWindow when its own visibility flag
/// changes, so mixing its hide() with a raw show would leave it believing the window is still hidden and
/// silently skip the next hide().
#[tauri::command]
fn set_mascot_visible(window: tauri::Window, visible: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE, SW_SHOWNOACTIVATE};
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        unsafe { ShowWindow(hwnd.0 as _, if visible { SW_SHOWNOACTIVATE } else { SW_HIDE }); }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { if visible { window.show() } else { window.hide() }.map_err(|error| error.to_string()) }
}

/// Global cursor in physical desktop pixels (only coordinates; nothing about what is under it).
#[tauri::command]
fn cursor_position(window: tauri::Window) -> Result<(f64, f64), String> {
    let p = window.cursor_position().map_err(|error| error.to_string())?;
    Ok((p.x, p.y))
}

fn panel(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("panel").ok_or_else(|| "패널 창이 없습니다".to_string())
}

#[tauri::command]
fn panel_show(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    let window = panel(&app)?;
    window.set_position(Position::Physical(PhysicalPosition::new(x, y))).map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

/// Dev-time visibility for webview-side failures: the transparent mascot window has no console.
#[tauri::command]
fn debug_log(message: String) { eprintln!("[hana] {message}"); }

#[tauri::command]
fn panel_hide(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("panel") { window.hide().map_err(|error| error.to_string())?; }
    Ok(())
}

#[tauri::command]
fn panel_move(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("panel") {
        window.set_position(Position::Physical(PhysicalPosition::new(x, y))).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn panel_position(app: AppHandle) -> Option<(i32, i32)> {
    let window = app.get_webview_window("panel")?;
    let p = window.outer_position().ok()?;
    Some((p.x, p.y))
}

#[tauri::command]
fn panel_visible(app: AppHandle) -> bool {
    app.get_webview_window("panel").and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

/// Panel window → mascot window. Payload is opaque JSON; the mascot window validates it.
#[tauri::command]
fn panel_command(app: AppHandle, command: serde_json::Value) -> Result<(), String> {
    app.emit_to("main", "hana://panel-command", command).map_err(|error| error.to_string())
}

/// Mascot window → panel window state snapshot.
#[tauri::command]
fn panel_state(app: AppHandle, state: serde_json::Value) -> Result<(), String> {
    if app.get_webview_window("panel").is_some() {
        app.emit_to("panel", "hana://panel-state", state).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Mirror persisted reminder settings into the tray check items.
#[tauri::command]
fn sync_tray(tray: State<Tray>, settings: ReminderSettings) -> Result<(), String> {
    let guard = tray.lock().map_err(|_| "tray state poisoned".to_string())?;
    if let Some(menus) = guard.as_ref() {
        let _ = menus.reminders.set_checked(settings.reminders);
        let _ = menus.focus.set_checked(settings.focus);
        for (value, item) in &menus.lunch { let _ = item.set_checked(*value == settings.lunch); }
        for (value, item) in &menus.leave { let _ = item.set_checked(*value == settings.leave); }
    }
    Ok(())
}

/// "Run at sign-in" as the OS has it right now (HKCU\...\Run via tauri-plugin-autostart; no admin needed).
fn autostart_enabled(app: &AppHandle) -> bool { app.autolaunch().is_enabled().unwrap_or(false) }

/// Register/unregister autostart, then mirror the real state into the tray and the mascot window (for the panel).
fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<bool, String> {
    let launcher = app.autolaunch();
    if enabled { launcher.enable() } else { launcher.disable() }.map_err(|error| error.to_string())?;
    let now = autostart_enabled(app);
    if let Ok(guard) = app.state::<Tray>().lock() { if let Some(menus) = guard.as_ref() { let _ = menus.autostart.set_checked(now); } }
    let _ = app.emit_to("main", "hana://autostart", now);
    Ok(now)
}

#[tauri::command]
fn autostart_get(app: AppHandle) -> bool { autostart_enabled(&app) }

#[tauri::command]
fn autostart_set(app: AppHandle, enabled: bool) -> Result<bool, String> { apply_autostart(&app, enabled) }

/// The usage guide is a normal, resizable window that is pre-declared and hidden; closing it only hides it.
fn show_guide(app: &AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("guide").ok_or_else(|| "가이드 창이 없습니다".to_string())?;
    let _ = window.center();
    window.show().map_err(|error| error.to_string())?;
    let _ = window.unminimize();
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn guide_show(app: AppHandle) -> Result<(), String> { show_guide(&app) }

#[tauri::command]
fn guide_hide(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("guide") { window.hide().map_err(|error| error.to_string())?; }
    Ok(())
}

fn focus_main(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    let window = app.get_webview_window("main")?;
    let _ = window.set_ignore_cursor_events(false);
    let _ = window.set_focus();
    Some(window)
}

/// The mascot window has no decorations and is kept out of the taskbar, so the tray
/// icon is the only always-available way to reach it. Keep it minimal but complete.
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle_panel = MenuItem::with_id(app, "toggle-panel", "액션 패널 열기/닫기 (F2)", true, None::<&str>)?;
    let recenter = MenuItem::with_id(app, "recenter", "작업 표시줄 위로 데려오기", true, None::<&str>)?;
    let reminders = CheckMenuItem::with_id(app, "reminders", "시간 알림 (벽시계 풍선)", true, true, None::<&str>)?;
    let focus = CheckMenuItem::with_id(app, "focus", "집중 모드 (방해 금지)", true, false, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(app, "autostart", "Windows 시작 시 자동 실행", true, autostart_enabled(app), None::<&str>)?;
    let guide = MenuItem::with_id(app, "guide", "사용법 가이드", true, None::<&str>)?;
    let lunch: Vec<(String, CheckMenuItem<Wry>)> = LUNCH_OPTIONS.iter()
        .map(|value| CheckMenuItem::with_id(app, format!("lunch:{value}"), format!("점심 {value}"), true, *value == "12:00", None::<&str>).map(|item| (value.to_string(), item)))
        .collect::<Result<_, _>>()?;
    let leave: Vec<(String, CheckMenuItem<Wry>)> = LEAVE_OPTIONS.iter()
        .map(|value| CheckMenuItem::with_id(app, format!("leave:{value}"), format!("퇴근 {value}"), true, *value == "18:00", None::<&str>).map(|item| (value.to_string(), item)))
        .collect::<Result<_, _>>()?;
    let mut time_items: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = vec![&reminders];
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    time_items.push(&sep1);
    for (_, item) in &lunch { time_items.push(item); }
    time_items.push(&sep2);
    for (_, item) in &leave { time_items.push(item); }
    let times = Submenu::with_id_and_items(app, "times", "알림 시간", true, &time_items)?;
    let quit = MenuItem::with_id(app, "quit", "하나 보내주기 (종료)", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let sep4 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&toggle_panel, &recenter, &focus, &times, &sep3, &autostart, &guide, &sep4, &quit])?;
    *app.state::<Tray>().lock().expect("tray state") = Some(TrayMenus { reminders: reminders.clone(), focus: focus.clone(), autostart: autostart.clone(), lunch, leave });

    TrayIconBuilder::with_id("hana-tray")
        .icon(app.default_window_icon().expect("bundle icon").clone())
        .tooltip("Hana Forever")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            match id {
                "quit" => app.exit(0),
                "toggle-panel" => { if let Some(window) = focus_main(app) { let _ = window.emit("hana://toggle-panel", ()); } }
                "recenter" => { if let Some(window) = focus_main(app) { let _ = window.emit("hana://reset", ()); } }
                "guide" => { let _ = show_guide(app); }
                "reminders" => {
                    let checked = app.state::<Tray>().lock().ok().and_then(|g| g.as_ref().and_then(|m| m.reminders.is_checked().ok())).unwrap_or(true);
                    let _ = app.emit_to("main", "hana://settings", serde_json::json!({ "reminders": checked }));
                }
                "focus" => {
                    let checked = app.state::<Tray>().lock().ok().and_then(|g| g.as_ref().and_then(|m| m.focus.is_checked().ok())).unwrap_or(false);
                    let _ = app.emit_to("main", "hana://settings", serde_json::json!({ "focus": checked }));
                }
                "autostart" => {
                    let checked = app.state::<Tray>().lock().ok().and_then(|g| g.as_ref().and_then(|m| m.autostart.is_checked().ok())).unwrap_or(false);
                    let _ = apply_autostart(app, checked);
                }
                _ => {
                    if let Some(value) = id.strip_prefix("lunch:") {
                        let _ = app.emit_to("main", "hana://settings", serde_json::json!({ "lunch": value }));
                    } else if let Some(value) = id.strip_prefix("leave:") {
                        let _ = app.emit_to("main", "hana://settings", serde_json::json!({ "leave": value }));
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}

/// Alt+F4 / the close button on a helper window only hides it; the mascot window is told when the panel goes.
fn hide_on_close(app: &AppHandle, label: &str, notify_main: bool) {
    if let Some(window) = app.get_webview_window(label) {
        let handle = app.clone();
        let hide = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = hide.hide();
                if notify_main { let _ = handle.emit_to("main", "hana://panel-closed", ()); }
            }
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(Tray::new(None))
        .invoke_handler(tauri::generate_handler![
            position_mascot, desktop::desktop_scene, set_click_through, quit_app, cursor_position, set_mascot_visible, debug_log,
            panel_show, panel_hide, panel_move, panel_visible, panel_position, panel_command, panel_state, sync_tray,
            autostart_get, autostart_set, guide_show, guide_hide
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main mascot window");
            window.set_always_on_top(true)?;
            window.set_shadow(false)?;
            desktop::suppress_border(&window);
            hide_on_close(app.handle(), "panel", true);
            hide_on_close(app.handle(), "guide", false);
            build_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Hana Forever");
}
