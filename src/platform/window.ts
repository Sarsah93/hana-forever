export interface WindowBridge {
  moveBy(dx: number, dy: number): Promise<void>;
  setIgnoreCursor(enabled: boolean): Promise<void>;
}

/** Browser preview deliberately remains usable; Tauri supplies real desktop movement. */
export function getWindowBridge(): WindowBridge {
  return {
    async moveBy(dx, dy) {
      const tauri = (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      if (!tauri) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("move_mascot_by", { dx: Math.round(dx), dy: Math.round(dy) });
    },
    async setIgnoreCursor(enabled) {
      const tauri = (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      if (!tauri) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_click_through", { enabled });
    }
  };
}
