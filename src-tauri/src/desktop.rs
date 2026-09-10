use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rect { pub left: i32, pub top: i32, pub right: i32, pub bottom: i32 }
/// A top-level window Hana can touch, front-to-back. `class`/`title` are for the dev log only (what did she lean on?).
#[derive(Serialize)]
pub struct Obstacle { pub id: String, #[serde(flatten)] pub rect: Rect, pub class: String, pub title: String }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo { pub id: String, pub work_area: Rect, pub scale_factor: f64, pub primary: bool }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene { pub work_area: Rect, pub obstacles: Vec<Obstacle>, pub scale_factor: f64, pub monitors: Vec<MonitorInfo> }

impl Rect {
    fn intersects(&self, other: &Rect) -> bool {
        self.right > other.left && self.left < other.right && self.bottom > other.top && self.top < other.bottom
    }
}

/// Every display's work area (taskbar excluded) so Hana can walk from one monitor onto the next.
fn monitors(window: &tauri::Window) -> Result<Vec<MonitorInfo>, String> {
    let primary = window.primary_monitor().map_err(|e| e.to_string())?.and_then(|m| m.name().cloned());
    let list = window.available_monitors().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for (index, m) in list.iter().enumerate() {
        let wa = m.work_area();
        let rect = Rect { left: wa.position.x, top: wa.position.y, right: wa.position.x + wa.size.width as i32, bottom: wa.position.y + wa.size.height as i32 };
        let name = m.name().cloned().unwrap_or_else(|| format!("monitor-{index}"));
        out.push(MonitorInfo { id: name.clone(), work_area: rect, scale_factor: m.scale_factor(), primary: primary.as_ref() == Some(&name) });
    }
    if out.is_empty() { return Err("모니터가 없습니다".into()); }
    if !out.iter().any(|m| m.primary) { out[0].primary = true; }
    Ok(out)
}

fn current_work_area(window: &tauri::Window, monitors: &[MonitorInfo]) -> MonitorInfo {
    let name = window.current_monitor().ok().flatten().and_then(|m| m.name().cloned());
    monitors.iter().find(|m| Some(&m.id) == name.as_ref()).or_else(|| monitors.iter().find(|m| m.primary)).cloned().unwrap_or_else(|| monitors[0].clone())
}

#[cfg(target_os = "windows")]
mod windows_desktop {
    use super::*;
    use std::mem::size_of;
    use windows_sys::Win32::{Foundation::{HWND, LPARAM, RECT}, Graphics::Dwm::{DwmGetWindowAttribute, DwmSetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS}, UI::WindowsAndMessaging::{EnumWindows, GetClassNameW, GetLayeredWindowAttributes, GetWindowLongW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, GWL_EXSTYLE, LWA_ALPHA, WS_EX_LAYERED, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT}};

    struct Enumeration { obstacles: Vec<Obstacle>, process_id: u32, areas: Vec<Rect> }
    unsafe extern "system" fn collect(hwnd: HWND, param: LPARAM) -> i32 {
        let data = &mut *(param as *mut Enumeration);
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == data.process_id || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 { return 1; }
        // Tool windows, click-through overlays (game/voice overlays, capture helpers) and fully transparent layered
        // windows sit over the desktop without being anything Hana could lean on or stand on.
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if ex & (WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT) != 0 { return 1; }
        if ex & WS_EX_LAYERED != 0 {
            let (mut key, mut alpha, mut flags) = (0u32, 0u8, 0u32);
            if GetLayeredWindowAttributes(hwnd, &mut key, &mut alpha, &mut flags) != 0 && flags & LWA_ALPHA != 0 && alpha < 16 { return 1; }
        }
        let mut class = [0u16; 256];
        let count = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32);
        let name = String::from_utf16_lossy(&class[..count.max(0) as usize]);
        if matches!(name.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "tooltips_class32") { return 1; }
        let mut cloaked: u32 = 0;
        if DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED as u32, &mut cloaked as *mut _ as *mut _, size_of::<u32>() as u32) >= 0 && cloaked != 0 { return 1; }
        let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        if DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS as u32, &mut rect as *mut _ as *mut _, size_of::<RECT>() as u32) < 0 && GetWindowRect(hwnd, &mut rect) == 0 { return 1; }
        if rect.right - rect.left < 80 || rect.bottom - rect.top < 60 { return 1; }
        let bounds = Rect { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        if !data.areas.iter().any(|a| bounds.intersects(a)) { return 1; }
        // EnumWindows is top-to-bottom in Z order. Fully occluded windows contribute no hidden faces.
        if data.obstacles.iter().any(|o| o.rect.left <= bounds.left && o.rect.top <= bounds.top && o.rect.right >= bounds.right && o.rect.bottom >= bounds.bottom) { return 1; }
        let mut text = [0u16; 128];
        let n = GetWindowTextW(hwnd, text.as_mut_ptr(), text.len() as i32);
        let title = String::from_utf16_lossy(&text[..n.max(0) as usize]);
        data.obstacles.push(Obstacle { id: format!("{:x}", hwnd as usize), rect: bounds, class: name, title });
        1
    }
    pub fn obstacles(areas: Vec<Rect>) -> Result<Vec<Obstacle>, String> {
        let mut data = Enumeration { obstacles: Vec::new(), process_id: std::process::id(), areas };
        unsafe {
            if EnumWindows(Some(collect), &mut data as *mut _ as LPARAM) == 0 { return Err("Windows 창 목록을 읽을 수 없습니다".into()); }
        }
        Ok(data.obstacles)
    }
    pub fn suppress_border(window: &tauri::WebviewWindow) {
        if let Ok(hwnd) = window.hwnd() {
            // Windows 11: DWMWA_BORDER_COLOR + DWMWA_COLOR_NONE. Older Windows ignores it.
            let no_border: u32 = 0xfffffffe;
            unsafe { DwmSetWindowAttribute(hwnd.0 as HWND, 34, &no_border as *const _ as *const _, size_of::<u32>() as u32); }
        }
    }
}

#[tauri::command]
pub fn desktop_scene(window: tauri::Window) -> Result<Scene, String> {
    let monitors = monitors(&window)?;
    let current = current_work_area(&window, &monitors);
    #[cfg(target_os = "windows")]
    let obstacles = windows_desktop::obstacles(monitors.iter().map(|m| m.work_area.clone()).collect())?;
    #[cfg(not(target_os = "windows"))]
    let obstacles = Vec::new();
    Ok(Scene { work_area: current.work_area, obstacles, scale_factor: window.scale_factor().map_err(|e| e.to_string())?, monitors })
}

pub fn suppress_border(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    windows_desktop::suppress_border(window);
    #[cfg(not(target_os = "windows"))]
    let _ = window;
}
