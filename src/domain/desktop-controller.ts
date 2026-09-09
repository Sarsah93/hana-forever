import type { Facing } from "./actions";
import { clipLength, introLength, SIT_LOOK } from "../assets/manifest";
import { BODY, collisionScene, createMotion, depenetrate, freeFloorSpots, freeSpace, integrateMotion, isClearSpot, monitorAt, wallContact, type DesktopScene, type MotionState, type Obstacle, type Point } from "./motion";
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
export const ACTION_LABEL: Record<DesktopAction, string> = {
  "idle-stand": "서 있기", "stand-up": "두 발 서기", walk: "걷기", run: "빠르게", lean: "기대기", jump: "점프", fall: "낙하", land: "착지",
  sit: "앉기", "lie-front": "엎드리기", "lie-down": "엎드려 쉬기", recline: "뒤돌아 바라보기", shake: "털기", yawn: "하품", scratch: "턱 긁기", crouch: "웅크리고 앉기", lick: "되새김질", smile: "웃기"
};
export const SETTING_LABEL: Record<keyof HanaSettings, string> = {
  autonomous: "스스로 돌아다니기", gaze: "마우스 커서 바라보기", needs: "요구·생각 풍선", reminders: "시간 알림", lunch: "점심 시간", leave: "퇴근 시간", panelTracking: "패널 따라가기", focus: "집중 모드(방해 금지)"
};
export interface TickContext { now?: number; cursor?: Point; }
export interface ControllerEvent { type: "need" | "reminder" | "expired" | "petting" | "reaction" | "watch" | "focus"; detail: string; }
/** Focus mode keeps to quiet poses: no walking, jumping or bubbles while the user works. */
const QUIET_CHOICES: readonly (readonly [ActionRequest, number])[] = [["idle-stand", 2], ["rest", 9]];
/** Weighted free-roam choices. "rest" fans out to REST_POSES; two-leg standing is part of wandering too. */
const CHOICES: readonly (readonly [ActionRequest, number])[] = [
  ["walk", 30], ["idle-stand", 9], ["jump", 4], ["stand-up", 5], ["rest", 40], ["shake", 4], ["scratch", 4], ["lick", 4]
];
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
  /** Frame chosen by gaze tracking instead of the clip cycle. */
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
  private hopping = false;
  private hopSpeed = 0;
  private focusWas = false;
  private focusCheck = 0;
  private clearFor = 0;
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
  currentScale() { return monitorAt(this.scene, this.motion.x, this.motion.y).scaleFactor; }
  currentMonitor() { return monitorAt(this.scene, this.motion.x, this.motion.y); }
  headPoint(): Point { const s = this.currentScale(); return { x: this.motion.x, y: this.motion.y - BODY.height * s * .85 }; }
  drainEvents() { const list = this.events; this.events = []; return list; }
  /** Pause the free-roam picker for a while after the user asked for something explicitly. */
  holdAutonomy(seconds: number) { this.manualHold = Math.max(this.manualHold, seconds); }
  setScene(scene: DesktopScene) {
    this.rawObstacles = scene.obstacles;
    this.scene = collisionScene(scene); this.motion = depenetrate(this.motion, this.scene);
    this.scene.scaleFactor = this.currentScale();
  }
  /** Park Hana on a floor spot instantly (focus mode moves, tray recall). */
  private relocate(spot: { x: number; y: number }, action: DesktopAction = "idle-stand") {
    this.motion = { x: spot.x, y: spot.y, velocityX: 0, velocityY: 0, grounded: true, supportId: "ground" };
    this.scene.scaleFactor = this.currentScale();
    this.setAction(action, action === "lie-down" || action === "sit" ? this.preferredSide(true) : "front");
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
      this.stopWatching(); this.petting = false; this.smileIn = -1; this.afterLand = undefined; this.hopping = false;
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
  setAction(action: DesktopAction, facing: Facing = this.facing, age = 0) {
    this.action = action; this.facing = facing; this.age = age; this.launched = false;
    if (action !== "sit") this.frameOverride = undefined;
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
    this.turnAfterLean = false; this.stopWatching(); this.smileIn = -1; this.petting = false; this.petTimer = 0; this.afterLand = undefined;
    if (action === "crouch" || action === "lick") this.curl(action);
    else this.setAction(action, SIDE_ONLY.has(action) && facing === "front" ? this.preferredSide() : facing);
    if (action === "jump") this.motion.velocityX = 0;
    return true;
  }
  drop(x: number, y: number) {
    this.stopWatching(); this.petting = false; this.smileIn = -1; this.afterLand = undefined;
    this.motion = depenetrate({ x, y, velocityX: 0, velocityY: 0, grounded: false }, this.scene);
    this.scene.scaleFactor = this.currentScale();
    this.setAction(this.motion.grounded ? "land" : "fall");
  }
  reset() { this.stopWatching(); this.petting = false; this.smileIn = -1; this.motion = createMotion(this.scene); this.scene.scaleFactor = this.currentScale(); this.setAction("idle-stand", "front"); }
  /** Hover-petting over the head. Hana settles down and smiles while it lasts, and for a moment after. */
  setPetting(on: boolean) {
    if (on === this.petting) return;
    if (on && !this.motion.grounded) return;
    this.petting = on;
    if (on) {
      this.stopWatching(); this.afterLand = undefined;
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
    this.stopWatching(); this.petting = false; this.smileIn = -1;
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
      && !this.needs.active && !this.petting && this.smileIn < 0;
    if (!this.watching && canStart && g.near && this.gaze.activeFor > .5 && this.random() < dt * .6) {
      this.watching = true; this.watchAge = 0; this.watchUntil = 6 + this.random() * 8;
      this.setAction("sit", g.side); this.events.push({ type: "watch", detail: g.side });
    }
    if (!this.watching) return;
    if (this.action !== "sit") { this.stopWatching(); return; }
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
    if (pick === "lick") { if (this.action === "crouch") { this.curl("lick"); this.nextChoice = Infinity; return; } pick = "rest"; }
    if (pick === "rest") { this.lastRest = this.rest(); return; }
    this.lastRest = undefined;
    if (pick === "jump") { if (this.request("jump")) return; pick = "idle-stand"; }
    if (pick === "walk") { this.setAction("walk", this.random() < .5 ? "left" : "right"); this.nextChoice = 2.5 + this.random() * 3; return; }
    this.setAction(pick, SIDE_ONLY.has(pick) ? this.preferredSide(true) : "front");
    this.nextChoice = ONE_SHOT.has(pick) ? Infinity : pick === "idle-stand" ? 2.5 + this.random() * 3 : pick === "stand-up" ? 2 + this.random() * 2.5 : 6 + this.random() * 8;
  }
  tick(dt: number, ctx: TickContext = {}) {
    this.enforceFocus(dt);
    if (this.hidden) return;
    this.age += dt;
    const scale = this.currentScale(); this.scene.scaleFactor = scale;
    if (this.action === "lean") {
      const contact = this.facing !== "front" && wallContact(this.motion, this.scene, this.facing);
      if (!this.motion.grounded || !contact) this.setAction(this.motion.grounded ? "idle-stand" : "fall");
      else if (this.age > 1.8 && this.turnAfterLean) {
        this.setAction("walk", this.facing === "right" ? "left" : "right"); this.turnAfterLean = false;
      }
    }
    if (ONE_SHOT.has(this.action) && this.age * 1000 >= clipLength(this.action)) {
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
    const speed = this.hopping && this.action !== "land" ? this.hopSpeed : this.action === "walk" ? 95 : this.action === "run" ? 190 : 0;
    const result = integrateMotion(this.motion, this.scene, this.facing === "left" ? -speed : this.facing === "right" ? speed : 0, dt, launch);
    this.motion = result.state;
    // A neighbouring monitor whose floor is a little higher (its taskbar, or a taller screen): hop up and keep walking.
    if (result.stepUp !== undefined && !this.hopping && this.motion.grounded && (this.action === "walk" || this.action === "run") && result.stepUp <= 90 * scale) {
      const g = 1450 * scale, rise = result.stepUp + 14 * scale;
      const flight = Math.sqrt(2 * rise / g) + Math.sqrt(2 * 14 * scale / g);
      this.hopping = true; this.launched = true;
      this.hopSpeed = Math.max(95, (BODY.halfWidth + 34) / flight);
      this.motion = { ...this.motion, grounded: false, supportId: undefined, velocityY: -Math.sqrt(2 * g * rise),
        velocityX: (this.facing === "left" ? -1 : 1) * this.hopSpeed * scale };
      this.setAction("jump", this.facing);
      return;
    }
    if (result.landed) this.setAction("land");
    else if (!this.motion.grounded && this.motion.velocityY >= 0 && this.action !== "fall") this.setAction("fall");
    else if (result.contact && this.motion.grounded && (this.action === "walk" || this.action === "run")) {
      if (wallContact(this.motion, this.scene, result.contact.side)) { this.setAction("lean", result.contact.side); this.turnAfterLean = true; }
      else this.setAction("walk", this.facing === "right" ? "left" : "right");
    } else if (result.boundary && (this.action === "walk" || this.action === "run")) this.setAction(this.action, this.facing === "right" ? "left" : "right");
    if (this.action === "land" && (this.age >= 0.22 || this.hopping)) {
      if (this.hopping) { this.hopping = false; this.setAction("walk", this.facing); }
      else if (this.afterLand) { this.setAction(this.afterLand, "front"); this.afterLand = undefined; }
      else this.setAction("idle-stand", "front");
    }
    if (this.hopping && this.motion.grounded && this.action !== "land" && this.action !== "walk") this.hopping = false;
    const needSettings = this.settings.focus ? { ...this.settings, needs: false } : this.settings;
    for (const e of this.needs.tick(dt, ctx.now ?? Date.now(), needSettings)) {
      if (e.type === "need") {
        this.chooseBubbleSide(true); this.events.push({ type: "need", detail: NEED_LABEL[e.kind] });
        if (this.motion.grounded && this.action !== "jump" && !this.petting) { this.stopWatching(); this.setAction("stand-up", "front"); }
      } else if (e.type === "reminder") { this.chooseBubbleSide(true); this.events.push({ type: "reminder", detail: e.label }); }
      else if (e.type === "expired") {
        this.events.push({ type: "expired", detail: e.kind });
        if (this.action === "stand-up") { this.setAction("idle-stand", "front"); this.nextChoice = 1 + this.random() * 2; }
      }
    }
    if (this.needs.bubble && (this.sideCheck += dt) > .5) { this.sideCheck = 0; this.chooseBubbleSide(); }
    // A request that arrived mid-clip is picked up as soon as she is idle again.
    if (this.needs.active && this.action === "idle-stand" && this.motion.grounded && !this.petting) this.setAction("stand-up", "front");
    this.updateGaze(this.settings.focus ? undefined : ctx.cursor, dt, scale);
    const idleEnough = this.action === "idle-stand" || this.action === "walk" || this.action === "run" || (RESTING.has(this.action) && this.action !== "stand-up") || this.action === "stand-up";
    if (this.settings.autonomous && this.manualHold <= 0 && this.motion.grounded && idleEnough && !this.needs.active && !this.petting && !this.watching && this.smileIn < 0 && this.age > this.nextChoice) {
      this.choose();
    }
  }
}
