import type { Facing } from "./actions";
import type { ActionRequest } from "./desktop-controller";
import type { BubbleKind } from "./needs";
/** User-facing switches. Persisted by the mascot window; the action panel only edits a copy. */
export interface HanaSettings {
  /** 스스로 돌아다니기 */
  autonomous: boolean;
  /** 마우스 커서를 시선으로 따라가기 (커서 좌표만 읽고 어디에도 보내지 않는다) */
  gaze: boolean;
  /** 간식·장난감·쓰다듬기 요구 생각 풍선 */
  needs: boolean;
  /** 점심·퇴근 시간 벽시계 풍선 */
  reminders: boolean;
  /** "HH:MM" 24시간제 */
  lunch: string;
  leave: string;
  /** 액션 패널이 하나를 따라 움직임 */
  panelTracking: boolean;
  /** 집중 모드(방해 금지): 창을 피해 빈 곳에 조용히 있고, 자리가 없으면 숨는다 */
  focus: boolean;
}
export const DEFAULT_SETTINGS: HanaSettings = {
  autonomous: true, gaze: true, needs: true, reminders: true, lunch: "12:00", leave: "18:00", panelTracking: false, focus: false
};
export const SETTINGS_KEY = "hana.settings.v1";
export const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export function normalizeSettings(raw: unknown): HanaSettings {
  const defaults: Record<string, unknown> = { ...DEFAULT_SETTINGS }, s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in defaults)) continue;
    if (typeof defaults[k] === "boolean" && typeof v === "boolean") s[k] = v;
    if (typeof defaults[k] === "string" && typeof v === "string" && CLOCK_RE.test(v)) s[k] = v;
  }
  return s as unknown as HanaSettings;
}
export type InteractionKind = "pet" | "snack" | "toy" | "talk";
/** Messages from the action panel window to the mascot window. */
export type PanelCommand =
  | { type: "ready" }
  | { type: "action"; action: ActionRequest; facing: Facing }
  | { type: "interact"; kind: InteractionKind }
  | { type: "settings"; patch: Partial<HanaSettings> }
  /** Windows "run at sign-in" registration — OS state, not a HanaSettings field. */
  | { type: "autostart"; enabled: boolean }
  | { type: "guide" }
  | { type: "reset" } | { type: "click-through" } | { type: "quit" } | { type: "close" };
/** Snapshot pushed to the panel whenever it changes. */
export interface PanelState {
  settings: HanaSettings; status: string; need?: string; needKind?: BubbleKind;
  /** Registered to run at sign-in; undefined in the browser preview, where there is no OS to ask. */
  autostart?: boolean;
}
