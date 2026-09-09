# Hana Forever architecture

`Hana Forever`는 Windows 투명·항상 위 창을 가진 Tauri 2 데스크톱 마스코트다. Rust는 OS 경계(창 위치, 클릭 통과, 다중 모니터, 커서 좌표, 트레이, 패널 창)를, TypeScript는 행동 선택·물리·애니메이션·요구·교감을 담당한다.

```text
전역 커서 · 시간 · 모니터/창 스냅샷 (Rust, 250ms / 33ms)
              │
              ▼
  DesktopController ── NeedsModel(요구·알림) ── GazeTracker(시선) ── PettingDetector(쓰다듬기)
              │ DesktopAction + Facing (+ frameOverride, bubble, hidden)
              ▼
  Sprite manifest(v2·v3 클립, 크기 보정) ──▶ Canvas 렌더러 + 생각 풍선
              │                                   │
              ▼                                   ▼
  액션 패널 창 (panel.html, 원격 조작)      Tauri window bridge (위치·표시·클릭 통과)
```

## 창 구성

| 창 | 파일 | 역할 |
| --- | --- | --- |
| `main` (320×300, 투명) | `index.html` → `src/main.ts` | 하나 렌더링, 물리 루프, 설정 저장(localStorage), 커서 폴링·픽셀 클릭 통과, 패널 배치 |
| `panel` (320×470, 숨김 시작) | `panel.html` → `src/panel.ts` | 액션 패널. 상태를 갖지 않고 `PanelCommand`를 보내고 `PanelState`를 받아 그린다 |

두 창은 Rust 명령 `panel_command`/`panel_state`로 서로에게 이벤트(`hana://panel-command`, `hana://panel-state`)를 전달한다. 패널 창은 `tauri.conf.json`에 미리 선언되어 명령 스레드에서 창을 만들지 않는다(닫기는 숨김으로 처리).

## 확장 경계

- `src/domain/`: 행동 의미, 전환, 물리, 요구, 시선, 쓰다듬기, 설정 타입. 렌더링이나 Tauri API를 직접 의존하지 않는다(클립 길이·앉기 프레임 인덱스만 `assets/manifest`에서 가져온다).
- `src/assets/`: 아트 메타데이터. `motion-v3.ts`는 `tools/sprites/extract.cjs`가 생성한다.
- `src/ui/`: 패널 DOM과 생각 풍선 드로잉.
- `src/platform/`: Tauri와 브라우저 미리보기의 차이를 숨긴다.
- `src-tauri/`: 모니터 작업 영역(`available_monitors().work_area`), Win32 창 열거(`EnumWindows`), 커서 좌표, 트레이 메뉴(알림 시간·집중 모드 체크), 패널 창 표시/이동, 마스코트 창 숨김/표시(포커스 비활성).
- `tools/sprites/`: 의존성 없는 PNG 코덱, 배경 키잉·프레임 추출·아틀라스 패킹, 크기 대조 시트, 아이콘 소스 생성.

## 행동 설계 원칙

행동 ID는 `walk`처럼 의미 중심으로 고정하고, 프레임 rect·순서·지속 시간은 매니페스트에만 둔다. 반복 클립은 `sequence`/`durations`(ms) 사이클과 선택적 `intro`를, 원샷 클립(`shake`·`yawn`·`scratch`·`crouch-lick`)은 사이클이 끝나면 컨트롤러가 `idle-stand`로 돌린다. 측면 아트는 `source` 방향을 기준으로 런타임 반전한다.

우선순위는 다음 순서다: 집중 모드 > 드래그/낙하/착지 물리 > 쓰다듬기(웃기) > 요구(두 발 서기) > 커서 바라보기 > 자율 선택(가중치 표, 수동 조작 후 25초 보류).

## 다중 모니터

`DesktopScene.monitors`가 있으면 인접 모니터의 작업 영역을 한 걸음 표면으로 취급한다. 몸의 네 모서리가 어떤 모니터의 작업 영역 안에라도 있으면 이동을 허용하고, 발이 밟는 바닥은 각 모니터 작업 영역의 아랫변이다. 바닥 높이가 낮아지면 떨어지고, 90px 이내로 높아지면 `stepUp` 신호로 뛰어오르며, 그보다 높으면 경계로 돌아선다. 배율은 발이 있는 모니터의 것을 쓴다.

## 상태와 저장

- 설정(`HanaSettings`)은 하나 창의 localStorage(`hana.settings.v1`)에 저장한다. 트레이 체크 상태는 `sync_tray`로 맞춘다.
- 알림이 울린 날짜(`hana.reminders.fired`)를 저장해 하루 한 번만 울린다.
- 패널의 마지막 탭은 패널 창 localStorage에 저장한다.

## 다음 구현 순서

1. 서 있는 웃기, 정면 고개 돌림 프레임 제작 후 `SMILE`·시선 로직에 연결.
2. 대기/걷기를 v3 스타일로 재생성해 스타일 통일.
3. 간식·장난감 종류 입력값(인벤토리)과 친밀도 저장소(SQLite) — 말 걸기 포함.
4. 창 위 공간까지 포함한 집중 모드 빈 공간 판정, 창이 위로 올 때 피하기.

## 2026-09-09: 데스크톱 물리/스프라이트 구현

`DesktopController`가 실제 장면과 행동을 묶는다. 기존 `actions.ts`의 13개 의미 ID와 `MascotMachine`은 후속 확장을 위해 보존하지만 런타임에서 쓰지 않는다. 정확한 구현 범위와 예외는 [DESKTOP_MOTION.md](DESKTOP_MOTION.md)에 기록한다.
