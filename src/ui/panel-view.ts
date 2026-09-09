import type { Facing } from "../domain/actions";
import type { ActionRequest, DesktopAction } from "../domain/desktop-controller";
import { CLOCK_RE, type HanaSettings, type InteractionKind, type PanelCommand, type PanelState } from "../domain/settings";
export interface PanelHost { send(command: PanelCommand): void; }
type Tab = "place" | "left" | "right" | "back" | "care" | "settings";
const TABS: readonly [Tab, string][] = [["place", "제자리"], ["left", "왼쪽"], ["right", "오른쪽"], ["back", "뒤"], ["care", "교감"], ["settings", "설정"]];
const PLACE: readonly [string, ActionRequest, string][] = [["서 있기", "idle-stand", "네 발로 서서 화면을 봐요"], ["쉬기", "rest", "하품·엎드리기·엎드려 쉬기·앉기·뒤돌아보기·웅크리기 중 하나"],
  ["두 발 서기", "stand-up", "정면 두 발 서기"], ["점프", "jump", "제자리 점프"], ["엎드리기", "lie-front", "고개 든 엎드리기"], ["엎드려 쉬기", "lie-down", "턱을 내리고 쉬기"],
  ["털기", "shake", "정면 털기"], ["하품", "yawn", "엎드려 하품"], ["웅크리고 앉기", "crouch", "웅크리고 앉기"], ["앉은 채로 되새김질", "lick", "웅크린 채 핥기 (서 있으면 먼저 웅크려요)"]];
const SIDE: readonly [string, DesktopAction][] = [["걷기", "walk"], ["빠르게", "run"], ["기대기", "lean"], ["앉기", "sit"], ["턱 긁기", "scratch"], ["엎드리기", "lie-front"], ["엎드려 쉬기", "lie-down"]];
const CARE: readonly [string, InteractionKind, string][] = [["쓰다듬기", "pet", "머리를 쓰다듬어요 (하나 머리 위에서 마우스를 문질러도 돼요)"], ["간식 주기", "snack", "간식을 줘요"],
  ["놀아주기", "toy", "장난감으로 놀아줘요"], ["말 걸기", "talk", "준비 중"]];
const TAB_KEY = "hana.panel.tab";
/**
 * Action panel DOM. Runs inside its own Tauri window (src/panel.ts) or inline in the browser preview.
 * Everything the user does is sent as a PanelCommand; the mascot window owns the actual state.
 */
export function mountPanel(root: HTMLElement, host: PanelHost, options: { native: boolean }) {
  root.innerHTML = `
    <header class="panel-title" data-tauri-drag-region>
      <strong data-tauri-drag-region>하나 · 액션 패널</strong>
      <div class="title-buttons">
        <button id="tracking" type="button" title="켜면 하나가 움직일 때 패널이 따라갑니다">따라가기 끔</button>
        <button id="close-panel" type="button" aria-label="패널 닫기">×</button>
      </div>
    </header>
    <nav class="tabs" role="tablist">${TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}">${label}</button>`).join("")}</nav>
    <section class="tab" data-tab="place"><div class="action-grid" id="place"></div></section>
    <section class="tab" data-tab="left"><div class="action-grid" id="left"></div></section>
    <section class="tab" data-tab="right"><div class="action-grid" id="right"></div></section>
    <section class="tab" data-tab="back"><div class="action-grid" id="back"></div><p class="hint">뒤로 돌아 어깨 너머로 화면을 바라봐요. 뒤돌아 걷기 등은 추후 추가 예정.</p></section>
    <section class="tab" data-tab="care"><div class="action-grid" id="care"></div><p class="hint">생각 풍선이 뜨면 원하는 걸 골라 주세요. 쓰다듬기는 하나 머리 위에서 마우스를 살살 문질러도 돼요.</p></section>
    <section class="tab" data-tab="settings">
      <label class="focus"><input type="checkbox" data-setting="focus" /> <strong>집중 모드 (방해 금지)</strong><br><small>창을 피해 빈 곳에 조용히 있고, 자리가 없으면 숨어요. 끄면 빈 자리로 돌아와요.</small></label>
      <label><input type="checkbox" data-setting="autonomous" /> 스스로 돌아다니기</label>
      <label><input type="checkbox" data-setting="gaze" /> 마우스 커서 바라보기</label>
      <label><input type="checkbox" data-setting="needs" /> 요구·생각 풍선 (간식·장난감·쓰다듬기)</label>
      <label><input type="checkbox" data-setting="reminders" /> 시간 알림 (벽시계 풍선)</label>
      <div class="times"><label>점심 <input type="time" data-time="lunch" /></label><label>퇴근 <input type="time" data-time="leave" /></label></div>
      <div class="action-grid"><button type="button" id="reset">바닥으로</button><button type="button" id="click-through">클릭 통과</button><button type="button" id="quit">종료</button></div>
      <p class="hint">← → 걷기 · Space 점프 · F2 패널 · 하나 드래그 · 더블클릭 점프<br>클릭 통과 후에는 트레이 메뉴로 되돌립니다.</p>
    </section>
    <footer><output id="status" aria-live="polite"></output><span id="need"></span></footer>`;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const button = (label: string, title: string, onClick: () => void, disabled = false) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.title = title; b.disabled = disabled; b.onclick = onClick; return b;
  };
  const act = (action: ActionRequest, facing: Facing) => host.send({ type: "action", action, facing });
  for (const [label, action, title] of PLACE) q("#place").append(button(label, title, () => act(action, "front")));
  for (const [label, action] of SIDE) { q("#left").append(button(`← ${label}`, label, () => act(action, "left"))); q("#right").append(button(`${label} →`, label, () => act(action, "right"))); }
  q("#back").append(button("← 뒤돌아 바라보기", "recline", () => act("recline", "left")), button("뒤돌아 바라보기 →", "recline", () => act("recline", "right")));
  for (const [label, kind, title] of CARE) q("#care").append(button(label, title, () => host.send({ type: "interact", kind }), kind === "talk"));
  q("#reset").onclick = () => host.send({ type: "reset" });
  q("#click-through").onclick = () => host.send({ type: "click-through" });
  q("#quit").onclick = () => host.send({ type: "quit" });
  q("#close-panel").onclick = () => host.send({ type: "close" });
  const tracking = q<HTMLButtonElement>("#tracking");
  let current: HanaSettings | undefined;
  tracking.onclick = () => host.send({ type: "settings", patch: { panelTracking: !current?.panelTracking } });
  if (!options.native) tracking.hidden = true;
  for (const input of root.querySelectorAll<HTMLInputElement>("input[data-setting]")) {
    input.onchange = () => host.send({ type: "settings", patch: { [input.dataset.setting!]: input.checked } });
  }
  for (const input of root.querySelectorAll<HTMLInputElement>("input[data-time]")) {
    input.onchange = () => { if (CLOCK_RE.test(input.value)) host.send({ type: "settings", patch: { [input.dataset.time!]: input.value } }); };
  }
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("nav [data-tab]")], panes = [...root.querySelectorAll<HTMLElement>("section[data-tab]")];
  function showTab(id: string) {
    for (const t of tabs) t.classList.toggle("active", t.dataset.tab === id);
    for (const p of panes) p.hidden = p.dataset.tab !== id;
    try { localStorage.setItem(TAB_KEY, id); } catch { /* storage unavailable */ }
  }
  for (const t of tabs) t.onclick = () => showTab(t.dataset.tab!);
  let saved = "place"; try { saved = localStorage.getItem(TAB_KEY) ?? "place"; } catch { /* ignore */ }
  showTab(TABS.some(([id]) => id === saved) ? saved : "place");
  return {
    setState(state: PanelState) {
      current = state.settings;
      for (const input of root.querySelectorAll<HTMLInputElement>("input[data-setting]")) input.checked = Boolean(state.settings[input.dataset.setting as keyof HanaSettings]);
      for (const input of root.querySelectorAll<HTMLInputElement>("input[data-time]")) { const v = state.settings[input.dataset.time as "lunch" | "leave"]; if (input.value !== v) input.value = v; }
      tracking.textContent = state.settings.panelTracking ? "따라가기 켬" : "따라가기 끔";
      tracking.classList.toggle("on", state.settings.panelTracking);
      q("#status").textContent = state.status;
      q("#need").textContent = state.need ? `💭 ${state.need}` : "";
    },
    showTab
  };
}
