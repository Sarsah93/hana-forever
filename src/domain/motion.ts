/** World coordinates are physical desktop pixels; x/y is the feet anchor. */
export interface Rect { left: number; top: number; right: number; bottom: number; }
export interface Point { x: number; y: number; }
export interface Obstacle extends Rect { id: string; /** Win32 class / title, for diagnostics only. */ class?: string; title?: string; }
/** One display. `workArea` excludes the taskbar; its bottom edge is a floor Hana can stand on. */
export interface MonitorInfo { id: string; workArea: Rect; scaleFactor: number; primary?: boolean; }
export interface DesktopScene {
  /** Work area of the monitor the mascot window currently sits on (kept for single-monitor callers/tests). */
  workArea: Rect; obstacles: Obstacle[]; scaleFactor: number;
  /** Every monitor. When absent the scene is treated as the single `workArea`. */
  monitors?: MonitorInfo[];
  cursor?: Point;
  /**
   * Every window front-to-back, including backdrops dropped from `obstacles`, so a face hidden behind a
   * window in front (a browser poking out from behind a maximized mail client) is never walked into or leaned on.
   */
  stack?: Obstacle[];
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
const inside = (r: Rect, x: number, y: number) => x > r.left && x < r.right && y > r.top && y < r.bottom;
const distanceTo = (r: Rect, x: number, y: number) => Math.max(r.left - x, 0, x - r.right) + Math.max(r.top - y, 0, y - r.bottom);
/** True when the point on window `id` is covered by a window in front of it (Z order = array order, front first). */
export function occludedAt(scene: DesktopScene, id: string, x: number, y: number): boolean {
  for (const o of scene.stack ?? scene.obstacles) { if (o.id === id) return false; if (inside(o, x, y)) return true; }
  return false;
}
/** The body overlaps a window and the centre of that overlap is actually visible (not behind another window). */
function solidOverlap(scene: DesktopScene, o: Obstacle, r: Rect): boolean {
  if (!overlaps(r.left, r.right, o.left, o.right) || !overlaps(r.top, r.bottom, o.top, o.bottom)) return false;
  return !occludedAt(scene, o.id, (Math.max(r.left, o.left) + Math.min(r.right, o.right)) / 2, (Math.max(r.top, o.top) + Math.min(r.bottom, o.bottom)) / 2);
}
export function monitorsOf(scene: DesktopScene): MonitorInfo[] {
  return scene.monitors?.length ? scene.monitors : [{ id: "primary", workArea: scene.workArea, scaleFactor: scene.scaleFactor, primary: true }];
}
/** Monitor whose work area holds the feet point, else the nearest one (after a drag across a gap). */
export function monitorAt(scene: DesktopScene, x: number, y: number): MonitorInfo {
  const list = monitorsOf(scene);
  return list.find(m => contains(m.workArea, x, y)) ?? list.reduce((best, m) => distanceTo(m.workArea, x, y) < distanceTo(best.workArea, x, y) ? m : best);
}
export const scaleAt = (scene: DesktopScene, x: number, y: number) => monitorAt(scene, x, y).scaleFactor;
/**
 * The display touching `m` on that side and sharing part of its vertical range: the seam Hana may cross.
 * Outer edges, and monitors stacked above/below or placed diagonally, have no bridge and stay walls.
 */
export function bridgedNeighbour(scene: DesktopScene, m: MonitorInfo, side: "left" | "right"): MonitorInfo | undefined {
  const a = m.workArea;
  return monitorsOf(scene).find(n => n !== m && n.workArea.top < a.bottom - EPS && n.workArea.bottom > a.top + EPS
    && Math.abs(side === "right" ? n.workArea.left - a.right : n.workArea.right - a.left) <= 2);
}
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
  return scene.obstacles.find(o => Math.abs(state.y - o.top) <= .001 && overlaps(r.left, r.right, o.left, o.right)
    && !occludedAt(scene, o.id, (Math.max(r.left, o.left) + Math.min(r.right, o.right)) / 2, o.top))?.id;
}
/** A window side at paw height that is really there to lean on: touching the body and not hidden behind another window. */
export function wallContact(state: MotionState, scene: DesktopScene, side: "left" | "right"): Contact | undefined {
  const scale = scaleAt(scene, state.x, state.y), r = bodyRect(state, scale);
  const pawY = state.y - 110 * scale;
  const o = scene.obstacles.find(o => pawY >= o.top && pawY <= o.bottom &&
    Math.abs(side === "right" ? r.right - o.left : r.left - o.right) <= 2 * scale &&
    !occludedAt(scene, o.id, side === "right" ? o.left : o.right, pawY));
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
    const o = scene.obstacles.find(o => solidOverlap(scene, o, r));
    if (!o) break;
    const candidates = [
      { x: o.left - w, y: s.y }, { x: o.right + w, y: s.y },
      { x: s.x, y: o.top }, { x: s.x, y: o.bottom + h }
    ].filter(p => insideDisplays(scene, bodyRect({ ...s, ...p }, scale)))
      .sort((a, b) => Math.abs(a.x - s.x) + Math.abs(a.y - s.y) - Math.abs(b.x - s.x) - Math.abs(b.y - s.y));
    const free = candidates.find(p => { const b = bodyRect({ ...s, ...p }, scale); return !scene.obstacles.some(o => solidOverlap(scene, o, b)); });
    if (!free) break;
    s.x = free.x; s.y = free.y; s.velocityX = 0; s.velocityY = 0;
  }
  s.supportId = supports(s, scene); s.grounded = Boolean(s.supportId);
  return s;
}
/**
 * Each window shrunk to the part not covered by windows in front of it, when that part is still a rectangle
 * (a front window hiding a whole side, top or bottom). A browser poking out from behind a maximized mail client
 * then only exists where it can be seen, so its visible edge — not the hidden one — is the wall.
 * Corner overlaps are left whole; the per-point `occludedAt` checks cover those faces.
 */
export function visibleRects(stack: readonly Obstacle[]): Obstacle[] {
  const out: Obstacle[] = [], fronts: Rect[] = [];
  for (const o of stack) {
    let r: Rect | undefined = { left: o.left, top: o.top, right: o.right, bottom: o.bottom };
    for (const f of fronts) {
      if (!r || f.right <= r.left || f.left >= r.right || f.bottom <= r.top || f.top >= r.bottom) continue;
      const coversY = f.top <= r.top && f.bottom >= r.bottom, coversX = f.left <= r.left && f.right >= r.right;
      if (coversY && coversX) { r = undefined; break; }
      if (coversY) { if (f.left <= r.left) r.left = f.right; else if (f.right >= r.right) r.right = f.left; }
      else if (coversX) { if (f.top <= r.top) r.top = f.bottom; else if (f.bottom >= r.bottom) r.bottom = f.top; }
    }
    fronts.push(o); // a window hides what is behind its whole extent, even the part of it that is hidden itself
    if (r && r.right - r.left > 8 && r.bottom - r.top > 8) out.push({ ...o, ...r });
  }
  return out;
}
/** No space for a whole body: a maximized window becomes foreground scenery (per monitor). The full Z order is kept in `stack`. */
export function collisionScene(scene: DesktopScene): DesktopScene {
  const monitors = monitorsOf(scene), stack = scene.stack ?? scene.obstacles;
  const backdrop = (o: Rect) => monitors.some(m => {
    const w = BODY.halfWidth * m.scaleFactor, h = BODY.height * m.scaleFactor, a = m.workArea;
    return o.left <= a.left + w && o.right >= a.right - w && o.top <= a.top + h && o.bottom >= a.bottom - h;
  });
  return { ...scene, stack, obstacles: visibleRects(stack).filter(o => !backdrop(o)) };
}
export function createMotion(scene: DesktopScene): MotionState {
  const m = monitorsOf(scene).find(m => m.primary) ?? monitorsOf(scene)[0];
  const a = m.workArea, w = BODY.halfWidth * m.scaleFactor;
  const s: MotionState = { x: a.right - w - 24 * m.scaleFactor, y: a.bottom,
    velocityX: 0, velocityY: 0, grounded: true, supportId: "ground" };
  const candidates = [s.x, a.left + w + 2, ...scene.obstacles.flatMap(o => [o.left - w - 1, o.right + w + 1])];
  for (const x of candidates) {
    const test = depenetrate({ ...s, x }, scene), r = bodyRect(test, m.scaleFactor);
    if (test.y === a.bottom && !scene.obstacles.some(o => solidOverlap(scene, o, r))) return test;
  }
  return depenetrate(s, scene);
}
export interface MotionResult {
  state: MotionState; contact?: Contact;
  /** The body could not move on: a screen edge, or a bridged neighbour whose floor is higher (then `stepUp`/`neighbour` say how much/which). */
  boundary: boolean; stepUp?: number; neighbour?: MonitorInfo; landed: boolean;
}
/** Fixed-step swept AABB tests crossed faces, including top platforms, undersides and every monitor floor. */
export function integrateMotion(state: MotionState, scene: DesktopScene, targetSpeed: number, dt: number, jump = false): MotionResult {
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
    const midY = (Math.max(s.y - h, o.top) + Math.min(s.y, o.bottom)) / 2;
    if (s.velocityX > 0 && s.x + w <= o.left + EPS && nextX + w >= o.left && !occludedAt(scene, o.id, o.left, midY)) {
      nextX = Math.min(nextX, o.left - w); contact = { id: o.id, side: "right" };
    } else if (s.velocityX < 0 && s.x - w >= o.right - EPS && nextX - w <= o.right && !occludedAt(scene, o.id, o.right, midY)) {
      nextX = Math.max(nextX, o.right + w); contact = { id: o.id, side: "left" };
    }
  }
  // Leaving the current monitor is fine when the neighbour's work area also holds the whole body.
  const clampedX = insideDisplays(scene, { left: nextX - w, right: nextX + w, top: s.y - h, bottom: s.y }) ? nextX
    : insideDisplays(scene, { left: s.x - w, right: s.x + w, top: s.y - h, bottom: s.y }) ? s.x
    : Math.max(m.workArea.left + w, Math.min(m.workArea.right - w, nextX));
  const boundary = clampedX !== nextX;
  // A bridged neighbour whose floor is higher: report the rise so the controller can leap up onto it.
  let stepUp: number | undefined, neighbour: MonitorInfo | undefined;
  if (boundary && s.grounded) {
    const n = bridgedNeighbour(scene, m, s.velocityX < 0 ? "left" : "right");
    if (n && n.workArea.bottom < s.y - EPS) { neighbour = n; stepUp = s.y - n.workArea.bottom; }
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
      if (overlaps(s.x - w, s.x + w, o.left, o.right) && s.y <= o.top + EPS && nextY >= o.top
        && !occludedAt(scene, o.id, (Math.max(s.x - w, o.left) + Math.min(s.x + w, o.right)) / 2, o.top)) { nextY = o.top; supportId = o.id; }
    }
  } else {
    if (nextY - h < m.workArea.top) { nextY = m.workArea.top + h; s.velocityY = 0; }
    for (const o of scene.obstacles) {
      if (overlaps(s.x - w, s.x + w, o.left, o.right) && s.y - h >= o.bottom - EPS && nextY - h <= o.bottom
        && !occludedAt(scene, o.id, (Math.max(s.x - w, o.left) + Math.min(s.x + w, o.right)) / 2, o.bottom)) { nextY = o.bottom + h; s.velocityY = 0; }
    }
  }
  s.y = nextY; s.grounded = Boolean(supportId); s.supportId = supportId;
  if (s.grounded) s.velocityY = 0;
  return { state: s, contact, boundary, stepUp, neighbour, landed: !wasGrounded && s.grounded };
}
