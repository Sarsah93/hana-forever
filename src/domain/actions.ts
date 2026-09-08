/** Actions are semantic. Visual clips are bound separately so art can evolve safely. */
export const ACTION_IDS = [
  "idle-stand", "sit", "stand-up", "jump", "lie-front", "lie-diagonal",
  "sleep-curled", "rest-curled", "shake", "scratch", "walk", "run", "side-stand"
] as const;

export type ActionId = (typeof ACTION_IDS)[number];
export type Facing = "left" | "right" | "front";

export interface ActionSpec {
  id: ActionId;
  loop: boolean;
  facing: readonly Facing[];
  durationMs: readonly [number, number];
  movement: "none" | "walk" | "run" | "jump";
  next: ActionId;
}

export const ACTIONS: Record<ActionId, ActionSpec> = {
  "idle-stand": { id: "idle-stand", loop: true, facing: ["front"], durationMs: [2500, 7500], movement: "none", next: "idle-stand" },
  sit: { id: "sit", loop: true, facing: ["front"], durationMs: [2500, 6000], movement: "none", next: "idle-stand" },
  "stand-up": { id: "stand-up", loop: true, facing: ["front", "left", "right"], durationMs: [1800, 4200], movement: "none", next: "idle-stand" },
  jump: { id: "jump", loop: false, facing: ["front"], durationMs: [550, 750], movement: "jump", next: "idle-stand" },
  "lie-front": { id: "lie-front", loop: true, facing: ["front"], durationMs: [3500, 9000], movement: "none", next: "idle-stand" },
  "lie-diagonal": { id: "lie-diagonal", loop: true, facing: ["left", "right"], durationMs: [3500, 9000], movement: "none", next: "idle-stand" },
  "sleep-curled": { id: "sleep-curled", loop: true, facing: ["left", "right"], durationMs: [8000, 18000], movement: "none", next: "idle-stand" },
  "rest-curled": { id: "rest-curled", loop: true, facing: ["left", "right"], durationMs: [6000, 14000], movement: "none", next: "idle-stand" },
  shake: { id: "shake", loop: false, facing: ["front"], durationMs: [900, 1300], movement: "none", next: "idle-stand" },
  scratch: { id: "scratch", loop: false, facing: ["left", "right"], durationMs: [1800, 3000], movement: "none", next: "idle-stand" },
  walk: { id: "walk", loop: true, facing: ["left", "right"], durationMs: [2200, 6000], movement: "walk", next: "idle-stand" },
  run: { id: "run", loop: true, facing: ["left", "right"], durationMs: [1600, 4200], movement: "run", next: "idle-stand" },
  "side-stand": { id: "side-stand", loop: true, facing: ["left", "right"], durationMs: [1800, 4000], movement: "none", next: "idle-stand" }
};
