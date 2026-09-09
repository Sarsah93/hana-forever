import type { Point } from "./motion";
export interface Gaze { side: "left" | "right"; up: boolean; near: boolean; moving: boolean; }
/**
 * Turns raw cursor samples into a stable "where is she looking" signal with hysteresis,
 * so the head does not flicker when the cursor hovers near the centre line.
 */
export class GazeTracker {
  private last?: Point;
  private side: "left" | "right" = "right";
  private up = false;
  /** Seconds of continuous cursor motion nearby / of stillness. */
  activeFor = 0; idleFor = 0;
  constructor(readonly options = { near: 520, sideBand: 28, upBand: 60, still: 2.5 }) {}
  update(cursor: Point | undefined, head: Point, scale: number, dt: number): Gaze | undefined {
    if (!cursor) { this.last = undefined; this.activeFor = 0; this.idleFor += dt; return undefined; }
    const moved = this.last ? Math.hypot(cursor.x - this.last.x, cursor.y - this.last.y) : 0;
    this.last = cursor;
    const dx = cursor.x - head.x, dy = cursor.y - head.y;
    const near = Math.hypot(dx, dy) <= this.options.near * scale;
    const moving = moved > 2 * scale;
    if (moving && near) { this.activeFor += dt; this.idleFor = 0; } else { this.idleFor += dt; if (this.idleFor > this.options.still) this.activeFor = 0; }
    if (dx < -this.options.sideBand * scale) this.side = "left"; else if (dx > this.options.sideBand * scale) this.side = "right";
    if (dy < -this.options.upBand * scale) this.up = true; else if (dy > -this.options.upBand * scale * .4) this.up = false;
    return { side: this.side, up: this.up, near, moving };
  }
}
