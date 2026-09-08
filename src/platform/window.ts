export interface WindowBridge {
  moveBy(dx: number, dy: number): Promise<void>;
  setIgnoreCursor(enabled: boolean): Promise<void>;
  quit(): Promise<void>;
  onTogglePanel(handler: () => void): Promise<void>;
}

function inTauri(): boolean {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

/** Browser preview deliberately remains usable; Tauri supplies real desktop movement. */
export function getWindowBridge(): WindowBridge {
  return {
    async moveBy(dx, dy) {
      if (!inTauri()) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("move_mascot_by", { dx: Math.round(dx), dy: Math.round(dy) });
    },
    async setIgnoreCursor(enabled) {
      if (!inTauri()) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_click_through", { enabled });
    },
    async quit() {
      if (!inTauri()) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("quit_app");
    },
    async onTogglePanel(handler) {
      if (!inTauri()) return;
      const { listen } = await import("@tauri-apps/api/event");
      await listen("hana://toggle-panel", () => handler());
    }
  };
}
