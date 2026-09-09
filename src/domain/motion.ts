/** World coordinates are physical desktop pixels; x/y is the feet anchor. */
export interface Rect { left: number; top: number; right: number; bottom: number; }
export interface Point { x: number; y: number; }
export interface Obstacle extends Rect { id: string; }
/** One display. `workArea` excludes the taskbar; its bottom edge is a floor Hana can stand on. */
export interface MonitorInfo { id: string; workArea: Rect; scaleFactor: number; primary?: boolean; }
export interface DesktopScene {
  /** Work area of the monitor the mascot window currently sits on (kept for single-monitor callers/tests). */
  workArea: Rect; obstacles: Obstacle[]; scaleFactor: number;
  /** Every monitor. When absent the scene is treated as the single `workArea`. */
  monitors?: MonitorInfo[];
  cursor?: Point;
}
export interface MotionState {
  x: number; y: number; velocityX: number; velocityY: number;
  grounded: boolean; supportId?: string;
}
export interface Contact { id: string; side: "left" | "right"; }
export const BODY = { halfWidth: 68, height: 164 };
export const STEP = 1 / 120;
const EPS = 0.5;
const overlaps = (a: number, b: number, c: number, d: number) => a < d - EPS && b > c + EPS;
const contains = (r: Rect, x: number, y: number) => x >= r.left - EPS && x <= r.right + EPS && y >= r.top - EPS && y <= r.bottom + EPS;
const distanceTo = (r: Rect, x: number, y: number) => Math.max(r.left - x, 0, x - r.right) + Math.max(r.top - y, 0, y - r.bottom);
export function monitorsOf(scene: DesktopScene): MonitorInfo[] {
  return scene.monitors?.length ? scene.monitors : [{ id: "primary", workArea: scene.workArea, scaleFactor: scene.scaleFactor, primary: true }];
}
/** Monitor whose work area holds the feet point, else the nearest one (after a drag across a gap). */
export function monitorAt(scene: DesktopScene, x: number, y: number): MonitorInfo {
  const list = monitorsOf(scene);
  return list.find(m => contains(m.workArea, x, y)) ?? list.reduce((best, m) => distanceTo(m.workArea, x, y) < distanceTo(best.workArea, x, y) ? m : best);
}
export const scaleAt = (scene: DesktopScene, x: number, y: number) => monitorAt(scene, x, y).scaleFactor;
/** The body must fit on screen: all four corners inside some monitor's work area. Adjacent monitors form one walkable surface. */
export function insideDisplays(scene: DesktopScene, r: Rect): boolean {
  const list = monitorsOf(scene);
  return [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].every(([x, y]) => list.some(m => contains(m.workArea, x, y)));
}
export function bodyRect(state: MotionState, scale: number): Rect {
  return { left: state.x - BODY.halfWidth * scale, right: state.x + BODY.halfWidth * scale,
    top: state.y - BODY.height * scale, bottom: state.y };
}
export function supports(state: MotionState, scene: DesktopScene): string | undefined {
  const r = bodyRect(state, scaleAt(scene, state.x, state.y));
  if (monitorsOf(scene).some(m => Math.abs(state.y - m.workArea.bottom) <= .001 && overlaps(r.left, r.right, m.workArea.left, m.workArea.right))) return "ground";
  return scene.obstacles.find(o => Math.abs(state.y - o.top) <= .001 && overlaps(r.left, r.right, o.left, o.right))?.id;
}
export function wallContact(state: MotionState, scene: DesktopScene, side: "left" | "right"): Contact | undefined {
  const scale = scaleAt(scene, state.x, state.y), r = bodyRect(state, scale);
  const pawY = state.y - 110 * scale;
  const o = scene.obstacles.find(o => pawY >= o.top && pawY <= o.bottom &&
    Math.abs(side === "right" ? r.right - o.left : r.left - o.right) <= 2 * scale);
  return o ? { id: o.id, side } : undefined;
}
/** Free horizontal room beside the body at head height, up to the nearest window side or screen edge. */
export function freeSpace(state: MotionState, scene: DesktopScene, side: "left" | "right"): number {
  const m = monitorAt(scene, state.x, state.y), scale = m.scaleFactor, r = bodyRect(state, scale);
  const headY = state.y - BODY.height * scale * .8;
  let limit = side === "left" ? r.left - m.workArea.left : m.workArea.right - r.right;
  for (const o of scene.obstacles) {
    if (headY < o.top || headY > o.bottom) continue;
    const gap = side === "left" ? r.left - o.right : o.left - r.right;
    if (gap >= -EPS) limit = Math.min(limit, gap);
  }
  return Math.max(0, limit);
}
/** Floor positions where the whole body plus a margin touches no window at all. Focus mode parks Hana on one of these. */
export function freeFloorSpots(scene: DesktopScene, obstacles: readonly Rect[], margin = 24): { x: number; y: number; monitorId: string }[] {
  const spots: { x: number; y: number; monitorId: string }[] = [];
  for (const m of monitorsOf(scene)) {
    const scale = m.scaleFactor, w = BODY.halfWidth * scale, h = BODY.height * scale, pad = margin * scale, y = m.workArea.bottom;
    for (let x = m.workArea.left + w + pad; x <= m.workArea.right - w - pad; x += 24 * scale) {
      const r = { left: x - w - pad, right: x + w + pad, top: y - h - pad, bottom: y };
      if (!obstacles.some(o => overlaps(r.left, r.right, o.left, o.right) && overlaps(r.top, r.bottom, o.top, o.bottom))) spots.push({ x, y, monitorId: m.id });
    }
  }
  return spots;
}
/** True when the body (plus margin) at this state is on a floor and clear of every window. */
export function isClearSpot(state: MotionState, scene: DesktopScene, obstacles: readonly Rect[], margin = 24): boolean {
  const scale = scaleAt(scene, state.x, state.y), pad = margin * scale, r = bodyRect(state, scale);
  const onFloor = monitorsOf(scene).some(m => Math.abs(state.y - m.workArea.bottom) <= .001 && overlaps(r.left, r.right, m.workArea.left, m.workArea.right));
  return onFloor && !obstacles.some(o => overlaps(r.left - pad, r.right + pad, o.left, o.right) && overlaps(r.top - pad, r.bottom, o.top, o.bottom));
}
/** Resolve moved/resized windows and dragged drops without leaving Hana embedded. */
export function depenetrate(state: MotionState, scene: DesktopScene): MotionState {
  const s = { ...state };
  const m = monitorAt(scene, s.x, s.y), scale = m.scaleFactor;
  const w = BODY.halfWidth * scale, h = BODY.height * scale;
  const area = m.workArea;
  // Only pull the body back when it is not on any display; straddling two adjacent monitors is fine.
  if (!insideDisplays(scene, bodyRect(s, scale))) {
    s.x = Math.max(area.left + w, Math.min(area.right - w, s.x));
    s.y = Math.min(area.bottom, Math.max(area.top + h, s.y));
  }
  for (let i = 0; i < scene.obstacles.length + 2; i++) {
    const r = bodyRect(s, scale);
    const o = scene.obstacles.find(o => overlaps(r.left, r.right, o.left, o.right) && overlaps(r.top, r.bottom, o.top, o.bottom));
    if (!o) break;
    const candidates = [
      { x: o.left - w, y: s.y }, { x: o.right + w, y: s.y },
      { x: s.x, y: o.top }, { x: s.x, y: o.bottom + h }
    ].filter(p => insideDisplays(scene, bodyRect({ ...s, ...p }, scale)))
      .sort((a, b) => Math.abs(a.x - s.x) + Math.abs(a.y - s.y) - Math.abs(b.x - s.x) - Math.abs(b.y - s.y));
    const free = candidates.find(p => {
      const b = bodyRect({ ...s, ...p }, scale);
      return !scene.obstacles.some(o => overlaps(b.left, b.right, o.left, o.right) && overlaps(b.top, b.bottom, o.top, o.bottom));
    });
    if (!free) break;
    s.x = free.x; s.y = free.y; s.velocityX = 0; s.velocityY = 0;
  }
  s.supportId = supports(s, scene); s.grounded = Boolean(s.supportId);
  return s;
}
/** No space for a whole body: a maximized window becomes foreground scenery (per monitor). */
export function collisionScene(scene: DesktopScene): DesktopScene {
  const monitors = monitorsOf(scene);
  return { ...scene, obstacles: scene.obstacles.filter(o => !monitors.some(m => {
    const w = BODY.halfWidth * m.scaleFactor, h = BODY.height * m.scaleFactor, a = m.workArea;
    return o.left <= a.left + w && o.right >= a.right - w && o.top <= a.top + h && o.bottom >= a.bottom - h;
  })) };
}
export function createMotion(scene: DesktopScene): MotionState {
  const m = monitorsOf(scene).find(m => m.primary) ?? monitorsOf(scene)[0];
  const a = m.workArea, w = BODY.halfWidth * m.scaleFactor;
  const s: MotionState = { x: a.right - w - 24 * m.scaleFactor, y: a.bottom,
    velocityX: 0, velocityY: 0, grounded: true, supportId: "ground" };
  const candidates = [s.x, a.left + w + 2, ...scene.obstacles.flatMap(o => [o.left - w - 1, o.right + w + 1])];
  for (const x of candidates) {
    const test = depenetrate({ ...s, x }, scene), r = bodyRect(test, m.scaleFactor);
    if (test.y === a.bottom && !scene.obstacles.some(o => overlaps(r.left, r.right, o.left, o.right) && overlaps(r.top, r.bottom, o.top, o.bottom))) return test;
  }
  return depenetrate(s, scene);
}
/** Fixed-step swept AABB tests crossed faces, including top platforms, undersides and every monitor floor. */
export function integrateMotion(state: MotionState, scene: DesktopScene, targetSpeed: number, dt: number, jump = false) {
  const s = depenetrate(state, scene);
  const m = monitorAt(scene, s.x, s.y), scale = m.scaleFactor;
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
  // Leaving the current monitor is fine when the neighbour's work area also holds the whole body.
  const clampedX = insideDisplays(scene, { left: nextX - w, right: nextX + w, top: s.y - h, bottom: s.y }) ? nextX
    : insideDisplays(scene, { left: s.x - w, right: s.x + w, top: s.y - h, bottom: s.y }) ? s.x
    : Math.max(m.workArea.left + w, Math.min(m.workArea.right - w, nextX));
  const boundary = clampedX !== nextX;
  let stepUp: number | undefined;
  if (boundary && s.grounded) {
    const lead = s.velocityX < 0 ? nextX - w : nextX + w;
    const neighbour = monitorsOf(scene).find(n => n !== m && lead >= n.workArea.left - EPS && lead <= n.workArea.right + EPS
      && n.workArea.bottom < s.y - EPS && n.workArea.top <= s.y - h);
    if (neighbour) stepUp = s.y - neighbour.workArea.bottom;
  }
  s.x = clampedX;
  if (contact || boundary) s.velocityX = 0;
  s.velocityY += 1450 * scale * dt;
  let nextY = s.y + s.velocityY * dt;
  let supportId: string | undefined;
  if (s.velocityY >= 0) {
    for (const f of monitorsOf(scene)) {
      const floor = f.workArea.bottom;
      if (overlaps(s.x - w, s.x + w, f.workArea.left, f.workArea.right) && s.y <= floor + EPS && nextY >= floor) { nextY = floor; supportId = "ground"; }
    }
    for (const o of scene.obstacles) {
      if (overlaps(s.x - w, s.x + w, o.left, o.right) && s.y <= o.top + EPS && nextY >= o.top) { nextY = o.top; supportId = o.id; }
    }
  } else {
    if (nextY - h < m.workArea.top) { nextY = m.workArea.top + h; s.velocityY = 0; }
    for (const o of scene.obstacles) {
      if (overlaps(s.x - w, s.x + w, o.left, o.right) && s.y - h >= o.bottom - EPS && nextY - h <= o.bottom) { nextY = o.bottom + h; s.velocityY = 0; }
    }
  }
  s.y = nextY; s.grounded = Boolean(supportId); s.supportId = supportId;
  if (s.grounded) s.velocityY = 0;
  return { state: s, contact, boundary, stepUp, landed: !wasGrounded && s.grounded };
}
