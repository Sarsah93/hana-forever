import type { Bubble } from "../domain/needs";
import { parseClock } from "../domain/needs";
/** Thought bubble beside the head with a hand-drawn icon: bone, ball, palm or wall clock. CSS-pixel space. */
export interface BubblePlacement { headX: number; headTop: number; side: "left" | "right"; }
const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};
function drawBone(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#f6e7cf"; ctx.strokeStyle = "#b98a5e"; ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const sx of [-1, 1]) { ctx.moveTo(sx * 13, -6); ctx.arc(sx * 13, -5, 5.2, 0, Math.PI * 2); ctx.moveTo(sx * 13, 6); ctx.arc(sx * 13, 5, 5.2, 0, Math.PI * 2); }
  ctx.fill(); ctx.stroke();
  rounded(ctx, -13, -4.5, 26, 9, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e4c9a2"; ctx.beginPath(); ctx.arc(-4, -1, 1.4, 0, Math.PI * 2); ctx.arc(4, 1.5, 1.4, 0, Math.PI * 2); ctx.fill();
}
function drawBall(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#d9e64a"; ctx.strokeStyle = "#8f9a2a"; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(-13, 0, 15, -Math.PI * .32, Math.PI * .32); ctx.stroke();
  ctx.beginPath(); ctx.arc(13, 0, 15, Math.PI * .68, Math.PI * 1.32); ctx.stroke();
}
function drawHand(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#f8d4b8"; ctx.strokeStyle = "#b8845f"; ctx.lineWidth = 1.5; ctx.lineJoin = "round";
  const fingers: [number, number, number][] = [[-9, -14, 4.2], [-3, -17, 4.4], [3, -16, 4.4], [9, -12, 4]];
  for (const [x, top, w] of fingers) { rounded(ctx, x - w / 2, top, w, 16, w / 2); ctx.fill(); ctx.stroke(); }
  rounded(ctx, -12, -4, 24, 17, 6); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(-13, 2); ctx.rotate(-.6); rounded(ctx, -2.4, -8, 4.8, 14, 2.4); ctx.fill(); ctx.stroke(); ctx.restore();
  rounded(ctx, -12, -4, 24, 17, 6); ctx.fill();
  ctx.strokeStyle = "#e0b090"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(0, 8, 7, 5); ctx.stroke();
}
function drawClock(ctx: CanvasRenderingContext2D, label?: string) {
  const minutes = label ? parseClock(label) : 12 * 60, hour = (minutes / 60) % 12, minute = minutes % 60;
  ctx.fillStyle = "#6b4a3a"; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-3, -14); ctx.lineTo(3, -14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#6b4a3a"; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#8b6d5e"; ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) { const a = i / 6 * Math.PI, r = i % 3 ? 10.5 : 9.5; ctx.beginPath(); ctx.moveTo(Math.sin(a) * r, -Math.cos(a) * r); ctx.lineTo(Math.sin(a) * 11.5, -Math.cos(a) * 11.5); ctx.stroke(); }
  ctx.strokeStyle = "#3a2a22"; ctx.lineCap = "round";
  const hourAngle = (hour + minute / 60) / 6 * Math.PI, minuteAngle = minute / 30 * Math.PI;
  ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(hourAngle) * 6, -Math.cos(hourAngle) * 6); ctx.stroke();
  ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(minuteAngle) * 9, -Math.cos(minuteAngle) * 9); ctx.stroke();
  ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); ctx.fill();
}
/** Returns the bubble rect (for hit testing) or undefined when nothing is drawn. */
export function drawBubble(ctx: CanvasRenderingContext2D, bubble: Bubble, place: BubblePlacement, canvasWidth: number) {
  const fade = Math.min(1, bubble.age / .35, (bubble.ttl - bubble.age) / .6);
  if (fade <= 0) return undefined;
  const dir = place.side === "left" ? -1 : 1;
  const w = 66, h = 54;
  let cx = place.headX + dir * 66; cx = Math.max(w / 2 + 4, Math.min(canvasWidth - w / 2 - 4, cx));
  const cy = Math.max(h / 2 + 6, place.headTop - 8);
  const bob = Math.sin(bubble.age * 2.2) * 2;
  ctx.save(); ctx.globalAlpha = fade;
  ctx.fillStyle = "rgba(255,252,247,.96)"; ctx.strokeStyle = "#c9b3a2"; ctx.lineWidth = 1.5;
  // trailing thought dots from the head toward the cloud
  for (const [t, r] of [[.28, 3], [.55, 4.5]] as const) {
    const x = place.headX + (cx - place.headX) * t + dir * 6, y = place.headTop + 10 + (cy - place.headTop - 10) * t + bob * t;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.translate(cx, cy + bob);
  ctx.beginPath();
  const lobes = [[-20, -10, 16], [0, -18, 18], [20, -10, 16], [24, 8, 14], [0, 16, 16], [-24, 8, 14]] as const;
  for (const [x, y, r] of lobes) ctx.moveTo(x + r, y), ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, 30, 22, 0, 0, Math.PI * 2); ctx.fill();
  if (bubble.kind === "snack") drawBone(ctx); else if (bubble.kind === "toy") drawBall(ctx); else if (bubble.kind === "pet") drawHand(ctx); else drawClock(ctx, bubble.label);
  ctx.restore();
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
}
