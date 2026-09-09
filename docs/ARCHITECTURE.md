# Hana Forever architecture

`Hana Forever`는 Windows 투명·항상 위 창을 가진 Tauri 2 데스크톱 마스코트다. Rust는 OS 경계(창 위치, 클릭 통과, 다중 모니터, 입력 감시)를, TypeScript는 행동 선택·물리·애니메이션을 담당한다.

```text
사용자 입력 / 시간 / 화면 경계
              │
              ▼
      행동 선택기 (향후 needs·affinity·quests)
              │ ActionId + Facing
              ▼
  MascotMachine ──▶ Sprite manifest ──▶ Web renderer
              │                             │
              ▼                             ▼
       fixed-step motion             Tauri window bridge
```

## 확장 경계

- `src/domain/`: 행동 의미, 전환, 물리. 렌더링 파일이나 Tauri API를 직접 의존하지 않는다.
- `src/assets/`: 아트의 메타데이터만 보유한다. 교체 가능한 스프라이트 팩 단위로 확장한다.
- `src/platform/`: Tauri와 브라우저 프리뷰의 차이를 숨긴다.
- `src-tauri/`: 전역 마우스 추적, 작업 표시줄/창 가장자리 충돌, 저장소, 알림 같은 Windows 기능을 점진적으로 추가한다.

## 행동 설계 원칙

행동 ID는 `walk`처럼 의미 중심으로 고정하고, 프레임 파일명·프레임 수는 매니페스트에만 둔다. 따라서 새 액션·새 의상·계절 스킨이 생겨도 게임 로직을 건드리지 않는다. 일회성 액션은 끝난 뒤 `next`로 돌아가며, 반복 액션은 향후 선택기가 필요·시간·사용자 반응으로 전환시킨다.

## 다음 구현 순서

1. 하나의 투명 `idle-stand/front` 스프라이트를 제작·등록하고 실창에서 앵커를 보정한다.
2. 걷기/달리기·점프를 넣고 Rust에서 화면 작업 영역 충돌과 다중 모니터 좌표를 처리한다.
3. 전역 마우스 거리와 활성 창 가장자리를 이벤트 소스로 추가한다. 사용자가 명시적으로 켠 경우에만 추적한다.
4. SQLite 저장소에 친밀도·기분·인벤토리·퀘스트를 별도 도메인 모듈로 추가한다.

## 2026-09-09: 데스크톱 물리/스프라이트 구현

현재 런타임은 `DesktopController`가 실제 장면과 행동을 묶는다. 기존 `actions.ts`의 13개 의미 ID와 `MascotMachine`은 후속 행동 확장을 위해 보존하지만, 착지 타이밍을 시간 제한만으로 결정하지 않도록 현재 런타임에서 사용하지 않는다.

- `desktop-controller.ts`: 접지/점프/낙하/착지/기대기 및 자율 선택.
- `motion.ts`: 순수 TypeScript의 물리 픽셀 좌표, AABB, 바닥/창 면 충돌, 겹침 해소.
- `manifest.ts`: 실제 아틀라스 프레임 rect·발 앵커·재생 타이밍, 물리 단계에 따른 포즈 선택.
- `main.ts`: 120Hz accumulator와 Canvas 프레임 출력, 사용 가능한 행동 조작.
- `platform/window.ts`: 브라우저 가상 장면 / Tauri 장면, 절대 위치 IPC 병합.
- `src-tauri/src/desktop.rs`: Windows 모니터 작업 영역, 열린 창 프레임 및 테두리 억제.

정확한 구현 범위와 예외는 [DESKTOP_MOTION.md](DESKTOP_MOTION.md)에 기록한다.
