import type { DesktopAction } from "../domain/desktop-controller";
import type { Facing } from "../domain/actions";
export interface SpriteFrame { rect: readonly [number, number, number, number]; foot: readonly [number, number]; }
export interface SpriteClip {
  src: string; frames: readonly SpriteFrame[]; fps: number; scale: number;
  sequence?: readonly number[]; durations?: readonly number[]; mirror?: boolean;
}
const frame = (x: number, y: number, w: number, h: number, fx: number, fy: number): SpriteFrame => ({ rect: [x, y, w, h], foot: [fx, fy] });
const src = "/motion-v2/hana-atlas.png";
// Rectangles were measured from this generated atlas (1254px), not inferred from an ideal grid.
// The feet anchors remove cell baseline drift without translating/scaling a still image to fake a gait.
export const IDLE: SpriteClip = { src, fps: 4, scale: .52,
  frames: [frame(60,19,195,294,157,306), frame(366,9,201,304,468,306), frame(683,19,198,294,782,306), frame(999,18,196,295,1097,306)],
  sequence: [0,1,0,2,3,0], durations: [900,350,900,120,250,650] };
export const WALK: SpriteClip = { src, fps: 8, scale: .49,
  frames: [frame(19,347,289,240,162,575), frame(331,345,282,244,472,577), frame(626,343,310,244,780,575), frame(945,350,297,237,1094,575)] };
export const LEAN: SpriteClip = { src, fps: 8, scale: .52,
  frames: [frame(54,601,219,323,140,917), frame(368,592,220,332,448,917), frame(682,592,223,332,765,917), frame(994,594,224,330,1078,917)] };
export const JUMP: SpriteClip = { src, fps: 8, scale: .52,
  frames: [frame(55,990,208,246,157,1224), frame(363,924,206,311,467,1223), frame(673,924,222,229,784,1141), frame(993,988,213,248,1100,1224)] };
export const STAND: SpriteClip = { src: "/stand-up/front-v1.png", fps: 1, scale: .168, frames: [frame(0,0,1024,1024,512,980)] };
export const SPRITES = [IDLE, WALK, LEAN, JUMP, STAND] as const;
export function findSprite(action: DesktopAction, facing: Facing): SpriteClip {
  const clip = action === "stand-up" ? STAND : action === "walk" || action === "run" ? WALK : action === "lean" ? LEAN :
    ["jump", "fall", "land"].includes(action) ? JUMP : IDLE;
  return { ...clip, mirror: facing === "left" && (clip === WALK || clip === LEAN) };
}
export function frameIndex(action: DesktopAction, age: number, velocityY: number): number {
  if (action === "stand-up") return 0;
  if (action === "jump") return age < .12 ? 0 : velocityY < -200 ? 1 : 2;
  if (action === "fall") return 2;
  if (action === "land") return 3;
  if (action === "lean") return age < .12 ? 0 : age < .24 ? 1 : 2 + (Math.floor((age - .24) * 3) % 2);
  if (action === "walk" || action === "run") return Math.floor(age * (action === "run" ? 12 : 8)) % 4;
  const durations = IDLE.durations!;
  let time = (age * 1000) % durations.reduce((a, b) => a + b, 0);
  for (let i = 0; i < durations.length; i++) { if (time < durations[i]) return IDLE.sequence![i]; time -= durations[i]; }
  return 0;
}
