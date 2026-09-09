import "./styles.css";
import { ACTION_LABEL, DesktopController, type ActionRequest } from "./domain/desktop-controller";
import { STEP, type Point, type Rect } from "./domain/motion";
import type { Facing } from "./domain/actions";
import { findSprite, frameBounds, frameIndex, SPRITES } from "./assets/manifest";
import { NEED_LABEL } from "./domain/needs";
import { normalizeSettings, SETTINGS_KEY, type HanaSettings, type PanelCommand, type PanelState } from "./domain/settings";
import { PettingDetector } from "./domain/petting";
import { drawBubble } from "./ui/bubble";
import { mountPanel } from "./ui/panel-view";
import { ANCHOR, getWindowBridge, inTauri, PANEL_SIZE, previewScene, WINDOW } from "./platform/window";
const native = inTauri();
const FIRED_KEY = "hana.reminders.fired";
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="preview-world" hidden>
    <div id="monitor-b"><span>두 번째 모니터 · 작업 표시줄 없음(바닥이 더 낮음)</span></div>
    <div id="browser-obstacle"><span>브라우저 창 · 충돌 확인</span></div>
    <div id="taskbar">작업 표시줄 · 발이 닿는 바닥</div>
  </div>
  <section class="mascot" aria-label="하나 데스크톱 마스코트"><canvas id="mascot-canvas" width="${WINDOW.width}" height="${WINDOW.height}" aria-label="하나 · 드래그로 옮기기, 더블클릭으로 점프, 머리 위에서 문지르면 쓰다듬기" tabindex="0"></canvas></section>
  <aside class="control-panel preview-panel" id="preview-panel" hidden aria-label="하나 액션 패널"></aside>
  <p id="error" role="alert" hidden></p>`;
const errorBox = document.querySelector<HTMLElement>("#error")!;
const reportError = (error: unknown) => { console.error(error); errorBox.hidden = false; errorBox.textContent = `하나를 준비하지 못했어요: ${String(error)}`; void debugLog(`error: ${String(error)}`); };
async function debugLog(message: string) {
  if (!native) return;
  try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("debug_log", { message }); } catch { /* logging only */ }
}
const bridge = getWindowBridge(reportError);
const mascot = document.querySelector<HTMLElement>(".mascot")!;
const canvas = document.querySelector<HTMLCanvasElement>("#mascot-canvas")!;
const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
const world = document.querySelector<HTMLElement>("#preview-world")!;
const previewPanel = document.querySelector<HTMLElement>("#preview-panel")!;
const images = new Map<string, HTMLImageElement>();
let controller: DesktopController;
let dragging = false;
let pointer: Point | undefined;
let last = performance.now(), accumulator = 0;
let heldArrow: string | undefined;
/** Manual "클릭 통과": everything passes through until the tray restores it. Otherwise only transparent pixels do. */
let forcedClickThrough = false;
let ignoringCursor = false;
let cursor: Point | undefined;
let overHead = false;
const petting = new PettingDetector();
let drawn: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
let headRect: Rect | undefined;
let windowPos = { x: 0, y: 0 };
let panelOpen = false;
let panelOffset: { dx: number; dy: number } | undefined;
let panelView: ReturnType<typeof mountPanel> | undefined;
let statusNote = "";
let lastPanelPush = 0, lastPanelJson = "";
let settings: HanaSettings = loadSettings();
let shownHidden = false;
function loadSettings(): HanaSettings {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")); } catch { return normalizeSettings({}); }
}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ } }
function applySettings(patch: Partial<HanaSettings>) {
  const before = settings;
  settings = normalizeSettings({ ...settings, ...patch });
  if (controller) controller.settings = settings;
  saveSettings();
  if (before.lunch !== settings.lunch || before.leave !== settings.leave || before.reminders !== settings.reminders || before.focus !== settings.focus) void bridge.syncTray(settings).catch(reportError);
  if (settings.panelTracking && !before.panelTracking && panelOpen && native) {
    void bridge.panelPosition().then(p => { if (p) panelOffset = { dx: p.x - windowPos.x, dy: p.y - windowPos.y }; }).catch(() => { /* keep previous offset */ });
  }
  pushPanelState(true);
}
function statusText() {
  if (!controller) return "";
  if (controller.hidden) return "집중 모드 · 빈 자리가 없어 숨어 있어요 (자리가 나면 돌아와요)";
  const { motion, action, facing } = controller;
  const marks = [settings.focus ? "집중 모드" : "", controller.petting ? "쓰다듬는 중" : "", controller.watchingCursor ? "커서 구경" : "", statusNote].filter(Boolean);
  return `${ACTION_LABEL[action]} · ${facing === "left" ? "왼쪽" : facing === "right" ? "오른쪽" : "정면"} · ${motion.grounded ? "접지" : "공중"}${marks.length ? " · " + marks.join(" · ") : ""}`;
}
function panelState(): PanelState {
  const bubble = controller?.bubble;
  return { settings, status: statusText(), need: bubble ? (bubble.kind === "clock" ? `${bubble.label} ${NEED_LABEL.clock}` : NEED_LABEL[bubble.kind]) : undefined };
}
function pushPanelState(force = false) {
  const now = performance.now();
  if (!force && now - lastPanelPush < 200) return;
  const state = panelState(), json = JSON.stringify(state);
  if (!force && json === lastPanelJson) return;
  lastPanelPush = now; lastPanelJson = json;
  if (native) { if (panelOpen) void bridge.panelState(state).catch(() => { /* panel not open */ }); }
  else panelView?.setState(state);
}
function note(text: string, seconds = 4) { statusNote = text; window.setTimeout(() => { if (statusNote === text) statusNote = ""; }, seconds * 1000); pushPanelState(true); }
function manual(action: ActionRequest, facing: Facing = "front") {
  if (!controller) return;
  controller.holdAutonomy(25);
  if (action === "rest") { if (controller.motion.grounded && controller.action !== "jump") controller.rest(); else note("착지한 뒤 다시 해볼게요."); }
  else if (!controller.request(action, facing)) note(action === "lean" ? "창 옆에 닿은 상태에서 기대요." : "착지한 뒤 다시 해볼게요.");
  pushPanelState(true);
}
/** Put the panel beside Hana on the roomier side, bottom-aligned with her feet, inside the current work area. */
function placePanel() {
  const dpr = devicePixelRatio || 1, m = controller.currentMonitor().workArea;
  const pw = PANEL_SIZE.width * dpr, ph = PANEL_SIZE.height * dpr, gap = 10 * dpr;
  const ww = WINDOW.width * dpr, wh = WINDOW.height * dpr;
  const rightX = windowPos.x + ww + gap, leftX = windowPos.x - pw - gap;
  const fitsRight = rightX + pw <= m.right, fitsLeft = leftX >= m.left;
  let x = fitsRight ? rightX : fitsLeft ? leftX : (m.right - rightX < leftX - m.left ? Math.max(m.left, leftX) : Math.min(rightX, m.right - pw));
  x = Math.max(m.left, Math.min(m.right - pw, x));
  const y = Math.max(m.top, Math.min(m.bottom - ph, windowPos.y + wh - ph));
  panelOffset = { dx: x - windowPos.x, dy: y - windowPos.y };
  return { x, y };
}
async function togglePanel(open?: boolean) {
  if (!controller) return;
  if (forcedClickThrough) { forcedClickThrough = false; ignoringCursor = false; await bridge.setIgnoreCursor(false); }
  const next = open ?? !panelOpen;
  if (native) {
    if (next) { const p = placePanel(); void debugLog(`panel show at ${p.x},${p.y}`); await bridge.panelShow(p.x, p.y); panelOpen = true; pushPanelState(true); }
    else { void debugLog("panel hide"); await bridge.panelHide(); panelOpen = false; }
  } else { previewPanel.hidden = !next; panelOpen = next; pushPanelState(true); }
}
function handleCommand(command: PanelCommand) {
  if (!controller) { if (command.type === "ready") panelOpen = true; return; }
  switch (command.type) {
    case "ready": panelOpen = true; pushPanelState(true); break;
    case "action": manual(command.action, command.facing); break;
    case "interact": controller.holdAutonomy(20); note(controller.interact(command.kind), 5); break;
    case "settings": applySettings(command.patch); break;
    case "reset": controller.reset(); break;
    case "click-through": forcedClickThrough = true; void bridge.setIgnoreCursor(true).then(() => { ignoringCursor = true; }).catch(reportError); void togglePanel(false); break;
    case "quit": void bridge.quit().catch(reportError); break;
    case "close": void togglePanel(false).catch(reportError); break;
  }
}
window.addEventListener("keydown", e => {
  if ((e.target as HTMLElement)?.matches("input")) return;
  if (e.key === "F2") { e.preventDefault(); void togglePanel().catch(reportError); }
  if (e.code === "Space" && !e.repeat) { e.preventDefault(); manual("jump"); }
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault(); if (!e.repeat) { heldArrow = e.key; manual("walk", e.key === "ArrowLeft" ? "left" : "right"); }
  }
});
window.addEventListener("keyup", e => {
  if (e.key === heldArrow) { heldArrow = undefined; if (controller?.action === "walk") controller.request("idle-stand"); }
});
window.addEventListener("blur", () => { if (heldArrow && controller?.action === "walk") controller.request("idle-stand"); heldArrow = undefined; });
canvas.addEventListener("dblclick", () => manual("jump"));
canvas.addEventListener("contextmenu", e => { e.preventDefault(); void togglePanel().catch(reportError); });
canvas.addEventListener("pointerdown", e => {
  if (e.button !== 0 || !controller) return;
  dragging = true; pointer = { x: e.screenX, y: e.screenY }; canvas.setPointerCapture(e.pointerId); canvas.focus();
  petting.reset(); controller.setPetting(false);
  controller.motion.velocityX = controller.motion.velocityY = 0;
});
const inside = (r: Rect | undefined, x: number, y: number) => Boolean(r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
canvas.addEventListener("pointermove", e => {
  if (dragging && pointer) {
    const scale = controller.currentScale();
    controller.motion.x += (e.screenX - pointer.x) * scale;
    controller.motion.y += (e.screenY - pointer.y) * scale;
    pointer = { x: e.screenX, y: e.screenY };
    return;
  }
  if (!controller) return;
  overHead = inside(headRect, e.offsetX, e.offsetY);
  if (overHead && petting.move(performance.now() / 1000, { x: e.offsetX, y: e.offsetY })) controller.setPetting(true);
});
canvas.addEventListener("pointerleave", () => { overHead = false; });
function release() { if (!dragging) return; dragging = false; pointer = undefined; controller.drop(controller.motion.x, controller.motion.y); }
canvas.addEventListener("pointerup", release); canvas.addEventListener("pointercancel", release); canvas.addEventListener("lostpointercapture", release);
function draw() {
  if (controller.hidden !== shownHidden) {
    shownHidden = controller.hidden;
    if (native) void bridge.setVisible(!shownHidden).catch(reportError); else mascot.hidden = shownHidden;
  }
  if (controller.hidden) return;
  const { motion, action, facing, age } = controller;
  const clip = findSprite(action, facing);
  const index = controller.frameOverride ?? frameIndex(action, age, motion.velocityY / controller.currentScale());
  const frame = clip.frames[index];
  const dpr = devicePixelRatio || 1;
  if (canvas.width !== Math.round(WINDOW.width * dpr) || canvas.height !== Math.round(WINDOW.height * dpr)) { canvas.width = Math.round(WINDOW.width * dpr); canvas.height = Math.round(WINDOW.height * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, WINDOW.width, WINDOW.height);
  ctx.save(); ctx.translate(ANCHOR.x, ANCHOR.y); ctx.scale(clip.mirror ? -1 : 1, 1);
  const [sx, sy, sw, sh] = frame.rect, [fx, fy] = frame.foot;
  ctx.drawImage(images.get(clip.src)!, sx, sy, sw, sh, (sx - fx) * clip.scale, (sy - fy) * clip.scale, sw * clip.scale, sh * clip.scale);
  ctx.restore();
  const b = frameBounds(clip, index);
  drawn = { left: ANCHOR.x + b.left, top: ANCHOR.y + b.top, right: ANCHOR.x + b.left + b.width, bottom: ANCHOR.y + b.top + b.height };
  const headShare = action === "stand-up" ? .3 : action === "sit" || action === "scratch" ? .38 : .45;
  headRect = { left: drawn.left, top: drawn.top, right: drawn.right, bottom: drawn.top + b.height * headShare };
  const bubble = controller.bubble;
  if (bubble) drawBubble(ctx, bubble, { headX: (drawn.left + drawn.right) / 2, headTop: drawn.top, side: controller.bubbleSide }, WINDOW.width);
  const scale = controller.currentScale();
  const x = motion.x - ANCHOR.x * (native ? dpr : scale), y = motion.y - ANCHOR.y * (native ? dpr : scale);
  if (native) {
    if (Math.round(x) !== windowPos.x || Math.round(y) !== windowPos.y) {
      windowPos = { x: Math.round(x), y: Math.round(y) }; bridge.position(x, y);
      if (panelOpen && settings.panelTracking && panelOffset) bridge.panelMove(windowPos.x + panelOffset.dx, windowPos.y + panelOffset.dy);
    }
  } else mascot.style.transform = `translate(${x}px, ${y}px)`;
  mascot.dataset.action = action; mascot.dataset.grounded = String(motion.grounded);
}
function handleEvents() {
  for (const e of controller.drainEvents()) {
    if (e.type === "need") note(`💭 ${e.detail}`, 8);
    else if (e.type === "reminder") { note(`🕛 ${e.detail} 알림`, 8); try { localStorage.setItem(FIRED_KEY, JSON.stringify(controller.needs.fired)); } catch { /* ignore */ } }
    else if (e.type === "petting") note(e.detail === "wanted" ? "기다리던 쓰다듬기! 헤헤" : "헤헤, 좋아요", 4);
    else if (e.type === "focus") note({ on: "집중 모드: 창을 피해 조용히 있을게요", hidden: "집중 모드: 빈 자리가 없어 잠시 숨어요", back: "빈 자리가 생겨 돌아왔어요", moved: "창을 피해 자리를 옮겼어요", off: "집중 모드 해제: 빈 자리로 돌아왔어요" }[e.detail] ?? e.detail, 5);
  }
}
function render(now: number) {
  accumulator += Math.min((now - last) / 1000, .1); last = now;
  const wasPetting = petting.active;
  petting.update(now / 1000, overHead);
  if (wasPetting && !petting.active) controller.setPetting(false);
  while (accumulator >= STEP) { if (!dragging) controller.tick(STEP, { cursor, now: Date.now() }); accumulator -= STEP; }
  draw(); handleEvents(); pushPanelState(); requestAnimationFrame(render);
}
function drawPreview() {
  const scene = previewScene(), o = scene.obstacles[0], b = scene.monitors![1].workArea;
  const el = document.querySelector<HTMLElement>("#browser-obstacle")!;
  Object.assign(el.style, { left: `${o.left}px`, top: `${o.top}px`, width: `${o.right - o.left}px`, height: `${o.bottom - o.top}px` });
  const mb = document.querySelector<HTMLElement>("#monitor-b")!;
  Object.assign(mb.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.right - b.left}px`, height: `${b.bottom - b.top}px` });
  document.querySelector<HTMLElement>("#taskbar")!.style.right = `${innerWidth - b.left}px`;
}
async function refreshScene() {
  try { const scene = await bridge.scene(); if (!dragging) controller.setScene(scene); }
  catch (error) { reportError(error); }
  window.setTimeout(() => void refreshScene(), 250);
}
/** Global cursor drives gaze tracking and per-pixel click-through: transparent parts of the window let clicks reach the desktop. */
async function pollCursor() {
  try {
    const c = await bridge.cursor();
    cursor = c;
    if (c) {
      const dpr = devicePixelRatio || 1;
      const lx = (c.x - windowPos.x) / dpr, ly = (c.y - windowPos.y) / dpr;
      let hit = false;
      if (lx >= 0 && ly >= 0 && lx < WINDOW.width && ly < WINDOW.height) {
        hit = ctx.getImageData(Math.floor(lx * dpr), Math.floor(ly * dpr), 1, 1).data[3] > 12;
      }
      if (!hit) overHead = false;
      const shouldIgnore = forcedClickThrough || (!dragging && !hit);
      if (shouldIgnore !== ignoringCursor) { ignoringCursor = shouldIgnore; await bridge.setIgnoreCursor(shouldIgnore); }
    }
  } catch { /* keep polling */ }
  window.setTimeout(() => void pollCursor(), 33);
}
async function start() {
  await Promise.all([...new Set(SPRITES.map(c => c.src))].map(async src => {
    const image = new Image(); image.src = src; await image.decode(); images.set(src, image);
  }));
  controller = new DesktopController(await bridge.scene());
  controller.settings = settings;
  try { controller.needs.fired = JSON.parse(localStorage.getItem(FIRED_KEY) ?? "{}"); } catch { /* ignore */ }
  if (!native) {
    world.hidden = false; document.body.classList.add("preview"); drawPreview();
    panelView = mountPanel(previewPanel, { send: handleCommand }, { native: false });
    previewPanel.hidden = false; panelOpen = true; pushPanelState(true);
    window.addEventListener("mousemove", e => { cursor = { x: e.clientX, y: e.clientY }; });
  } else {
    await bridge.onEvent<PanelCommand>("hana://panel-command", handleCommand);
    await bridge.onEvent<Partial<HanaSettings>>("hana://settings", patch => applySettings(patch));
    await bridge.onEvent("hana://toggle-panel", () => { void togglePanel().catch(reportError); });
    await bridge.onEvent("hana://reset", () => { forcedClickThrough = false; ignoringCursor = false; controller.reset(); });
    await bridge.onEvent("hana://panel-closed", () => { panelOpen = false; });
    void bridge.syncTray(settings).catch(reportError);
    void pollCursor();
  }
  window.addEventListener("resize", () => { if (!native) { controller.setScene(previewScene()); drawPreview(); } });
  last = performance.now(); requestAnimationFrame(render); void refreshScene();
}
void start().catch(reportError);
