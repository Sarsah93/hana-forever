import type { DesktopAction } from "../domain/desktop-controller";
import type { Facing } from "../domain/actions";
import { V3_FRAMES, V3_SRC } from "./motion-v3";
export interface SpriteFrame { rect: readonly [number, number, number, number]; foot: readonly [number, number]; }
export interface SpriteClip {
  id: string; src: string; frames: readonly SpriteFrame[]; fps: number;
  /** Source pixels → CSS pixels. Calibrated so every pose reads as the same dog (docs/previews/size-calibration.png). */
  scale: number;
  /** Looped cycle: frame indices and how long each step is held (ms). */
  sequence?: readonly number[]; durations?: readonly number[];
  /** Played once before the cycle starts (settling into a lying pose, etc.). */
  intro?: readonly number[]; introDurations?: readonly number[];
  loop: boolean;
  /** Which way the art faces. Side art is mirrored at runtime for the opposite facing; front art never mirrors. */
  source: Facing;
  mirror?: boolean;
}
const frame = (x: number, y: number, w: number, h: number, fx: number, fy: number): SpriteFrame => ({ rect: [x, y, w, h], foot: [fx, fy] });
const src = "/motion-v2/hana-atlas.png";
// motion-v2 rectangles were measured from the generated 1254px atlas, not inferred from an ideal grid.
export const IDLE: SpriteClip = { id: "idle-stand", src, fps: 4, scale: .52, loop: true, source: "front",
  frames: [frame(60,19,195,294,157,306), frame(366,9,201,304,468,306), frame(683,19,198,294,782,306), frame(999,18,196,295,1097,306)],
  sequence: [0,1,0,2,3,0], durations: [900,350,900,120,250,650] };
export const WALK: SpriteClip = { id: "walk", src, fps: 8, scale: .49, loop: true, source: "right",
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
export const LIE_FRONT = v3("lie-front", "lie-front", .52, { source: "right",
  sequence: [0,1,0,2,0,3,1,0], durations: [1500,900,1300,140,1200,700,800,1100] });
export const LIE_DOWN = v3("lie-front", "lie-down", .52, { source: "right", intro: [4,5], introDurations: [450,650],
  sequence: [6,7,6,5,6,7], durations: [2200,1600,1800,700,2400,2000] });
export const RECLINE = v3("recline-back", "recline", .46, { source: "right",
  sequence: [0,1,2,1,3,0,4,5,6,5,7,4], durations: [1400,900,150,700,1100,1300,1000,900,160,800,1200,900] });
export const SIT = v3("scratch", "sit", .455, { source: "left",
  sequence: [6,7,6,0,6,7], durations: [1600,1200,1300,900,1400,1100] });
export const SCRATCH = v3("scratch", "scratch", .455, { loop: false, source: "left",
  sequence: [6,0,1,2,3,2,4,3,2,3,4,5,6,7], durations: [350,450,260,120,120,120,120,120,120,120,120,320,450,500] });
// The yawn sheet lies with the rump to the left and the head to the right, like lie-front: treat it as right-facing art
// so a dog lying to the left keeps lying to the left when she yawns or smiles.
export const YAWN = v3("yawn", "yawn", .41, { loop: false, source: "right",
  sequence: [0,1,2,3,4,3,2,5,6,7], durations: [450,400,260,520,750,320,260,520,700,450] });
/** Being petted: mostly the closed-eye content face, with an occasional tongue-out grin. */
export const SMILE = v3("yawn", "smile", .41, { source: "right", sequence: [1,5,1,6], durations: [1600,800,1400,500] });
/** Curling up: settle (intro) then breathe while curled. */
export const CROUCH = v3("crouch-lick", "crouch", .48, { intro: [0,1], introDurations: [300,450],
  sequence: [2,5,2,5], durations: [2200,1400,2600,1200] });
/** Licking while curled. Starts with the same settle intro; the controller skips it when already curled. */
export const LICK = v3("crouch-lick", "lick", .48, { loop: false, intro: [0,1], introDurations: [300,450],
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
function cycleFrame(clip: SpriteClip, age: number): number {
  let t = age * 1000;
  if (clip.intro && clip.introDurations) {
    const introTotal = total(clip.introDurations);
    if (t < introTotal) { for (let i = 0; i < clip.introDurations.length; i++) { if (t < clip.introDurations[i]) return clip.intro[i]; t -= clip.introDurations[i]; } }
    else t -= introTotal;
  }
  if (!clip.sequence || !clip.durations) return Math.floor(age * clip.fps) % clip.frames.length;
  const cycle = total(clip.durations);
  if (!clip.loop && t >= cycle) return clip.sequence[clip.sequence.length - 1];
  t %= cycle;
  for (let i = 0; i < clip.durations.length; i++) { if (t < clip.durations[i]) return clip.sequence[i]; t -= clip.durations[i]; }
  return clip.sequence[0];
}
export function frameIndex(action: DesktopAction, age: number, velocityY: number): number {
  if (action === "stand-up") return 0;
  if (action === "jump") return age < .12 ? 0 : velocityY < -200 ? 1 : 2;
  if (action === "fall") return 2;
  if (action === "land") return 3;
  if (action === "lean") return age < .12 ? 0 : age < .24 ? 1 : 2 + (Math.floor((age - .24) * 3) % 2);
  if (action === "walk" || action === "run") return Math.floor(age * (action === "run" ? 12 : 8)) % 4;
  return cycleFrame(BY_ACTION[action], age);
}
/** Drawn bounds of a frame in CSS pixels relative to the feet anchor (before mirroring). */
export function frameBounds(clip: SpriteClip, index: number) {
  const f = clip.frames[index], [sx, sy, sw, sh] = f.rect, [fx, fy] = f.foot;
  const left = (sx - fx) * clip.scale, top = (sy - fy) * clip.scale, width = sw * clip.scale, height = sh * clip.scale;
  return { left: clip.mirror ? -left - width : left, top, width, height };
}
