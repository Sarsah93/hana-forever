import "./panel.css";
import { mountPanel } from "./ui/panel-view";
import type { PanelCommand, PanelState } from "./domain/settings";
/** Entry for the separate action-panel window. All state lives in the mascot window; this is a remote control. */
async function start() {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const root = document.querySelector<HTMLElement>("#panel")!;
  const view = mountPanel(root, { send: (command: PanelCommand) => { void invoke("panel_command", { command }).catch(console.error); } }, { native: true });
  await listen<PanelState>("hana://panel-state", event => view.setState(event.payload));
  window.addEventListener("keydown", e => {
    if (e.key === "F2" || e.key === "Escape") { e.preventDefault(); void invoke("panel_command", { command: { type: "close" } }); }
  });
  void invoke("panel_command", { command: { type: "ready" } });
}
void start().catch(error => { console.error(error); document.body.textContent = `패널을 준비하지 못했어요: ${String(error)}`; });
