import type { Facing } from "./actions";
import { clipLength, frameAt, introLength, outroOf, SIT_LOOK } from "../assets/manifest";
import { BODY, collisionScene, createMotion, depenetrate, freeFloorSpots, freeSpace, integrateMotion, isClearSpot, monitorAt, wallContact, type DesktopScene, type MonitorInfo, type MotionState, type Obstacle, type Point } from "./motion";
import { NeedsModel, NEED_LABEL } from "./needs";
import { GazeTracker } from "./gaze";
import { DEFAULT_SETTINGS, type HanaSettings, type InteractionKind } from "./settings";
export type DesktopAction = "idle-stand" | "stand-up" | "walk" | "run" | "lean" | "jump" | "fall" | "land"
  | "sit" | "lie-front" | "lie-down" | "recline" | "shake" | "yawn" | "scratch" | "crouch" | "lick" | "smile";
/** Panel request that is not a single clip: "쉬기" picks one of the rest poses. */
export type ActionRequest = DesktopAction | "rest";
/** Clips that play once and hand back to idle (lick hands back to crouch). */
export const ONE_SHOT: ReadonlySet<DesktopAction> = new Set(["shake", "yawn", "scratch", "lick"]);
/** "쉬기": the rest poses, any facing. Free roaming spends a good share of its time here. */
export const REST_POSES: readonly (readonly [DesktopAction, number])[] = [["sit", 4], ["lie-front", 4], ["lie-down", 3], ["recline", 2], ["crouch", 2], ["yawn", 2]];
export const REST_SET: ReadonlySet<DesktopAction> = new Set(["sit", "lie-front", "lie-down", "recline", "crouch", "yawn", "lick", "smile"]);
/** Stationary poses the autonomous picker may hold for a while. */
export const RESTING: ReadonlySet<DesktopAction> = new Set(["idle-stand", "sit", "lie-front", "lie-down", "recline", "crouch", "stand-up"]);
export const LYING: ReadonlySet<DesktopAction> = new Set(["lie-front", "lie-down", "smile"]);
/** Art exists only as a side view; "front" requests resolve to the roomier side. */
export const SIDE_ONLY: ReadonlySet<DesktopAction> = new Set(["walk", "run", "lean", "sit", "scratch", "lie-front", "lie-down", "recline"]);
/** Body families. Changing family goes through the poses a dog really passes on the way (see `plan`). */
export type Family = "standing" | "sitting" | "lying" | "curled" | "air";
export const FAMILY: Record<DesktopAction, Family> = {
  "idle-stand": "standing", "stand-up": "standing", walk: "standing", run: "standing", lean: "standing", shake: "standing",
  jump: "air", fall: "air", land: "air",
  sit: "sitting", scratch: "sitting",
  "lie-front": "lying", "lie-down": "lying", recline: "lying", yawn: "lying", smile: "lying",
  crouch: "curled", lick: "curled"
};
export const ACTION_LABEL: Record<DesktopAction, string> = {
  "idle-stand": "서 있기", "stand-up": "두 발 서기", walk: "걷기", run: "빠르게", lean: "기대기", jump: "점프", fall: "낙하", land: "착지",
  sit: "앉기", "lie-front": "엎드리기", "lie-down": "엎드려 쉬기", recline: "뒤돌아 바라보기", shake: "털기", yawn: "하품", scratch: "턱 긁기", crouch: "웅크리고 앉기", lick: "되새김질", smile: "웃기"
};
export const SETTING_LABEL: Record<keyof HanaSettings, string> = {
  autonomous: "스스로 돌아다니기", gaze: "마우스 커서 바라보기", needs: "요구·생각 풍선", reminders: "시간 알림", lunch: "점심 시간", leave: "퇴근 시간", panelTracking: "패널 따라가기", focus: "집중 모드(방해 금지)"
};
export interface TickContext { now?: number; cursor?: Point; }
export interface ControllerEvent { type: "need" | "reminder" | "expired" | "petting" | "reaction" | "watch" | "focus" | "lean"; detail: string; }
/** One pose on the way to a requested pose. `outro` replays the current clip's settle-in backwards (getting up) before moving on. */
interface Step { action: DesktopAction; facing: Facing; hold: number; outro?: { frames: readonly number[]; durations: readonly number[] }; }
/** Focus mode keeps to quiet poses: no walking, jumping or bubbles while the user works. */
const QUIET_CHOICES: readonly (readonly [ActionRequest, number])[] = [["idle-stand", 2], ["rest", 9]];
/** Weighted free-roam choices. "rest" fans out to REST_POSES; two-leg standing is part of wandering too. */
const CHOICES: readonly (readonly [ActionRequest, number])[] = [
  ["walk", 30], ["idle-stand", 9], ["jump", 4], ["stand-up", 5], ["rest", 40], ["shake", 4], ["scratch", 4], ["lick", 4]
];
const flip = (facing: Facing): Facing => facing === "right" ? "left" : "right";
export class DesktopController {
  motion: MotionState;
  scene: DesktopScene;
  action: DesktopAction = "idle-stand";
  facing: Facing = "front";
  age = 0;
  settings: HanaSettings = { ...DEFAULT_SETTINGS };
  needs: NeedsModel;
  gaze = new GazeTracker();
  /** Which side of the head the thought bubble is drawn on (the roomier one). */
  bubbleSide: "left" | "right" = "right";
  /** Frame chosen by gaze tracking or a getting-up outro instead of the clip cycle. */
  frameOverride?: number;
  petting = false;
  /** Focus mode found no window-free spot: the host hides the mascot window until one appears. */
  hidden = false;
  /** Windows as reported, before the maximized-window exception; focus mode must respect those too. */
  rawObstacles: Obstacle[] = [];
  /** Things the host may want to show or persist; drained with `drainEvents`. */
  private events: ControllerEvent[] = [];
  private launched = false;
  private turnAfterLean = false;
  private nextChoice = 2.5;
  private lastRest?: DesktopAction;
  private smileIn = -1;
  private smileHold = 0;
  private petTimer = 0;
  private watching = false;
  private watchAge = 0;
  private watchUntil = 0;
  private afterLand?: DesktopAction;
  private sideCheck = 0;
  private manualHold = 0;
  private focusWas = false;
  private focusCheck = 0;
  private clearFor = 0;
  /** Poses still to pass before `target` (transition choreography); the first entry is the one being shown. */
  private steps: Step[] = [];
  private target?: { action: DesktopAction; facing: Facing; age: number };
  /** Scripted flight from one monitor's floor onto a bridged neighbour's higher floor (see `crossTo`). */
  private leap?: { x0: number; y0: number; x1: number; y1: number; t: number; duration: number; arc: number };
  /** A walk interrupted by physics (fell off an edge, leapt to a neighbour) resumes on landing with the time it had left. */
  private walkLeft?: { action: "walk" | "run"; facing: Facing; budget: number };
  constructor(scene: DesktopScene, private random = Math.random, needs?: NeedsModel) {
    this.rawObstacles = scene.obstacles;
    this.scene = collisionScene(scene); this.motion = createMotion(this.scene);
    this.needs = needs ?? new NeedsModel(random);
    this.scene.scaleFactor = this.currentScale();
  }
  get autonomous() { return this.settings.autonomous; }
  set autonomous(value: boolean) { this.settings.autonomous = value; }
  get bubble() { return this.needs.bubble; }
  get watchingCursor() { return this.watching; }
  /** Between poses: an intermediate step (getting up, sitting first) is being shown. */
  get transitioning() { return this.steps.length > 0; }
  /** Mid-air between two monitors. */
  get crossing() { return this.leap !== undefined; }
  currentScale() { return monitorAt(this.scene, this.motion.x, this.motion.y).scaleFactor; }
  currentMonitor() { return monitorAt(this.scene, this.motion.x, this.motion.y); }
  headPoint(): Point { const s = this.currentScale(); return { x: this.motion.x, y: this.motion.y - BODY.height * s * .85 }; }
  drainEvents() { const list = this.events; this.events = []; return list; }
  /** Pause the free-roam picker for a while after the user asked for something explicitly. */
  holdAutonomy(seconds: number) { this.manualHold = Math.max(this.manualHold, seconds); }
  setScene(scene: DesktopScene) {
    this.rawObstacles = scene.obstacles;
    this.scene = collisionScene(scene);
    if (!this.leap) this.motion = depenetrate(this.motion, this.scene);
    this.scene.scaleFactor = this.currentScale();
  }
  /** Park Hana on a floor spot instantly (focus mode moves, tray recall). */
  private relocate(spot: { x: number; y: number }, action: DesktopAction = "idle-stand") {
    this.leap = undefined; this.walkLeft = undefined;
    this.motion = { x: spot.x, y: spot.y, velocityX: 0, velocityY: 0, grounded: true, supportId: "ground" };
    this.scene.scaleFactor = this.currentScale();
    this.apply(action, action === "lie-down" || action === "sit" ? this.preferredSide(true) : "front");
    this.nextChoice = 4 + this.random() * 6;
  }
  /**
   * Focus mode: stay clear of every window. Moves to the nearest clear floor spot, or hides when
   * there is none; a spot that stays clear for a moment brings her back. Leaving focus mode drops
   * her on a random clear spot.
   */
  private enforceFocus(dt: number) {
    const on = this.settings.focus;
    if (on !== this.focusWas) {
      this.focusWas = on;
      this.stopWatching(); this.petting = false; this.smileIn = -1; this.afterLand = undefined;
      this.needs.dismiss();
      const spots = freeFloorSpots(this.scene, this.rawObstacles);
      if (on) {
        this.focusCheck = 0; this.clearFor = 0;
        if (this.hidden || !this.motion.grounded || !isClearSpot(this.motion, this.scene, this.rawObstacles)) this.moveToClearSpot(spots);
        else this.relocate(this.motion, "lie-down");
        this.events.push({ type: "focus", detail: this.hidden ? "hidden" : "on" });
      } else {
        this.hidden = false;
        if (spots.length) this.relocate(spots[Math.floor(this.random() * spots.length)]);
        else this.relocate(createMotion(this.scene));
        this.events.push({ type: "focus", detail: "off" });
      }
      return;
    }
    if (!on) return;
    this.focusCheck += dt;
    if (this.focusCheck < .5) return;
    this.focusCheck = 0;
    if (this.hidden) {
      const spots = freeFloorSpots(this.scene, this.rawObstacles);
      this.clearFor = spots.length ? this.clearFor + .5 : 0;
      if (this.clearFor >= 1.5) { this.moveToClearSpot(spots); this.events.push({ type: "focus", detail: this.hidden ? "hidden" : "back" }); }
    } else if (this.motion.grounded && !isClearSpot(this.motion, this.scene, this.rawObstacles)) {
      this.moveToClearSpot(freeFloorSpots(this.scene, this.rawObstacles));
      this.events.push({ type: "focus", detail: this.hidden ? "hidden" : "moved" });
    }
  }
  private moveToClearSpot(spots: { x: number; y: number }[]) {
    if (!spots.length) { this.hidden = true; return; }
    const cost = (s: { x: number; y: number }) => Math.abs(s.x - this.motion.x) + 3 * Math.abs(s.y - this.motion.y);
    const best = spots.reduce((a, b) => cost(a) <= cost(b) ? a : b);
    this.hidden = false; this.clearFor = 0;
    this.relocate(best, "lie-down");
  }
  /** Switch pose right now, dropping any transition in progress. Physics (jump, fall, land) and teleports use this. */
  private apply(action: DesktopAction, facing: Facing = this.facing, age = 0) {
    this.action = action; this.facing = facing; this.age = age; this.launched = false;
    this.steps = []; this.target = undefined;
    if (action !== "sit") this.frameOverride = undefined;
  }
  /**
   * Poses between two families, so Hana visibly gets up or settles instead of cutting:
   * a curled/head-down pose first replays its settle-in backwards (real getting-up art), and lying ↔ upright
   * passes through sitting. Same-family changes and anything airborne switch directly (the renderer dissolves).
   */
  private plan(from: DesktopAction, to: DesktopAction, facing: Facing): Step[] {
    if (from === to) return [];
    const a = FAMILY[from], b = FAMILY[to];
    if (a === "air" || b === "air") return [];
    const steps: Step[] = [];
    const outro = a === "curled" && b === "curled" ? undefined : outroOf(from);
    if (outro) steps.push({ action: from, facing: this.facing, hold: 0, outro });
    if (a !== b) {
      const side = facing !== "front" ? facing : this.facing !== "front" ? this.facing : this.preferredSide();
      if (a === "lying" && b !== "sitting") steps.push({ action: "sit", facing: side, hold: .4 });
      else if (b === "lying" && a !== "sitting") steps.push({ action: "sit", facing: side, hold: .35 });
    }
    return steps;
  }
  /** Request a pose; intermediate poses from `plan` are shown first, then `action` starts at `age`. */
  setAction(action: DesktopAction, facing: Facing = this.facing, age = 0) {
    const steps = this.plan(this.action, action, facing);
    if (!steps.length) { this.apply(action, facing, age); return; }
    const first = steps[0];
    if (first.outro) { this.age = 0; this.launched = false; this.frameOverride = first.outro.frames[0]; }
    else this.apply(first.action, first.facing);
    this.steps = steps; this.target = { action, facing, age };
  }
  private advanceTransition() {
    const step = this.steps[0];
    if (!step) return;
    const length = step.outro ? step.outro.durations.reduce((a, b) => a + b, 0) / 1000 : step.hold;
    if (step.outro) this.frameOverride = frameAt(step.outro.frames, step.outro.durations, this.age);
    if (this.age < length) return;
    const rest = this.steps.slice(1), target = this.target;
    this.frameOverride = undefined;
    if (rest.length) { this.apply(rest[0].action, rest[0].facing); this.steps = rest; this.target = target; }
    else if (target) this.apply(target.action, target.facing, target.age);
    else this.steps = [];
  }
  /** Curl up / lick: start already curled when she is curled, otherwise settle first. */
  private curl(action: "crouch" | "lick") {
    const curled = this.action === "crouch" || this.action === "lick";
    this.setAction(action, "front", curled ? introLength(action) / 1000 : 0);
  }
  /** "쉬기": a random rest pose facing the roomier side (or a random side when both are wide). */
  rest(): DesktopAction {
    const total = REST_POSES.reduce((a, [, w]) => a + w, 0);
    let r = this.random() * total, pick: DesktopAction = "lie-front";
    for (const [a, w] of REST_POSES) { r -= w; if (r <= 0) { pick = a; break; } }
    if (pick === this.action) pick = pick === "lie-front" ? "lie-down" : "lie-front";
    this.walkLeft = undefined;
    if (pick === "crouch") this.curl("crouch");
    else this.setAction(pick, SIDE_ONLY.has(pick) || pick === "yawn" ? this.preferredSide(true) : "front");
    this.nextChoice = ONE_SHOT.has(pick) ? Infinity : 6 + this.random() * 8;
    return pick;
  }
  /** Side with more room, keeping the current side when it is already a side and `random` is off. */
  preferredSide(randomize = false): "left" | "right" {
    if (!randomize && this.facing !== "front") return this.facing;
    const left = freeSpace(this.motion, this.scene, "left"), right = freeSpace(this.motion, this.scene, "right");
    if (randomize && Math.min(left, right) > 260 * this.currentScale()) return this.random() < .5 ? "left" : "right";
    return left >= right ? "left" : "right";
  }
  request(action: DesktopAction, facing: Facing = "front") {
    if (!this.motion.grounded && action !== "fall") return false;
    if (action === "lean" && (facing === "front" || !wallContact(this.motion, this.scene, facing))) return false;
    if (this.action === "jump") return false;
    this.turnAfterLean = false; this.stopWatching(); this.smileIn = -1; this.petting = false; this.petTimer = 0; this.afterLand = undefined; this.walkLeft = undefined;
    if (action === "crouch" || action === "lick") this.curl(action);
    else this.setAction(action, SIDE_ONLY.has(action) && facing === "front" ? this.preferredSide() : facing);
    if (action === "jump") this.motion.velocityX = 0;
    if (action === "lean") this.reportLean(wallContact(this.motion, this.scene, this.facing as "left" | "right")?.id);
    return true;
  }
  /** Arrow key released: stop walking now and do not pick the walk back up after a fall. */
  stopWalking() {
    this.walkLeft = undefined;
    if (this.action === "walk" || this.action === "run") this.request("idle-stand");
  }
  drop(x: number, y: number) {
    this.stopWatching(); this.petting = false; this.smileIn = -1; this.afterLand = undefined; this.leap = undefined; this.walkLeft = undefined;
    this.motion = depenetrate({ x, y, velocityX: 0, velocityY: 0, grounded: false }, this.scene);
    this.scene.scaleFactor = this.currentScale();
    this.apply(this.motion.grounded ? "land" : "fall");
  }
  /** Tray "bring her back": spawn spot on the primary monitor, visible again even if focus mode had hidden her. */
  reset() {
    this.stopWatching(); this.petting = false; this.smileIn = -1; this.leap = undefined; this.walkLeft = undefined;
    this.hidden = false; this.focusWas = this.settings.focus; this.clearFor = 0; this.focusCheck = 0;
    this.motion = createMotion(this.scene); this.scene.scaleFactor = this.currentScale(); this.apply("idle-stand", "front");
  }
  /** Hover-petting over the head. Hana settles down and smiles while it lasts, and for a moment after. */
  setPetting(on: boolean) {
    if (on === this.petting) return;
    if (on && !this.motion.grounded) return;
    this.petting = on;
    if (on) {
      this.stopWatching(); this.afterLand = undefined; this.walkLeft = undefined;
      const wanted = this.needs.satisfy("pet");
      this.events.push({ type: "petting", detail: wanted ? "wanted" : "ok" });
      if (this.action === "smile") return;
      if (!LYING.has(this.action)) this.setAction("lie-front", this.preferredSide());
      this.smileIn = 2;
    } else { this.smileIn = -1; this.smileHold = 1.6; this.petTimer = 0; }
  }
  /** Care actions from the panel. Returns a status line for the panel. */
  interact(kind: InteractionKind): string {
    if (kind === "talk") return "말 걸기는 준비 중이에요.";
    if (!this.motion.grounded || this.action === "jump") return "착지한 뒤 다시 해볼게요.";
    if (kind === "pet") { this.setPetting(true); this.petTimer = 4; return "머리를 쓰다듬는 중…"; }
    this.stopWatching(); this.petting = false; this.smileIn = -1; this.walkLeft = undefined;
    if (kind === "snack") {
      const wanted = this.needs.satisfy("snack");
      this.curl("lick"); this.events.push({ type: "reaction", detail: "snack" });
      return wanted ? "기다리던 간식! 냠냠" : "간식 냠냠";
    }
    const wanted = this.needs.satisfy("toy");
    this.request("jump"); this.afterLand = "shake"; this.events.push({ type: "reaction", detail: "toy" });
    return wanted ? "놀자! 신나서 폴짝" : "폴짝 · 후다닥";
  }
  private stopWatching() { this.watching = false; this.frameOverride = undefined; }
  /** What she is leaning on, for the dev log: an invisible "wall" shows up here with its window class and title. */
  private reportLean(id?: string) {
    const o = id ? this.scene.obstacles.find(o => o.id === id) : undefined;
    if (o) this.events.push({ type: "lean", detail: `${o.id} ${o.class ?? "?"} "${o.title ?? ""}" [${o.left},${o.top}-${o.right},${o.bottom}] feet=${Math.round(this.motion.x)},${Math.round(this.motion.y)} side=${this.facing}` });
  }
  private chooseBubbleSide(force = false) {
    const left = freeSpace(this.motion, this.scene, "left"), right = freeSpace(this.motion, this.scene, "right");
    if (force) this.bubbleSide = left >= right ? "left" : "right";
    else if (this.bubbleSide === "left" && right > left * 1.4) this.bubbleSide = "right";
    else if (this.bubbleSide === "right" && left > right * 1.4) this.bubbleSide = "left";
  }
  private updateGaze(cursor: Point | undefined, dt: number, scale: number) {
    if (!this.settings.gaze) { if (this.watching) { this.stopWatching(); this.setAction("idle-stand", "front"); } return; }
    const g = this.gaze.update(cursor, this.headPoint(), scale, dt);
    if (!g) return;
    const canStart = (this.action === "idle-stand" || this.action === "lie-front" || this.action === "lie-down") && this.motion.grounded
      && !this.needs.active && !this.petting && this.smileIn < 0 && !this.transitioning;
    if (!this.watching && canStart && g.near && this.gaze.activeFor > .5 && this.random() < dt * .6) {
      this.watching = true; this.watchAge = 0; this.watchUntil = 6 + this.random() * 8;
      this.setAction("sit", g.side); this.events.push({ type: "watch", detail: g.side });
    }
    if (!this.watching) return;
    if (this.action !== "sit" && !this.transitioning) { this.stopWatching(); return; }
    if (this.action !== "sit") return;
    this.watchAge += dt;
    if (g.side !== this.facing) this.facing = g.side;
    this.frameOverride = g.up ? SIT_LOOK.up : Math.floor(this.age * .5) % 2 ? SIT_LOOK.levelAlt : SIT_LOOK.level;
    if (this.gaze.idleFor > 3 || this.watchAge > this.watchUntil) {
      this.stopWatching(); this.setAction("idle-stand", "front"); this.nextChoice = 2 + this.random() * 3;
    }
  }
  private choose() {
    // Rest comes in stretches: while resting, most of the next picks are another rest pose.
    const resting = REST_SET.has(this.action);
    const table = this.settings.focus ? QUIET_CHOICES : resting && this.random() < .6 ? [["rest", 1] as const] : CHOICES;
    const total = table.reduce((a, [, w]) => a + w, 0);
    let r = this.random() * total, pick: ActionRequest = this.settings.focus ? "rest" : "walk";
    for (const [a, w] of table) { r -= w; if (r <= 0) { pick = a; break; } }
    this.walkLeft = undefined;
    if (pick === "lick") { if (this.action === "crouch") { this.curl("lick"); this.nextChoice = Infinity; return; } pick = "rest"; }
    if (pick === "rest") { this.lastRest = this.rest(); return; }
    this.lastRest = undefined;
    if (pick === "jump") { if (this.request("jump")) return; pick = "idle-stand"; }
    if (pick === "walk") { this.setAction("walk", this.random() < .5 ? "left" : "right"); this.nextChoice = 2.5 + this.random() * 3; return; }
    this.setAction(pick, SIDE_ONLY.has(pick) ? this.preferredSide(true) : "front");
    this.nextChoice = ONE_SHOT.has(pick) ? Infinity : pick === "idle-stand" ? 2.5 + this.random() * 3 : pick === "stand-up" ? 2 + this.random() * 2.5 : 6 + this.random() * 8;
  }
  private rememberWalk() {
    if (this.action === "walk" || this.action === "run") this.walkLeft = { action: this.action, facing: this.facing, budget: Math.max(1, this.nextChoice - this.age) };
  }
  /**
   * Scripted leap from the current floor onto a bridged neighbour's higher floor: an arc that lands a body's
   * width inside the neighbour, then the walk carries on. Any rise is fine — the only rule is that a real
   * side-by-side seam exists (`bridgedNeighbour`); outer edges still turn her around.
   */
  private crossTo(n: MonitorInfo, rise: number) {
    const s = this.currentScale(), inward = (BODY.halfWidth + 20) * n.scaleFactor;
    const x1 = this.facing === "left" ? n.workArea.right - inward : n.workArea.left + inward;
    this.rememberWalk();
    this.leap = { x0: this.motion.x, y0: this.motion.y, x1, y1: n.workArea.bottom, t: 0, duration: Math.min(.9, .25 + rise / 800), arc: Math.max(14 * s, rise * .2) };
    this.apply("jump", this.facing); this.launched = true;
  }
  private advanceLeap(dt: number) {
    const L = this.leap!; L.t += dt;
    const u = Math.min(1, L.t / L.duration), dy = L.y1 - L.y0;
    const y = L.y0 + dy * u - L.arc * 4 * u * (1 - u);
    const vy = (dy - L.arc * 4 * (1 - 2 * u)) / L.duration;
    this.motion = { x: L.x0 + (L.x1 - L.x0) * u, y, velocityX: (L.x1 - L.x0) / L.duration, velocityY: vy, grounded: false, supportId: undefined };
    if (u < 1) return;
    this.leap = undefined;
    this.motion = { x: L.x1, y: L.y1, velocityX: 0, velocityY: 0, grounded: true, supportId: "ground" };
    this.scene.scaleFactor = this.currentScale();
    this.apply("land");
  }
  tick(dt: number, ctx: TickContext = {}) {
    this.enforceFocus(dt);
    if (this.hidden) return;
    this.age += dt;
    const scale = this.currentScale(); this.scene.scaleFactor = scale;
    if (this.leap) { this.advanceLeap(dt); return; }
    if (this.steps.length) this.advanceTransition();
    if (this.action === "lean") {
      const contact = this.facing !== "front" && wallContact(this.motion, this.scene, this.facing);
      if (!this.motion.grounded || !contact) this.apply(this.motion.grounded ? "idle-stand" : "fall");
      else if (this.age > 1.8 && this.turnAfterLean) { this.apply("walk", flip(this.facing)); this.turnAfterLean = false; }
    }
    if (!this.transitioning && ONE_SHOT.has(this.action) && this.age * 1000 >= clipLength(this.action)) {
      if (this.action === "lick") { this.curl("crouch"); this.nextChoice = 4 + this.random() * 6; }
      else { this.setAction("idle-stand", "front"); this.nextChoice = 1 + this.random() * 2; }
    }
    if (this.petTimer > 0) { this.petTimer -= dt; if (this.petTimer <= 0) this.setPetting(false); }
    if (this.smileIn >= 0) { this.smileIn -= dt; if (this.smileIn < 0) this.setAction("smile", this.facing === "front" ? this.preferredSide() : this.facing); }
    if (this.action === "smile" && !this.petting) {
      this.smileHold -= dt;
      if (this.smileHold <= 0) { this.setAction("lie-front", this.facing === "front" ? this.preferredSide() : this.facing); this.nextChoice = 3 + this.random() * 4; }
    }
    if (this.manualHold > 0) this.manualHold -= dt;
    let launch = false;
    if (this.action === "jump" && !this.launched && this.age >= 0.12) { launch = true; this.launched = true; }
    const gait = this.action === "walk" || this.action === "run";
    const speed = this.action === "walk" ? 95 : this.action === "run" ? 190 : 0;
    const result = integrateMotion(this.motion, this.scene, this.facing === "left" ? -speed : this.facing === "right" ? speed : 0, dt, launch);
    this.motion = result.state;
    // A bridged neighbour with a higher floor (its taskbar, or a taller/lower-placed screen): leap up and keep walking.
    if (result.neighbour && result.stepUp !== undefined && this.motion.grounded && gait) { this.crossTo(result.neighbour, result.stepUp); return; }
    if (result.landed) this.apply("land");
    else if (!this.motion.grounded && this.motion.velocityY >= 0 && this.action !== "fall") { this.rememberWalk(); this.apply("fall"); }
    else if (result.contact && this.motion.grounded && gait) {
      if (wallContact(this.motion, this.scene, result.contact.side)) { this.apply("lean", result.contact.side); this.turnAfterLean = true; this.reportLean(result.contact.id); }
      else this.apply(this.action, flip(this.facing));
    } else if (result.boundary && gait) this.apply(this.action, flip(this.facing));
    if (this.action === "land" && this.age >= 0.22) {
      const resume = this.walkLeft; this.walkLeft = undefined;
      if (resume) { this.apply(resume.action, resume.facing); this.nextChoice = resume.budget; }
      else if (this.afterLand) { this.setAction(this.afterLand, "front"); this.afterLand = undefined; }
      else this.setAction("idle-stand", "front");
    }
    const needSettings = this.settings.focus ? { ...this.settings, needs: false } : this.settings;
    for (const e of this.needs.tick(dt, ctx.now ?? Date.now(), needSettings)) {
      if (e.type === "need") {
        this.chooseBubbleSide(true); this.events.push({ type: "need", detail: NEED_LABEL[e.kind] });
        if (this.motion.grounded && this.action !== "jump" && !this.petting) { this.stopWatching(); this.walkLeft = undefined; this.setAction("stand-up", "front"); }
      } else if (e.type === "reminder") { this.chooseBubbleSide(true); this.events.push({ type: "reminder", detail: e.label }); }
      else if (e.type === "expired") {
        this.events.push({ type: "expired", detail: e.kind });
        if (this.action === "stand-up") { this.setAction("idle-stand", "front"); this.nextChoice = 1 + this.random() * 2; }
      }
    }
    if (this.needs.bubble && (this.sideCheck += dt) > .5) { this.sideCheck = 0; this.chooseBubbleSide(); }
    // A request that arrived mid-clip is picked up as soon as she is idle again.
    if (this.needs.active && this.action === "idle-stand" && this.motion.grounded && !this.petting && !this.transitioning) this.setAction("stand-up", "front");
    this.updateGaze(this.settings.focus ? undefined : ctx.cursor, dt, scale);
    const idleEnough = this.action === "idle-stand" || gait || RESTING.has(this.action);
    if (this.settings.autonomous && this.manualHold <= 0 && this.motion.grounded && idleEnough && !this.transitioning
      && !this.needs.active && !this.petting && !this.watching && this.smileIn < 0 && this.age > this.nextChoice) {
      this.choose();
    }
  }
}
