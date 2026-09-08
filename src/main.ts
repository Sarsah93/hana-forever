import "./styles.css";
import { ACTION_IDS, ACTIONS, type ActionId } from "./domain/actions";
import { MascotMachine } from "./domain/mascot-machine";
import { integrateMotion, type MotionState } from "./domain/motion";
import { findSprite } from "./assets/manifest";
import { getWindowBridge } from "./platform/window";

const app = document.querySelector<HTMLDivElement>("#app")!;
const machine = new MascotMachine();
const bridge = getWindowBridge();
let motion: MotionState = { x: 0, y: 0, velocityX: 0, velocityY: 0 };
let last = performance.now();
let clickThrough = false;

app.innerHTML = `
  <section class="mascot" aria-label="하나 데스크톱 마스코트">
    <div class="sprite-stage" id="sprite-stage">
      <img class="sprite-image" id="mascot-image" alt="두 발로 서서 앞발을 내민 하나" hidden />
      <div class="placeholder-pup" aria-hidden="true">🐩</div>
      <p id="missing-asset">첫 스프라이트를 기다리는 하나</p>
    </div>
    <button class="handle" id="drag-handle" aria-label="하나 이동하기">하나</button>
  </section>
  <aside class="control-panel" aria-label="개발용 행동 선택">
    <div class="title-row"><strong>HANA / dev</strong><button id="click-through">클릭 통과: 끔</button></div>
    <div class="action-grid" id="actions"></div>
  </aside>`;

const actionGrid = document.querySelector<HTMLDivElement>("#actions")!;
for (const id of ACTION_IDS) {
  const button = document.createElement("button");
  button.textContent = id;
  button.onclick = () => machine.transition(id, ACTIONS[id].facing[0]);
  actionGrid.append(button);
}

const clickThroughButton = document.querySelector<HTMLButtonElement>("#click-through")!;
clickThroughButton.onclick = async () => {
  clickThrough = !clickThrough;
  await bridge.setIgnoreCursor(clickThrough);
  clickThroughButton.textContent = `클릭 통과: ${clickThrough ? "켬" : "끔"}`;
};

let dragging = false;
let previousPointer: { x: number; y: number } | undefined;
const handle = document.querySelector<HTMLButtonElement>("#drag-handle")!;
handle.addEventListener("pointerdown", (event) => { dragging = true; previousPointer = { x: event.screenX, y: event.screenY }; handle.setPointerCapture(event.pointerId); });
handle.addEventListener("pointermove", async (event) => {
  if (!dragging || !previousPointer) return;
  await bridge.moveBy(event.screenX - previousPointer.x, event.screenY - previousPointer.y);
  previousPointer = { x: event.screenX, y: event.screenY };
});
handle.addEventListener("pointerup", () => { dragging = false; previousPointer = undefined; });

function render(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  machine.tick(now);
  const { action, facing } = machine.state;
  motion = integrateMotion(motion, action, facing, dt);
  const sprite = findSprite(action, facing);
  const stage = document.querySelector<HTMLDivElement>("#sprite-stage")!;
  stage.style.transform = `translate3d(0, ${motion.y}px, 0)`;
  const placeholder = stage.querySelector<HTMLElement>(".placeholder-pup")!;
  const mascotImage = stage.querySelector<HTMLImageElement>("#mascot-image")!;
  placeholder.dataset.action = action;
  placeholder.dataset.facing = facing;
  placeholder.style.transform = `scaleX(${facing === "left" ? -1 : 1})`;
  mascotImage.hidden = !sprite;
  placeholder.hidden = Boolean(sprite);
  if (sprite && mascotImage.src !== new URL(sprite.src, window.location.origin).href) mascotImage.src = sprite.src;
  document.querySelector<HTMLParagraphElement>("#missing-asset")!.textContent = sprite
    ? `${action} / ${facing} (${sprite.frameCount}f @ ${sprite.fps}fps)`
    : `${action} / ${facing} — 스프라이트 미등록`;
  if (Math.abs(motion.velocityX) > 0.1) void bridge.moveBy(motion.velocityX * dt, 0);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
