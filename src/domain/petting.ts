import type { Point } from "./motion";
/**
 * Hover-petting: the pointer strokes back and forth over the head without a button held.
 * A stroke needs real travel and at least one reversal inside a short window, so a pointer
 * merely crossing Hana on its way somewhere else does not count.
 */
export class PettingDetector {
  private samples: { t: number; x: number; y: number }[] = [];
  private lastMove = -Infinity;
  active = false;
  constructor(readonly options = { window: 0.7, travel: 36, idle: 0.9 }) {}
  /** Feed a pointer position over the head. `t` in seconds. */
  move(t: number, p: Point): boolean {
    this.samples.push({ t, x: p.x, y: p.y });
    this.samples = this.samples.filter(s => t - s.t <= this.options.window);
    this.lastMove = t;
    let travel = 0, reversals = 0, prevDx = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const dx = this.samples[i].x - this.samples[i - 1].x, dy = this.samples[i].y - this.samples[i - 1].y;
      travel += Math.hypot(dx, dy);
      if (Math.abs(dx) > 1.5) { if (prevDx && Math.sign(dx) !== Math.sign(prevDx)) reversals++; prevDx = dx; }
    }
    if (!this.active && travel >= this.options.travel && reversals >= 1) this.active = true;
    return this.active;
  }
  /** Call every frame; ends the stroke when the pointer rests or leaves the head. */
  update(t: number, overHead: boolean): boolean {
    if (this.active && (!overHead || t - this.lastMove > this.options.idle)) this.reset();
    if (!overHead) this.samples = [];
    return this.active;
  }
  reset() { this.active = false; this.samples = []; }
}
