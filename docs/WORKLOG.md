# 작업 로그 (WORKLOG)

작업일마다 무엇을 했고, 무엇을 확인했고, 무엇이 남았는지 기록한다. 최신 항목이 위에 온다.
세부 설계는 [ARCHITECTURE.md](ARCHITECTURE.md), 동작·제약은 [DESKTOP_MOTION.md](DESKTOP_MOTION.md), 빌드는 [BUILD.md](BUILD.md), 아트 파이프라인은 [../assets/sprites/README.md](../assets/sprites/README.md)를 본다.

## 2026-09-10 · 액션 패널 분리, 다중 모니터, 요구·시선·쓰다듬기, 집중 모드, 스프라이트 6종

요청 항목과 처리 결과.

| # | 요청 | 결과 | 어디에 |
| --- | --- | --- | --- |
| 1.1 | 패널 드래그, 하나를 가리지 않게 열기 | **완료.** 패널을 별도 창(`panel` 라벨, `panel.html`)으로 분리. 제목줄을 잡고 끌 수 있고, 열 때 하나 창 옆 여유 있는 쪽·발 높이에 맞춰 배치 | `src/panel.ts`, `src/ui/panel-view.ts`, `src/main.ts` `placePanel`, `src-tauri/src/lib.rs` `panel_*` |
| 1.2 | 따라가기 on/off | **완료.** 패널 제목줄의 "따라가기" 버튼(기본 끔). 켜면 하나가 움직일 때 패널이 같은 상대 위치로 따라감. 켜는 순간 사용자가 옮겨 둔 패널 위치를 기준으로 오프셋을 다시 잼 | `main.ts` `applySettings`/`draw`, `lib.rs` `panel_move`/`panel_position` |
| 1.3 | 탭 분리, 이름 "액션 패널", 교감 준비 | **완료.** 탭: 제자리 · 왼쪽 · 오른쪽 · 뒤 · 교감 · 설정. 교감 탭에 쓰다듬기·간식 주기·놀아주기(동작함), 말 걸기(준비 중, 비활성) | `panel-view.ts` |
| 2 | 확장 모니터로 이동 | **완료.** Rust가 모든 모니터의 작업 영역·배율을 보내고, 물리는 인접 모니터를 한 바닥으로 취급. 바닥 높이가 다르면 내려서 떨어지고, 낮은 쪽에서 높은 쪽(≤90px)으로는 뛰어 오름. 더 높으면 벽처럼 돌아섬 | `src/domain/motion.ts` `monitorsOf`/`insideDisplays`/`stepUp`, `desktop.rs` `monitors` |
| 3 | 머리 쓰다듬기 호버 → 웃기 | **완료(제약 있음).** 머리 영역에서 마우스를 문지르면(이동 36px 이상 + 방향 반전 1회) 쓰다듬기로 인식. 엎드린 뒤 하품 시트의 눈감고 웃는 프레임·혀 내민 프레임을 번갈아 재생. 서 있는 자세의 웃는 얼굴 에셋은 없음 → 추가 제작 대상 | `src/domain/petting.ts`, `desktop-controller.ts` `setPetting`, `manifest.ts` `SMILE` |
| 4 | 두 발 서기 크기, 시트 간 크기 정합 | **완료.** 두 발 서기 0.168 → 0.21(네발 서기 높이의 약 1.4배). 새 시트는 대조 시트로 보정: front-shake/crouch .48, scratch .455, recline .46, lie-front .52, yawn .41 | `tools/sprites/calibrate.cjs`, `tools/sprites/calibration.json`, `docs/previews/size-calibration.png` |
| 5.1 | 랜덤 요구 생각 풍선 | **완료.** 2.5–5.5분 간격으로 간식(뼈)·장난감(공)·쓰다듬기(손바닥) 중 하나. 여유 있는 쪽에 풍선, 60초 뒤 사라짐. 요구 중에는 정면 두 발 서기로 조름 | `src/domain/needs.ts`, `src/ui/bubble.ts` |
| 5.2 | 점심·퇴근 벽시계 풍선, 설정 | **완료.** 설정 탭의 시간 입력과 트레이 "알림 시간" 하위 메뉴(점심 11:30–13:00, 퇴근 17:00–19:00, 알림 켜기/끄기) 양쪽에서 설정. 하루 한 번만 울림(날짜 기록) | `needs.ts`, `lib.rs` `build_tray`/`sync_tray` |
| 5.3 | 쓰다듬기 요구 시 정면 두 발 서기 | **완료.** 모든 요구에서 두 발 서기. 쓰다듬으면 요구 해소 → 웃기 | `desktop-controller.ts` |
| 6 | 커서를 시선으로 따라가기 | **완료(제약 있음).** 커서가 가까이에서 움직이면 옆으로 앉아(scratch 시트의 앉기 프레임) 커서 쪽을 보고, 커서가 위면 고개 든 프레임. 커서가 3초 멈추면 원래대로. 정면 대기·엎드린 자세의 고개 돌림 프레임은 없음 → 추가 제작 대상 | `src/domain/gaze.ts`, `manifest.ts` `SIT_LOOK` |
| 7 | 돌아다닐 때도 두 발 서기 | **완료.** 자율 선택표에 두 발 서기(5%) 포함 | `desktop-controller.ts` `CHOICES` |
| 8 | 스프라이트 6종 추가 | **완료.** `C:\hana forever\assets\sprites`의 6장을 `assets/sprites/_source/v3/`로 복사하고, 회색/체커 배경을 키잉해 `motion-v3/hana-atlas-v3.png`(1536×3430, 4.3MB)로 패킹. 털기·엎드리기(고개 들기/내리기)·뒤돌아보기·앉기·턱 긁기·하품·웃기·웅크리고 되새김질 클립 등록 | `tools/sprites/extract.cjs`, `src/assets/motion-v3.ts`(생성), `manifest.ts` |
| 9 | 문서·추적성 | **완료.** 이 파일 신설, README·ARCHITECTURE·DESKTOP_MOTION·BUILD·스프라이트 README 갱신 | `docs/` |
| + | 콘솔(프롬프트) 창 제거 | **완료.** 릴리스 빌드에 `windows_subsystem = "windows"` 적용. `npm run tauri dev`는 디버그 빌드라 터미널이 그대로 보임 | `src-tauri/src/main.rs` |
| + | 앱 아이콘 교체 | **완료.** 투명 배경 네발 서기 이미지를 여백 12%로 잘라 1024² 소스로 만들고 `tauri icon`으로 전체 세트 재생성 | `tools/sprites/icon.cjs`, `assets/icon/hana-icon.png`, `src-tauri/icons/` |
| + | 집중 모드(방해 금지) | **완료.** 설정 탭 체크박스와 트레이 항목. 켜면 창을 피해 가장 가까운 빈 바닥으로 옮겨 조용히 엎드림(걷기·점프·풍선·커서 시선 없음). 빈 곳이 없으면 창을 숨김(포커스 뺏지 않고 복귀). 0.5초마다 재확인, 1.5초 이상 빈 자리가 유지되면 돌아옴. 끄면 빈 자리 중 랜덤 위치로 복귀 | `motion.ts` `freeFloorSpots`/`isClearSpot`, `desktop-controller.ts` `enforceFocus`, `lib.rs` `set_mascot_visible` |
| + | 투명 영역 클릭 통과 | **덤으로 완료.** 30Hz로 전역 커서를 읽어 캔버스의 알파를 확인, 하나 몸/풍선 위에서만 마우스를 받고 나머지는 통과. 창을 320×300으로 키워도 바탕화면 클릭을 막지 않음 | `main.ts` `pollCursor`, `lib.rs` `cursor_position` |

### 같은 날 피드백 반영 (실행 중 관찰 후)

| # | 피드백 | 결과 | 어디에 |
| --- | --- | --- | --- |
| F1 | "쉬기"는 서 있는 상태가 아니라 하품·엎드리기·엎드려 쉬기·앉기·뒤돌아보기를 아우르는 상태여야 하고, 자유 행동에도 쉬는 비율이 있어야 함 | **완료.** 패널의 "쉬기"를 "서 있기"로 바꾸고, 새 "쉬기" 버튼은 휴식 자세(앉기 4·엎드리기 4·엎드려 쉬기 3·뒤돌아보기 2·웅크리기 2·하품 2 가중치) 중 하나를 좌우 자동으로 고름. 자율 선택에서 휴식 40%, 쉬는 중에는 60% 확률로 다음도 휴식 자세라 휴식이 한동안 이어짐. 900초 시뮬레이션에서 휴식 비율 30% 이상을 테스트로 고정 | `desktop-controller.ts` `rest()`/`REST_POSES`/`CHOICES`, `panel-view.ts` |
| F2 | 웅크리고 되새김질을 웅크리고 앉기 / 앉은 채로 되새김질 두 개로 분리, 연속 사용 | **완료.** `crouch`(인트로 0→1 후 2·5 호흡 반복)와 `lick`(2·3·2·4·5·2·3·2 원샷). 서 있을 때 되새김질을 누르면 먼저 웅크리고, 이미 웅크려 있으면 인트로 없이 바로 핥음. 되새김질이 끝나면 웅크린 자세로 남음. 간식 주기도 같은 경로 | `manifest.ts` `CROUCH`/`LICK`/`introLength`, `desktop-controller.ts` `curl()` |
| F3 | 쓰다듬기 호버 시 자세 3개가 빠르게 바뀌고 하품 자세로 끝나며 좌우가 뒤바뀌어 보임 | **완료.** 쓰다듬기 시작 시 엎드리기(방향은 여유 쪽)로 가만히 있다가 **2초 이상** 이어질 때만 눈감고 웃는 자세로 바뀜(2초 전에 손을 떼면 그대로 엎드려 있음). 하품 시트가 lie-front와 같은 방향(엉덩이 왼쪽·머리 오른쪽)의 그림이라 `source: "right"`로 등록해 엎드린 방향대로 반전 → 좌우가 뒤집히지 않음. 웃는 얼굴 사이클도 느리게(1.6s/0.8s/1.4s/0.5s). 교감 탭 쓰다듬기 버튼은 4초 유지 | `manifest.ts` `YAWN`/`SMILE`, `desktop-controller.ts` `setPetting` |

| F4 | GitHub Actions에서 setup 파일과 .exe 실행 파일 빌드 | **완료.** `build.yml`이 `hana-forever-setup`(NSIS)과 `hana-forever-portable`(무설치 exe) 두 Artifact를 올리고, `release.yml`이 태그 시 두 파일을 초안 릴리스에 첨부. 같은 브랜치 재푸시는 이전 실행 취소, 릴리스는 빌드 전에 `npm test` 실행. 실제 Actions 실행 결과는 다음 push 후 확인 필요 | `.github/workflows/build.yml`, `.github/workflows/release.yml` |

### 검증

- `npm test`: 32개 통과 (기존 물리 15 + 새 행동 17: 모니터 사이 걷기/낙하/뛰어오르기/벽 처리, 요구 풍선·측 선택·해소, 알림 1일 1회, 쓰다듬기 2초 후 웃기·방향 유지, 원샷 종료, 웅크리기/되새김질 연속·"쉬기" 선택, 시선 추적 시작/종료, 자율 선택에 두 발 서기·휴식 30% 이상 포함, 쓰다듬기 감지기, 미러링·프레임 순서, 집중 모드 이동/숨김/복귀).
- `npm run build`(tsc + vite 두 페이지), `cargo check` 통과.
- `npm run tauri dev` 실제 실행: 작업 표시줄 위 렌더링(엎드리기·걷기·대기), 트레이 메뉴(액션 패널/데려오기/집중 모드/알림 시간/종료), 우클릭·F2로 별도 패널 창 열림(제자리 탭·상태줄), 커서가 털 위에 있을 때만 WebView2가 잡히고 배경에서는 바탕화면이 잡히는 것을 `WindowFromPoint`로 확인. 새 트레이 아이콘 표시 확인.
- 자동으로 확인하지 못한 것: 실제 두 번째 모니터에서의 이동(가상 2모니터 테스트·브라우저 미리보기로 대체), 150%/200% 배율에서의 패널 배치, 점심/퇴근 실제 시각 알림(시간 주입 테스트로 대체), 릴리스 설치 파일(`npm run tauri build`)의 콘솔 창 제거.

### 알려진 제약 · 다음 작업

- 서 있는 자세로 웃는 표정, 정면 대기/엎드림에서 고개만 돌리는 프레임이 없다. 에셋이 오면 `SMILE`·시선 로직에 프레임만 추가하면 된다.
- motion-v2(대기·걷기·기대기·점프)는 머리가 큰 아기 스타일, v3 시트는 좀 더 자란 인상이라 전환 시 스타일 차이가 보인다. 대기/걷기를 v3 스타일로 다시 생성하는 것이 다음 아트 과제.
- 하나가 서 있는 동안 창이 그 위로 오면 여전히 그 자리에 있다(집중 모드에서만 피함). 창 위 착지 후 그 창이 최소화되면 떨어진다.
- 패널을 사용자가 옮긴 뒤 따라가기를 켜면 그 위치를 기준으로 따라가지만, 따라가는 중에 옮기면 다음 이동 때 원래 오프셋으로 돌아간다.
- 집중 모드의 "빈 공간" 판정은 바닥(작업 표시줄 윗선) 기준이며 창 위 공간은 세지 않는다.
- 말 걸기는 자리만 있다(비활성).

## 2026-09-09 · 첫 구현 검증 (이전 세션)

작업 표시줄 물리, 창 충돌·기대기, 점프, motion-v2 키포즈 아틀라스, 브라우저 미리보기, 빌드/배포 워크플로. 상세는 [DESKTOP_MOTION.md](DESKTOP_MOTION.md)의 2026-09-09 절.
