import type { ActionId, Facing } from "../domain/actions";

export interface SpriteClip {
  action: ActionId;
  facing: Facing;
  src: string;
  frameCount: number;
  fps: number;
  anchor: { x: number; y: number };
}

/**
 * The only source of truth for shipped animation files.
 * Each clip is a transparent, equally-sized PNG/WebP sprite strip, or one key pose.
 * Add generated clips here after visual QA; never point this at raw photos.
 */
export const SPRITES: readonly SpriteClip[] = [
  {
    action: "idle-stand",
    facing: "front",
    src: "/idle-stand/front-v1.png",
    frameCount: 1,
    fps: 1,
    anchor: { x: 0.5, y: 0.965 }
  },
  {
    action: "stand-up",
    facing: "front",
    src: "/stand-up/front-v1.png",
    frameCount: 1,
    fps: 1,
    anchor: { x: 0.5, y: 0.965 }
  }
];

export function findSprite(action: ActionId, facing: Facing): SpriteClip | undefined {
  return SPRITES.find((clip) => clip.action === action && clip.facing === facing);
}
