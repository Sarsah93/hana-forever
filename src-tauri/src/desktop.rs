use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rect { pub left: i32, pub top: i32, pub right: i32, pub bottom: i32 }
#[derive(Serialize)]
pub struct Obstacle { pub id: String, #[serde(flatten)] pub rect: Rect }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene { pub work_area: Rect, pub obstacles: Vec<Obstacle>, pub scale_factor: f64 }

#[cfg(target_os = "windows")]
mod windows_desktop {
    use super::*;
    use std::mem::size_of;
    use windows_sys::Win32::{Foundation::{HWND, LPARAM, RECT}, Graphics::{Dwm::{DwmGetWindowAttribute, DwmSetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS}, Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST}}, UI::WindowsAndMessaging::{EnumWindows, GetClassNameW, GetWindowLongW, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible, GWL_EXSTYLE, WS_EX_TOOLWINDOW}};

    struct Enumeration { obstacles: Vec<Obstacle>, process_id: u32, work: Rect }
    unsafe extern "system" fn collect(hwnd: HWND, param: LPARAM) -> i32 {
        let data = &mut *(param as *mut Enumeration);
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == data.process_id || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 { return 1; }
        if GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW != 0 { return 1; }
        let mut class = [0u16; 256];
        let count = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32);
        let name = String::from_utf16_lossy(&class[..count.max(0) as usize]);
        if matches!(name.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "tooltips_class32") { return 1; }
        let mut cloaked: u32 = 0;
        if DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED as u32, &mut cloaked as *mut _ as *mut _, size_of::<u32>() as u32) >= 0 && cloaked != 0 { return 1; }
        let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        if DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS as u32, &mut rect as *mut _ as *mut _, size_of::<RECT>() as u32) < 0 && GetWindowRect(hwnd, &mut rect) == 0 { return 1; }
        if rect.right - rect.left < 80 || rect.bottom - rect.top < 60 { return 1; }
        let work = &data.work;
        if rect.right <= work.left || rect.left >= work.right || rect.bottom <= work.top || rect.top >= work.bottom { return 1; }
        let bounds = Rect { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        // EnumWindows is top-to-bottom in Z order. Fully occluded windows contribute no hidden faces.
        if data.obstacles.iter().any(|o| o.rect.left <= bounds.left && o.rect.top <= bounds.top && o.rect.right >= bounds.right && o.rect.bottom >= bounds.bottom) { return 1; }
        data.obstacles.push(Obstacle { id: format!("{:x}", hwnd as usize), rect: bounds });
        1
    }
    pub fn snapshot(window: &tauri::Window) -> Result<Scene, String> {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as HWND;
        let mut info = MONITORINFO { cbSize: size_of::<MONITORINFO>() as u32, rcMonitor: RECT { left: 0, top: 0, right: 0, bottom: 0 }, rcWork: RECT { left: 0, top: 0, right: 0, bottom: 0 }, dwFlags: 0 };
        unsafe {
            if GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &mut info) == 0 { return Err("Windows 작업 영역을 읽을 수 없습니다".into()); }
        }
        let work = Rect { left: info.rcWork.left, top: info.rcWork.top, right: info.rcWork.right, bottom: info.rcWork.bottom };
        let mut data = Enumeration { obstacles: Vec::new(), process_id: std::process::id(), work: work.clone() };
        unsafe {
            if EnumWindows(Some(collect), &mut data as *mut _ as LPARAM) == 0 { return Err("Windows 창 목록을 읽을 수 없습니다".into()); }
        }
        Ok(Scene { work_area: work, obstacles: data.obstacles, scale_factor: window.scale_factor().map_err(|e| e.to_string())? })
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
    #[cfg(target_os = "windows")]
    { windows_desktop::snapshot(&window) }
    #[cfg(not(target_os = "windows"))]
    {
        let m = window.current_monitor().map_err(|e| e.to_string())?.ok_or("모니터가 없습니다")?;
        let p = m.position(); let s = m.size();
        Ok(Scene { work_area: Rect { left: p.x, top: p.y, right: p.x + s.width as i32, bottom: p.y + s.height as i32 }, obstacles: vec![], scale_factor: m.scale_factor() })
    }
}
pub fn suppress_border(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    windows_desktop::suppress_border(window);
    #[cfg(not(target_os = "windows"))]
    let _ = window;
}
