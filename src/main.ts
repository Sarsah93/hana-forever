import "./styles.css";
import { DesktopController, type DesktopAction } from "./domain/desktop-controller";
import { STEP } from "./domain/motion";
import type { Facing } from "./domain/actions";
import { findSprite, frameIndex, SPRITES } from "./assets/manifest";
import { ANCHOR, getWindowBridge, inTauri, previewScene, WINDOW_SIZE } from "./platform/window";
const native = inTauri();
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="preview-world" hidden><div id="browser-obstacle"><span>브라우저 창 · 충돌 확인</span></div><div id="taskbar">작업 표시줄 · 발이 닿는 바닥</div></div>
  <section class="mascot" aria-label="하나 데스크톱 마스코트"><canvas id="mascot-canvas" width="256" height="256" aria-label="하나 · 드래그로 옮기기, 더블클릭으로 점프" tabindex="0"></canvas></section>
  <aside class="control-panel" id="control-panel" hidden aria-label="하나 행동 패널">
    <div class="title-row"><strong>하나</strong><button id="close-panel" aria-label="패널 닫기">×</button></div>
    <div class="action-grid" id="actions"></div>
    <label><input type="checkbox" id="auto" checked /> 스스로 돌아다니기</label>
    <div class="action-grid"><button id="reset">바닥으로</button><button id="click-through">클릭 통과</button><button id="quit">종료</button></div>
    <p>← → 걷기 · Space 점프 · F2 패널<br>하나 드래그 · 더블클릭 점프</p><output id="status" aria-live="polite"></output>
  </aside><p id="error" role="alert" hidden></p>`;
const errorBox = document.querySelector<HTMLElement>("#error")!;
const reportError = (error: unknown) => { console.error(error); errorBox.hidden = false; errorBox.textContent = `하나를 준비하지 못했어요: ${String(error)}`; };
const bridge = getWindowBridge(reportError);
const panel = document.querySelector<HTMLElement>("#control-panel")!;
const mascot = document.querySelector<HTMLElement>(".mascot")!;
const canvas = document.querySelector<HTMLCanvasElement>("#mascot-canvas")!;
const ctx = canvas.getContext("2d")!;
const status = document.querySelector<HTMLElement>("#status")!;
const auto = document.querySelector<HTMLInputElement>("#auto")!;
const world = document.querySelector<HTMLElement>("#preview-world")!;
const images = new Map<string, HTMLImageElement>();
let controller: DesktopController;
let dragging = false;
let pointer: { x: number; y: number } | undefined;
let last = performance.now(), accumulator = 0;
let clickThrough = false;
let heldArrow: string | undefined;
function manual(action: DesktopAction, facing: Facing = "front") {
  if (!controller) return;
  controller.autonomous = false; auto.checked = false;
  if (!controller.request(action, facing)) status.textContent = action === "lean" ? "창 옆에 닿은 상태에서 기대요." : "착지한 뒤 다시 해볼게요.";
}
for (const [label, action, facing] of [
  ["쉬기", "idle-stand", "front"], ["두 발 서기", "stand-up", "front"], ["← 걷기", "walk", "left"], ["걷기 →", "walk", "right"],
  ["← 빠르게", "run", "left"], ["빠르게 →", "run", "right"], ["점프", "jump", "front"],
  ["← 기대기", "lean", "left"], ["기대기 →", "lean", "right"]] as const) {
  const button = document.createElement("button"); button.textContent = label;
  button.onclick = () => manual(action, facing); document.querySelector("#actions")!.append(button);
}
auto.onchange = () => { if (controller) controller.autonomous = auto.checked; };
async function togglePanel() {
  if (clickThrough) { await bridge.setIgnoreCursor(false); clickThrough = false; }
  panel.hidden = !panel.hidden;
}
document.querySelector<HTMLButtonElement>("#close-panel")!.onclick = () => { panel.hidden = true; };
document.querySelector<HTMLButtonElement>("#reset")!.onclick = () => controller?.reset();
document.querySelector<HTMLButtonElement>("#quit")!.onclick = () => { void bridge.quit().catch(reportError); };
document.querySelector<HTMLButtonElement>("#click-through")!.onclick = async () => {
  try { await bridge.setIgnoreCursor(true); clickThrough = true; panel.hidden = true; } catch (error) { reportError(error); }
};
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
  controller.motion.velocityX = controller.motion.velocityY = 0;
});
canvas.addEventListener("pointermove", e => {
  if (!dragging || !pointer) return;
  const scale = controller.scene.scaleFactor;
  controller.motion.x += (e.screenX - pointer.x) * scale;
  controller.motion.y += (e.screenY - pointer.y) * scale;
  pointer = { x: e.screenX, y: e.screenY };
});
function release() { if (!dragging) return; dragging = false; pointer = undefined; controller.drop(controller.motion.x, controller.motion.y); }
canvas.addEventListener("pointerup", release); canvas.addEventListener("pointercancel", release); canvas.addEventListener("lostpointercapture", release);
function draw() {
  const { motion, action, facing, age, scene } = controller;
  const clip = findSprite(action, facing), frame = clip.frames[frameIndex(action, age, motion.velocityY / scene.scaleFactor)];
  const dpr = devicePixelRatio || 1;
  if (canvas.width !== Math.round(WINDOW_SIZE * dpr)) { canvas.width = canvas.height = Math.round(WINDOW_SIZE * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, WINDOW_SIZE, WINDOW_SIZE);
  ctx.save(); ctx.translate(ANCHOR.x, ANCHOR.y); ctx.scale(clip.mirror ? -1 : 1, 1);
  const [sx, sy, sw, sh] = frame.rect, [fx, fy] = frame.foot;
  ctx.drawImage(images.get(clip.src)!, sx, sy, sw, sh, (sx - fx) * clip.scale, (sy - fy) * clip.scale, sw * clip.scale, sh * clip.scale);
  ctx.restore();
  const x = motion.x - ANCHOR.x * scene.scaleFactor, y = motion.y - ANCHOR.y * scene.scaleFactor;
  if (native) bridge.position(x, y); else mascot.style.transform = `translate(${x}px, ${y}px)`;
  mascot.dataset.action = action; mascot.dataset.grounded = String(motion.grounded);
  if (!panel.hidden) status.textContent = `${action} · ${facing} · ${motion.grounded ? "접지" : "공중"}`;
}
function render(now: number) {
  accumulator += Math.min((now - last) / 1000, .1); last = now;
  while (accumulator >= STEP) { if (!dragging) controller.tick(STEP); accumulator -= STEP; }
  draw(); requestAnimationFrame(render);
}
function drawPreview() {
  const scene = previewScene(), o = scene.obstacles[0];
  const b = document.querySelector<HTMLElement>("#browser-obstacle")!;
  Object.assign(b.style, { left: `${o.left}px`, top: `${o.top}px`, width: `${o.right-o.left}px`, height: `${o.bottom-o.top}px` });
}
async function refreshScene() {
  try { const scene = await bridge.scene(); if (!dragging) controller.setScene(scene); }
  catch (error) { reportError(error); }
  window.setTimeout(() => void refreshScene(), 250);
}
async function start() {
  await Promise.all([...new Set(SPRITES.map(c => c.src))].map(async src => {
    const image = new Image(); image.src = src; await image.decode(); images.set(src, image);
  }));
  controller = new DesktopController(await bridge.scene());
  if (!native) { world.hidden = false; panel.hidden = false; document.body.classList.add("preview"); drawPreview(); }
  await bridge.onEvent("hana://toggle-panel", () => { clickThrough = false; void togglePanel().catch(reportError); });
  await bridge.onEvent("hana://reset", () => { clickThrough = false; controller.reset(); });
  window.addEventListener("resize", () => { if (!native) { controller.setScene(previewScene()); drawPreview(); } });
  last = performance.now(); requestAnimationFrame(render); void refreshScene();
}
void start().catch(reportError);
