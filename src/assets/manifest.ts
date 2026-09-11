import type { ActionId, Facing } from "../domain/actions";
import generated from "./sprites.generated.json";

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
 * Written by `tools/mascot-kit/build_sprites.py`, so swapping in a different dog
 * never means hand-editing this file. Each clip is a transparent sprite already
 * normalised to the shared canvas and foot line.
 */
export const SPRITES: readonly SpriteClip[] = generated.sprites as SpriteClip[];

export function findSprite(action: ActionId, facing: Facing): SpriteClip | undefined {
  return SPRITES.find((clip) => clip.action === action && clip.facing === facing);
}
