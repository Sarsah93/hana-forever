/** World coordinates are physical desktop pixels; x/y is the feet anchor. */
export interface Rect { left: number; top: number; right: number; bottom: number; }
export interface Obstacle extends Rect { id: string; }
export interface DesktopScene { workArea: Rect; obstacles: Obstacle[]; scaleFactor: number; }
export interface MotionState {
  x: number; y: number; velocityX: number; velocityY: number;
  grounded: boolean; supportId?: string;
}
export interface Contact { id: string; side: "left" | "right"; }
export const BODY = { halfWidth: 68, height: 164 };
export const STEP = 1 / 120;
const EPS = 0.5;
const overlaps = (a: number, b: number, c: number, d: number) => a < d - EPS && b > c + EPS;
export function bodyRect(state: MotionState, scale: number): Rect {
  return { left: state.x - BODY.halfWidth * scale, right: state.x + BODY.halfWidth * scale,
    top: state.y - BODY.height * scale, bottom: state.y };
}
export function supports(state: MotionState, scene: DesktopScene): string | undefined {
  const r = bodyRect(state, scene.scaleFactor);
  if (Math.abs(state.y - scene.workArea.bottom) <= .001) return "ground";
  return scene.obstacles.find(o => Math.abs(state.y - o.top) <= .001 && overlaps(r.left, r.right, o.left, o.right))?.id;
}
export function wallContact(state: MotionState, scene: DesktopScene, side: "left" | "right"): Contact | undefined {
  const r = bodyRect(state, scene.scaleFactor);
  const pawY = state.y - 110 * scene.scaleFactor;
  const o = scene.obstacles.find(o => pawY >= o.top && pawY <= o.bottom &&
    Math.abs(side === "right" ? r.right - o.left : r.left - o.right) <= 2 * scene.scaleFactor);
  return o ? { id: o.id, side } : undefined;
}
/** Resolve moved/resized windows and dragged drops without leaving Hana embedded. */
export function depenetrate(state: MotionState, scene: DesktopScene): MotionState {
  const s = { ...state };
  const w = BODY.halfWidth * scene.scaleFactor, h = BODY.height * scene.scaleFactor;
  const area = scene.workArea;
  s.x = Math.max(area.left + w, Math.min(area.right - w, s.x));
  s.y = Math.min(area.bottom, Math.max(area.top + h, s.y));
  for (let i = 0; i < scene.obstacles.length + 2; i++) {
    const r = bodyRect(s, scene.scaleFactor);
    const o = scene.obstacles.find(o => overlaps(r.left, r.right, o.left, o.right) && overlaps(r.top, r.bottom, o.top, o.bottom));
    if (!o) break;
    const candidates = [
      { x: o.left - w, y: s.y }, { x: o.right + w, y: s.y },
      { x: s.x, y: o.top }, { x: s.x, y: o.bottom + h }
    ].filter(p => p.x >= area.left + w && p.x <= area.right - w && p.y >= area.top + h && p.y <= area.bottom)
      .sort((a, b) => Math.abs(a.x - s.x) + Math.abs(a.y - s.y) - Math.abs(b.x - s.x) - Math.abs(b.y - s.y));
    const free = candidates.find(p => {
      const b = bodyRect({ ...s, ...p }, scene.scaleFactor);
      return !scene.obstacles.some(o => overlaps(b.left, b.right, o.left, o.right) && overlaps(b.top, b.bottom, o.top, o.bottom));
    });
    if (!free) break;
    s.x = free.x; s.y = free.y; s.velocityX = 0; s.velocityY = 0;
  }
  s.supportId = supports(s, scene); s.grounded = Boolean(s.supportId);
  return s;
}
/** No space for a whole body: a maximized window becomes foreground scenery. */
export function collisionScene(scene: DesktopScene): DesktopScene {
  const w = BODY.halfWidth * scene.scaleFactor, h = BODY.height * scene.scaleFactor;
  return { ...scene, obstacles: scene.obstacles.filter(o => !(o.left <= scene.workArea.left + w &&
    o.right >= scene.workArea.right - w && o.top <= scene.workArea.top + h && o.bottom >= scene.workArea.bottom - h)) };
}
export function createMotion(scene: DesktopScene): MotionState {
  const a = scene.workArea, w = BODY.halfWidth * scene.scaleFactor;
  const s: MotionState = { x: a.right - w - 24 * scene.scaleFactor, y: a.bottom,
    velocityX: 0, velocityY: 0, grounded: true, supportId: "ground" };
  const candidates = [s.x, a.left + w + 2, ...scene.obstacles.flatMap(o => [o.left - w - 1, o.right + w + 1])];
  for (const x of candidates) {
    const test = depenetrate({ ...s, x }, scene), r = bodyRect(test, scene.scaleFactor);
    if (test.y === a.bottom && !scene.obstacles.some(o => overlaps(r.left, r.right, o.left, o.right) && overlaps(r.top, r.bottom, o.top, o.bottom))) return test;
  }
  return depenetrate(s, scene);
}
/** Fixed-step swept AABB tests crossed faces, including top platforms and undersides. */
export function integrateMotion(state: MotionState, scene: DesktopScene, targetSpeed: number, dt: number, jump = false) {
  const s = depenetrate(state, scene), scale = scene.scaleFactor;
  const w = BODY.halfWidth * scale, h = BODY.height * scale;
  const wasGrounded = state.grounded;
  if (jump && s.grounded) { s.velocityY = -550 * scale; s.grounded = false; s.supportId = undefined; }
  s.velocityX += (targetSpeed * scale - s.velocityX) * (1 - Math.exp(-18 * dt));
  let contact: Contact | undefined;
  let nextX = s.x + s.velocityX * dt;
  for (const o of scene.obstacles) {
    if (!overlaps(s.y - h, s.y, o.top, o.bottom)) continue;
    if (s.velocityX > 0 && s.x + w <= o.left + EPS && nextX + w >= o.left) {
      nextX = Math.min(nextX, o.left - w); contact = { id: o.id, side: "right" };
    } else if (s.velocityX < 0 && s.x - w >= o.right - EPS && nextX - w <= o.right) {
      nextX = Math.max(nextX, o.right + w); contact = { id: o.id, side: "left" };
    }
  }
  const clampedX = Math.max(scene.workArea.left + w, Math.min(scene.workArea.right - w, nextX));
  const boundary = clampedX !== nextX;
  s.x = clampedX;
  if (contact || boundary) s.velocityX = 0;
  s.velocityY += 1450 * scale * dt;
  let nextY = s.y + s.velocityY * dt;
  let supportId: string | undefined;
  if (s.velocityY >= 0) {
    if (nextY >= scene.workArea.bottom) { nextY = scene.workArea.bottom; supportId = "ground"; }
    for (const o of scene.obstacles) {
      if (overlaps(s.x - w, s.x + w, o.left, o.right) && s.y <= o.top + EPS && nextY >= o.top) { nextY = o.top; supportId = o.id; }
    }
  } else {
    if (nextY - h < scene.workArea.top) { nextY = scene.workArea.top + h; s.velocityY = 0; }
    for (const o of scene.obstacles) {
      if (overlaps(s.x - w, s.x + w, o.left, o.right) && s.y - h >= o.bottom - EPS && nextY - h <= o.bottom) { nextY = o.bottom + h; s.velocityY = 0; }
    }
  }
  s.y = nextY; s.grounded = Boolean(supportId); s.supportId = supportId;
  if (s.grounded) s.velocityY = 0;
  return { state: s, contact, boundary, landed: !wasGrounded && s.grounded };
}
