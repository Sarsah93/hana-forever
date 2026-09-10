import "./guide.css";
/** Entry for the usage guide window: static content plus "Esc / 닫기" → hide (the window is reused, never destroyed). */
async function start() {
  const { invoke } = await import("@tauri-apps/api/core");
  const hide = () => { void invoke("guide_hide").catch(console.error); };
  window.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); hide(); } });
  document.querySelector<HTMLButtonElement>("#close")?.addEventListener("click", hide);
  // In-page anchors: keep the scroll inside the window instead of opening a navigation.
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
    a.addEventListener("click", e => { e.preventDefault(); document.querySelector(a.getAttribute("href")!)?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  }
}
void start().catch(console.error);
