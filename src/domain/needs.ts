import type { HanaSettings } from "./settings";
export type NeedKind = "snack" | "toy" | "pet";
export type BubbleKind = NeedKind | "clock";
export interface Bubble { kind: BubbleKind; age: number; ttl: number; label?: string; }
export type NeedsEvent =
  | { type: "need"; kind: NeedKind }
  | { type: "reminder"; which: "lunch" | "leave"; label: string }
  | { type: "satisfied"; kind: NeedKind }
  | { type: "expired"; kind: BubbleKind };
export interface NeedsOptions { minGap: number; maxGap: number; needTtl: number; reminderTtl: number; }
export const NEED_LABEL: Record<BubbleKind, string> = { snack: "간식 먹고 싶어요", toy: "놀아 주세요", pet: "쓰다듬어 주세요", clock: "시간이에요" };
export const NEED_KINDS: readonly NeedKind[] = ["snack", "toy", "pet"];
export const parseClock = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
/**
 * Random "I want…" thought bubbles plus lunch/leave wall-clock reminders.
 * Wall-clock time is injected so tests and the browser preview can drive it.
 */
export class NeedsModel {
  bubble?: Bubble;
  /** Need still waiting to be satisfied (survives the bubble timing out only while `bubble` exists). */
  active?: NeedKind;
  /** Reminder already shown today, keyed by event → day. Persisted by the host. */
  fired: Record<string, string> = {};
  private untilNext: number;
  private lastKind?: NeedKind;
  constructor(private random = Math.random, readonly options: NeedsOptions = { minGap: 150, maxGap: 330, needTtl: 60, reminderTtl: 90 }) {
    this.untilNext = this.gap();
  }
  private gap() { return this.options.minGap + this.random() * (this.options.maxGap - this.options.minGap); }
  tick(dt: number, now: number, settings: HanaSettings): NeedsEvent[] {
    const events: NeedsEvent[] = [];
    if (this.bubble) {
      this.bubble.age += dt;
      if (this.bubble.age >= this.bubble.ttl) { events.push({ type: "expired", kind: this.bubble.kind }); this.bubble = undefined; this.active = undefined; }
    }
    if (settings.reminders) {
      const date = new Date(now), minutes = date.getHours() * 60 + date.getMinutes(), today = dayKey(date);
      for (const which of ["lunch", "leave"] as const) {
        const target = parseClock(settings[which]);
        if (minutes === target && this.fired[which] !== today) {
          this.fired[which] = today;
          this.bubble = { kind: "clock", age: 0, ttl: this.options.reminderTtl, label: settings[which] };
          this.active = undefined;
          events.push({ type: "reminder", which, label: settings[which] });
        }
      }
    }
    if (settings.needs && !this.bubble) {
      this.untilNext -= dt;
      if (this.untilNext <= 0) {
        const pool = NEED_KINDS.filter(k => k !== this.lastKind);
        const kind = pool[Math.floor(this.random() * pool.length)] ?? "pet";
        this.lastKind = kind; this.active = kind;
        this.bubble = { kind, age: 0, ttl: this.options.needTtl };
        this.untilNext = this.gap();
        events.push({ type: "need", kind });
      }
    }
    return events;
  }
  /** Returns true when `kind` was what Hana was asking for. Any care still clears the bubble. */
  satisfy(kind: NeedKind): boolean {
    const wanted = this.active === kind;
    if (this.bubble && this.bubble.kind !== "clock") { this.bubble = undefined; this.active = undefined; }
    return wanted;
  }
  dismiss() { this.bubble = undefined; this.active = undefined; }
  /** Ask for something right now (tests, panel demo). */
  demand(kind: NeedKind) { this.active = kind; this.lastKind = kind; this.bubble = { kind, age: 0, ttl: this.options.needTtl }; }
}
