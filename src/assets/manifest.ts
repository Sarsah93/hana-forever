import type { DesktopAction } from "../domain/desktop-controller";
import type { Facing } from "../domain/actions";
import { V3_FRAMES, V3_SRC } from "./motion-v3";
export interface SpriteFrame { rect: readonly [number, number, number, number]; foot: readonly [number, number]; }
export interface SpriteClip {
  id: string; src: string; frames: readonly SpriteFrame[]; fps: number;
  /**
   * Source pixels → CSS pixels. Calibrated so every pose reads as the same dog: matching head size first
   * (front poses ear-to-ear ≈ 90px, side poses in profile ≈ 72px), then plausible height (docs/previews/size-calibration.png).
   */
  scale: number;
  /** Looped cycle: frame indices and how long each step is held (ms). */
  sequence?: readonly number[]; durations?: readonly number[];
  /** Played once before the cycle starts (settling into a lying pose, etc.). */
  intro?: readonly number[]; introDurations?: readonly number[];
  loop: boolean;
  /** Which way the art faces. Side art is mirrored at runtime for the opposite facing; front art never mirrors. */
  source: Facing;
  mirror?: boolean;
  /**
   * Dissolve into the next frame over the tail of each step instead of cutting. Right for slow poses whose
   * frames differ by a blink, a breath or a tongue; wrong for gaits and shakes, which need crisp steps.
   */
  smooth?: boolean;
}
const frame = (x: number, y: number, w: number, h: number, fx: number, fy: number): SpriteFrame => ({ rect: [x, y, w, h], foot: [fx, fy] });
const src = "/motion-v2/hana-atlas.png";
// motion-v2 rectangles were measured from the generated 1254px atlas, not inferred from an ideal grid.
export const IDLE: SpriteClip = { id: "idle-stand", src, fps: 4, scale: .52, loop: true, source: "front", smooth: true,
  frames: [frame(60,19,195,294,157,306), frame(366,9,201,304,468,306), frame(683,19,198,294,782,306), frame(999,18,196,295,1097,306)],
  sequence: [0,1,0,2,3,0], durations: [900,350,900,120,250,650] };
/** Side walk art is drawn in a leaner proportion than the front idle; .57 brings its head to the idle head's size. */
export const WALK: SpriteClip = { id: "walk", src, fps: 8, scale: .57, loop: true, source: "right",
  frames: [frame(19,347,289,240,162,575), frame(331,345,282,244,472,577), frame(626,343,310,244,780,575), frame(945,350,297,237,1094,575)] };
export const LEAN: SpriteClip = { id: "lean", src, fps: 8, scale: .52, loop: true, source: "right",
  frames: [frame(54,601,219,323,140,917), frame(368,592,220,332,448,917), frame(682,592,223,332,765,917), frame(994,594,224,330,1078,917)] };
export const JUMP: SpriteClip = { id: "jump", src, fps: 8, scale: .52, loop: true, source: "front",
  frames: [frame(55,990,208,246,157,1224), frame(363,924,206,311,467,1223), frame(673,924,222,229,784,1141), frame(993,988,213,248,1100,1224)] };
/** Two-leg begging pose. Sized so the upright body is ~1.4× the four-leg stand, matching the idle head size. */
export const STAND: SpriteClip = { id: "stand-up", src: "/stand-up/front-v1.png", fps: 1, scale: .21, loop: true, source: "front", frames: [frame(0,0,1024,1024,512,980)] };
// motion-v3: six generated pose sheets keyed and packed by tools/sprites/extract.cjs (see assets/sprites/README.md).
const v3 = (sheet: keyof typeof V3_FRAMES, id: string, scale: number, extra: Partial<SpriteClip>): SpriteClip =>
  ({ id, src: V3_SRC, frames: V3_FRAMES[sheet], fps: 8, scale, loop: true, source: "front", ...extra });
export const SHAKE = v3("front-shake", "shake", .48, { loop: false,
  sequence: [0,1,2,3,4,5,2,4,3,5,6,7], durations: [260,140,90,90,90,90,80,80,80,90,220,320] });
export const LIE_FRONT = v3("lie-front", "lie-front", .52, { source: "right", smooth: true,
  sequence: [0,1,0,2,0,3,1,0], durations: [1500,900,1300,140,1200,700,800,1100] });
export const LIE_DOWN = v3("lie-front", "lie-down", .52, { source: "right", smooth: true, intro: [4,5], introDurations: [450,650],
  sequence: [6,7,6,5,6,7], durations: [2200,1600,1800,700,2400,2000] });
export const RECLINE = v3("recline-back", "recline", .46, { source: "right", smooth: true,
  sequence: [0,1,2,1,3,0,4,5,6,5,7,4], durations: [1400,900,150,700,1100,1300,1000,900,160,800,1200,900] });
/** The sitting sheet's head is drawn small; .48 matches the other side poses' head size. */
export const SIT = v3("scratch", "sit", .48, { source: "left", smooth: true,
  sequence: [6,7,6,0,6,7], durations: [1600,1200,1300,900,1400,1100] });
export const SCRATCH = v3("scratch", "scratch", .48, { loop: false, source: "left",
  sequence: [6,0,1,2,3,2,4,3,2,3,4,5,6,7], durations: [350,450,260,120,120,120,120,120,120,120,120,320,450,500] });
// The yawn sheet lies with the rump to the left and the head to the right, like lie-front: treat it as right-facing art
// so a dog lying to the left keeps lying to the left when she yawns or smiles.
export const YAWN = v3("yawn", "yawn", .45, { loop: false, source: "right", smooth: true,
  sequence: [0,1,2,3,4,3,2,5,6,7], durations: [450,400,260,520,750,320,260,520,700,450] });
/** Being petted: mostly the closed-eye content face, with an occasional tongue-out grin. */
export const SMILE = v3("yawn", "smile", .45, { source: "right", smooth: true, sequence: [1,5,1,6], durations: [1600,800,1400,500] });
/** Curling up: settle (intro) then breathe while curled. */
export const CROUCH = v3("crouch-lick", "crouch", .48, { smooth: true, intro: [0,1], introDurations: [300,450],
  sequence: [2,5,2,5], durations: [2200,1400,2600,1200] });
/**
 * Licking while curled. Starts with the same settle intro; the controller skips it when already curled.
 * The tongue frames dissolve into each other (`smooth`), which reads as the in-between poses the sheet lacks.
 */
export const LICK = v3("crouch-lick", "lick", .48, { loop: false, smooth: true, intro: [0,1], introDurations: [300,450],
  sequence: [2,3,2,4,5,2,3,2], durations: [300,450,300,450,800,400,450,400] });
export const SPRITES = [IDLE, WALK, LEAN, JUMP, STAND, SHAKE, LIE_FRONT, LIE_DOWN, RECLINE, SIT, SCRATCH, YAWN, SMILE, CROUCH, LICK] as const;
/** Sitting frames used while Hana watches the cursor: head raised vs level. */
export const SIT_LOOK = { up: 0, level: 6, levelAlt: 7 } as const;
const BY_ACTION: Record<DesktopAction, SpriteClip> = {
  "idle-stand": IDLE, "stand-up": STAND, walk: WALK, run: WALK, lean: LEAN, jump: JUMP, fall: JUMP, land: JUMP,
  sit: SIT, "lie-front": LIE_FRONT, "lie-down": LIE_DOWN, recline: RECLINE, shake: SHAKE, yawn: YAWN, scratch: SCRATCH, crouch: CROUCH, lick: LICK, smile: SMILE
};
export function findSprite(action: DesktopAction, facing: Facing): SpriteClip {
  const clip = BY_ACTION[action];
  const mirror = clip.source === "right" ? facing === "left" : clip.source === "left" ? facing === "right" : false;
  return { ...clip, mirror };
}
const total = (list?: readonly number[]) => (list ?? []).reduce((a, b) => a + b, 0);
/** Milliseconds of the settle-in intro, so a clip can start already settled. */
export function introLength(action: DesktopAction): number { return total(BY_ACTION[action].introDurations); }
/** Milliseconds until a one-shot clip ends; Infinity for loops. */
export function clipLength(action: DesktopAction): number {
  const clip = BY_ACTION[action];
  return clip.loop ? Infinity : total(clip.introDurations) + total(clip.durations);
}
/**
 * Getting-up frames for a pose that has a settle-in intro: the intro played backwards (a bit quicker),
 * minus frames that are already part of the settled cycle. Undefined for poses without an intro.
 */
export function outroOf(action: DesktopAction): { frames: readonly number[]; durations: readonly number[] } | undefined {
  const clip = BY_ACTION[action];
  if (!clip.intro || !clip.introDurations) return undefined;
  const settled = new Set(clip.sequence ?? []);
  const frames: number[] = [], durations: number[] = [];
  for (let i = clip.intro.length - 1; i >= 0; i--) {
    if (settled.has(clip.intro[i])) continue;
    frames.push(clip.intro[i]); durations.push(Math.max(120, Math.round(clip.introDurations[i] * .6)));
  }
  return frames.length ? { frames, durations } : undefined;
}
/** Frame shown `age` seconds into a timed frame list; the last frame is held afterwards. */
export function frameAt(frames: readonly number[], durations: readonly number[], age: number): number {
  let t = age * 1000;
  for (let i = 0; i < durations.length; i++) { if (t < durations[i]) return frames[i]; t -= durations[i]; }
  return frames[frames.length - 1];
}
export interface FramePhase {
  index: number;
  /** Frame that follows, with how far the dissolve into it has progressed (0..1); absent when the clip cuts between frames. */
  next?: number; blend: number;
}
/** Position inside a timed cycle: the step, plus (for `smooth` clips) the dissolve toward the following step. */
function cyclePhase(clip: SpriteClip, age: number): FramePhase {
  const seq = clip.sequence ?? [], dur = clip.durations ?? [];
  if (!seq.length) return { index: Math.floor(age * clip.fps) % clip.frames.length, blend: 0 };
  let t = age * 1000;
  const introTotal = total(clip.introDurations), cycle = total(dur);
  let frames: readonly number[], times: readonly number[], wrapTo: number | undefined;
  if (clip.intro && clip.introDurations && t < introTotal) { frames = clip.intro; times = clip.introDurations; wrapTo = seq[0]; } // the cycle follows the intro
  else {
    t -= introTotal;
    if (!clip.loop && t >= cycle) return { index: seq[seq.length - 1], blend: 0 };
    t %= cycle;
    frames = seq; times = dur; wrapTo = clip.loop ? seq[0] : undefined; // one-shots hold their last frame
  }
  for (let i = 0; i < times.length; i++) {
    if (t >= times[i]) { t -= times[i]; continue; }
    const following = i + 1 < frames.length ? frames[i + 1] : wrapTo;
    if (!clip.smooth || following === undefined || following === frames[i]) return { index: frames[i], blend: 0 };
    const tail = Math.min(160, times[i] * .45), into = t - (times[i] - tail);
    return into <= 0 ? { index: frames[i], blend: 0 } : { index: frames[i], next: following, blend: into / tail };
  }
  return { index: frames[frames.length - 1], blend: 0 };
}
/** Frame (and dissolve toward the next frame) for an action at `age` seconds; physics-driven clips pick by phase, not time. */
export function framePhase(action: DesktopAction, age: number, velocityY: number): FramePhase {
  if (action === "stand-up") return { index: 0, blend: 0 };
  if (action === "jump") return { index: age < .12 ? 0 : velocityY < -200 ? 1 : 2, blend: 0 };
  if (action === "fall") return { index: 2, blend: 0 };
  if (action === "land") return { index: 3, blend: 0 };
  if (action === "lean") return { index: age < .12 ? 0 : age < .24 ? 1 : 2 + (Math.floor((age - .24) * 3) % 2), blend: 0 };
  if (action === "walk" || action === "run") return { index: Math.floor(age * (action === "run" ? 12 : 8)) % 4, blend: 0 };
  return cyclePhase(BY_ACTION[action], age);
}
export function frameIndex(action: DesktopAction, age: number, velocityY: number): number { return framePhase(action, age, velocityY).index; }
/** Drawn bounds of a frame in CSS pixels relative to the feet anchor (before mirroring). */
export function frameBounds(clip: SpriteClip, index: number) {
  const f = clip.frames[index], [sx, sy, sw, sh] = f.rect, [fx, fy] = f.foot;
  const left = (sx - fx) * clip.scale, top = (sy - fy) * clip.scale, width = sw * clip.scale, height = sh * clip.scale;
  return { left: clip.mirror ? -left - width : left, top, width, height };
}
