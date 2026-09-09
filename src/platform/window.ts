import type { DesktopScene } from "../domain/motion";
export const WINDOW_SIZE = 256;
export const ANCHOR = { x: 128, y: 248 };
export function inTauri(): boolean { return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__); }
export interface WindowBridge {
  scene(): Promise<DesktopScene>;
  position(x: number, y: number): void;
  flush(): Promise<void>;
  setIgnoreCursor(enabled: boolean): Promise<void>;
  quit(): Promise<void>;
  onEvent(event: string, handler: () => void): Promise<void>;
}
export function previewScene(): DesktopScene {
  return { workArea: { left: 0, top: 0, right: innerWidth, bottom: innerHeight - 40 }, scaleFactor: 1,
    obstacles: [{ id: "preview-browser", left: Math.round(innerWidth * .22), top: 80, right: Math.round(innerWidth * .70), bottom: innerHeight - 62 }] };
}
/** Coalesce absolute positions. Never round per-frame deltas or queue stale IPC moves. */
export function getWindowBridge(onError: (error: unknown) => void): WindowBridge {
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
        await invoke("position_mascot", p); previous = key;
      }
    } catch (error) { pending = undefined; onError(error); }
    finally { moving = undefined; }
  }
  return {
    async scene() {
      if (!inTauri()) return previewScene();
      const { invoke } = await import("@tauri-apps/api/core"); return invoke<DesktopScene>("desktop_scene");
    },
    position(x, y) {
      if (!inTauri()) return;
      pending = { x: Math.round(x), y: Math.round(y) };
      moving ??= drain();
    },
    async flush() { await moving; },
    async setIgnoreCursor(enabled) {
      if (!inTauri()) return;
      const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_click_through", { enabled });
    },
    async quit() { if (inTauri()) { const { invoke } = await import("@tauri-apps/api/core"); await invoke("quit_app"); } },
    async onEvent(event, handler) {
      if (!inTauri()) return;
      const { listen } = await import("@tauri-apps/api/event"); await listen(event, handler);
    }
  };
}
