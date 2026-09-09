import type { DesktopScene, Point } from "../domain/motion";
import type { HanaSettings, PanelState } from "../domain/settings";
/** Mascot window in CSS pixels; the feet anchor leaves room above for the two-leg stand and a thought bubble beside the head. */
export const WINDOW = { width: 320, height: 300 };
export const ANCHOR = { x: 160, y: 290 };
/** Action panel window in CSS pixels. */
export const PANEL_SIZE = { width: 320, height: 470 };
export function inTauri(): boolean { return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__); }
export interface WindowBridge {
  scene(): Promise<DesktopScene>;
  /** Global cursor in physical desktop pixels, undefined in the browser preview. */
  cursor(): Promise<Point | undefined>;
  position(x: number, y: number): void;
  flush(): Promise<void>;
  setIgnoreCursor(enabled: boolean): Promise<void>;
  /** Hide/show the mascot window (focus mode with no room). */
  setVisible(visible: boolean): Promise<void>;
  quit(): Promise<void>;
  onEvent<T = unknown>(event: string, handler: (payload: T) => void): Promise<void>;
  panelShow(x: number, y: number): Promise<void>;
  panelHide(): Promise<void>;
  panelMove(x: number, y: number): void;
  panelVisible(): Promise<boolean>;
  /** Current outer position of the panel window in physical pixels (the user may have dragged it). */
  panelPosition(): Promise<Point | undefined>;
  panelState(state: PanelState): Promise<void>;
  syncTray(settings: HanaSettings): Promise<void>;
}
/** Browser preview: two side-by-side "monitors" — the right one has no taskbar, so its floor is lower. */
export function previewScene(): DesktopScene {
  const split = Math.round(innerWidth * .64);
  const left = { id: "preview-a", primary: true, scaleFactor: 1, workArea: { left: 0, top: 0, right: split, bottom: innerHeight - 40 } };
  const right = { id: "preview-b", scaleFactor: 1, workArea: { left: split, top: 0, right: innerWidth, bottom: innerHeight - 6 } };
  return { workArea: left.workArea, scaleFactor: 1, monitors: [left, right],
    obstacles: [{ id: "preview-browser", left: Math.round(innerWidth * .18), top: 80, right: Math.round(innerWidth * .50), bottom: innerHeight - 62 }] };
}
/** Coalesce absolute positions. Never round per-frame deltas or queue stale IPC moves. */
function coalescedMover(command: string, onError: (error: unknown) => void) {
  let pending: { x: number; y: number } | undefined;
  let moving: Promise<void> | undefined;
  let previous = "";
  async function drain() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      while (pending) {
        const p = pending; pending = undefined;
        const key = `${p.x},${p.y}`;
        if (key === previous) continue;
        await invoke(command, p); previous = key;
      }
    } catch (error) { pending = undefined; onError(error); }
    finally { moving = undefined; }
  }
  return {
    move(x: number, y: number) { pending = { x: Math.round(x), y: Math.round(y) }; moving ??= drain(); },
    async flush() { await moving; }
  };
}
export function getWindowBridge(onError: (error: unknown) => void): WindowBridge {
  const mascot = coalescedMover("position_mascot", onError);
  const panel = coalescedMover("panel_move", onError);
  const invoke = async <T,>(command: string, args?: Record<string, unknown>) => {
    const api = await import("@tauri-apps/api/core"); return api.invoke<T>(command, args);
  };
  return {
    async scene() { return inTauri() ? invoke<DesktopScene>("desktop_scene") : previewScene(); },
    async cursor() {
      if (!inTauri()) return undefined;
      const p = await invoke<[number, number]>("cursor_position"); return { x: p[0], y: p[1] };
    },
    position(x, y) { if (inTauri()) mascot.move(x, y); },
    async flush() { await mascot.flush(); },
    async setIgnoreCursor(enabled) { if (inTauri()) await invoke("set_click_through", { enabled }); },
    async setVisible(visible) { if (inTauri()) await invoke("set_mascot_visible", { visible }); },
    async quit() { if (inTauri()) await invoke("quit_app"); },
    async onEvent(event, handler) {
      if (!inTauri()) return;
      const { listen } = await import("@tauri-apps/api/event"); await listen(event, e => handler(e.payload as never));
    },
    async panelShow(x, y) { if (inTauri()) await invoke("panel_show", { x: Math.round(x), y: Math.round(y) }); },
    async panelHide() { if (inTauri()) await invoke("panel_hide"); },
    panelMove(x, y) { if (inTauri()) panel.move(x, y); },
    async panelVisible() { return inTauri() ? invoke<boolean>("panel_visible") : false; },
    async panelPosition() {
      if (!inTauri()) return undefined;
      const p = await invoke<[number, number] | null>("panel_position"); return p ? { x: p[0], y: p[1] } : undefined;
    },
    async panelState(state) { if (inTauri()) await invoke("panel_state", { state }); },
    async syncTray(settings) { if (inTauri()) await invoke("sync_tray", { settings: { lunch: settings.lunch, leave: settings.leave, reminders: settings.reminders, focus: settings.focus } }); }
  };
}
