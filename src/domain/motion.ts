import type { ActionId, Facing } from "./actions";

export interface MotionState { x: number; y: number; velocityX: number; velocityY: number; }
const SPEED: Partial<Record<ActionId, number>> = { walk: 115, run: 255 };

/** Fixed-step movement keeps behaviour smooth and independent of monitor refresh rate. */
export function integrateMotion(state: MotionState, action: ActionId, facing: Facing, dtSeconds: number): MotionState {
  const speed = SPEED[action] ?? 0;
  const targetX = facing === "left" ? -speed : facing === "right" ? speed : 0;
  const blend = 1 - Math.exp(-14 * dtSeconds);
  let velocityY = state.velocityY + 1300 * dtSeconds;
  if (action === "jump" && state.velocityY >= 0 && state.y === 0) velocityY = -560;
  const y = Math.min(0, state.y + velocityY * dtSeconds);
  if (y === 0 && velocityY > 0) velocityY = 0;
  return { x: state.x + (state.velocityX + (targetX - state.velocityX) * blend) * dtSeconds, y, velocityX: state.velocityX + (targetX - state.velocityX) * blend, velocityY };
}
