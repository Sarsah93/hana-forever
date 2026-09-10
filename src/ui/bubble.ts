import type { Bubble, BubbleKind } from "../domain/needs";
import { parseClock } from "../domain/needs";
import { CLOCK, ICON_SVG } from "./icons";
/** Thought bubble beside the head with an illustrated icon: bone, ball, palm or wall clock. CSS-pixel space. */
export interface BubblePlacement { headX: number; headTop: number; side: "left" | "right"; }
const ICON_SIZE = 38;
const images = new Map<BubbleKind, HTMLImageElement>();
function icon(kind: BubbleKind): HTMLImageElement {
  let img = images.get(kind);
  if (!img) { img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ICON_SVG[kind]); images.set(kind, img); }
  return img;
}
/** Warm the icon cache so the first bubble does not pop in without its picture. */
export function preloadBubbleIcons() { for (const kind of Object.keys(ICON_SVG) as BubbleKind[]) icon(kind); }
/** Hour and minute hands for the reminder time, drawn over the SVG face so they stay crisp and exact. */
function drawHands(ctx: CanvasRenderingContext2D, label?: string) {
  const minutes = label ? parseClock(label) : 12 * 60, hour = (minutes / 60) % 12, minute = minutes % 60;
  const k = ICON_SIZE / 64, cx = (CLOCK.cx - 32) * k, cy = (CLOCK.cy - 32) * k;
  const hand = (angle: number, length: number, width: number) => {
    ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(angle) * length * k, cy - Math.cos(angle) * length * k); ctx.stroke();
  };
  ctx.strokeStyle = "#3a2a22"; ctx.lineCap = "round";
  hand((hour + minute / 60) / 6 * Math.PI, CLOCK.hour, 2.4);
  hand(minute / 30 * Math.PI, CLOCK.minute, 1.7);
  ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.arc(cx, cy, 1.7, 0, Math.PI * 2); ctx.fill();
}
/** Returns the bubble rect (for hit testing) or undefined when nothing is drawn. */
export function drawBubble(ctx: CanvasRenderingContext2D, bubble: Bubble, place: BubblePlacement, canvasWidth: number) {
  const fade = Math.min(1, bubble.age / .35, (bubble.ttl - bubble.age) / .6);
  if (fade <= 0) return undefined;
  const dir = place.side === "left" ? -1 : 1;
  const w = 70, h = 58;
  let cx = place.headX + dir * 68; cx = Math.max(w / 2 + 4, Math.min(canvasWidth - w / 2 - 4, cx));
  const cy = Math.max(h / 2 + 6, place.headTop - 8);
  const bob = Math.sin(bubble.age * 2.2) * 2;
  ctx.save(); ctx.globalAlpha = fade;
  ctx.fillStyle = "rgba(255,252,247,.97)"; ctx.strokeStyle = "#cdb6a3"; ctx.lineWidth = 1.5;
  // trailing thought dots from the head toward the cloud
  for (const [t, r] of [[.28, 3], [.55, 4.5]] as const) {
    const x = place.headX + (cx - place.headX) * t + dir * 6, y = place.headTop + 10 + (cy - place.headTop - 10) * t + bob * t;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.translate(cx, cy + bob);
  ctx.beginPath();
  const lobes = [[-21, -11, 17], [0, -19, 19], [21, -11, 17], [25, 8, 15], [0, 17, 17], [-25, 8, 15]] as const;
  for (const [x, y, r] of lobes) ctx.moveTo(x + r, y), ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, 32, 24, 0, 0, Math.PI * 2); ctx.fill();
  const img = icon(bubble.kind);
  if (img.complete && img.naturalWidth) ctx.drawImage(img, -ICON_SIZE / 2, -ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
  if (bubble.kind === "clock") drawHands(ctx, bubble.label);
  ctx.restore();
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
}
