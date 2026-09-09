# 하나 스프라이트 작업실

원본 사진과 영상은 상위 `assets/`에 그대로 보존합니다. 이 폴더에는 **실행에 쓸 투명 스프라이트**와 그 원본 시트(`_source/`, 배포 제외)를 둡니다.

## 폴더

| 경로 | 내용 | 배포 |
| --- | --- | --- |
| `motion-v2/hana-atlas.png` | 1254² RGBA, 대기·걷기·기대기·점프 16키포즈 | 포함 |
| `stand-up/front-v1.png`, `idle-stand/front-v1.png` | 1024² RGBA 정지 포즈 (idle-stand는 앱 아이콘 소스) | 포함 |
| `motion-v3/hana-atlas-v3.png` | 1536×3430 RGBA, 6개 시트 48프레임 | 포함 |
| `_source/v3/*.png` | 생성 시트 원본 (1536×1024 RGB, 회색/체커 배경) | 제외 |
| `_review/` | 검수용 이미지 | 제외 |

프레임 rect·발 앵커·재생 순서는 `src/assets/manifest.ts`(v2 실측)와 `src/assets/motion-v3.ts`(생성)에 있습니다.

## motion-v3 파이프라인

```powershell
node tools/sprites/extract.cjs --debug   # _source/v3 → motion-v3/hana-atlas-v3.png + src/assets/motion-v3.ts (+ tools/sprites/out/*-keyed.png 검수)
node tools/sprites/calibrate.cjs         # calibration.json의 스케일로 docs/previews/size-calibration.png 대조 시트
node tools/sprites/icon.cjs && npx tauri icon assets/icon/hana-icon.png -o src-tauri/icons   # 앱 아이콘 재생성
```

- 배경 키잉: 채도(max−min ≤ 20)와 밝기(≥ 58)로 "중립 회색" 후보를 잡고 시트 테두리에서 연결된 영역만 배경으로 삼는다. 코·눈(어두움)과 이빨(밝지만 안쪽)은 살아남고, 앞발 사이처럼 갇힌 회색 섬은 배경 톤과 같으면 구멍으로 뚫는다. 경계 3px는 채도·밝기 차로 알파를 주고 배경색을 빼서 회색 테두리를 없앤다.
- 프레임 검출: 3px 팽창 후 연결 요소, 작은 조각은 가까운 큰 몸통에 합치고, 행(중심 y 170px 묶음)→x 순으로 정렬해 8프레임을 기대한다.
- 발 앵커: 프레임 아래 8% 구간의 불투명 픽셀 가로 중심, 가장 낮은 불투명 행.
- 저장: 3/4 크기로 축소(200% 배율에서도 화면 크기의 2배 이상), 시트별로 한 선반씩 패킹, 여백 2px.

시트를 다시 받으면 `_source/v3/`에 같은 이름으로 덮어쓰고 위 명령을 다시 돌린 뒤 대조 시트로 스케일을 확인한다. 스케일은 `tools/sprites/calibration.json`과 `manifest.ts`에 같은 값을 둔다.

## 시트별 프레임 의미 (행 우선 0–7)

| 시트 | 프레임 | 클립 |
| --- | --- | --- |
| front-shake | 0 정면, 1 고개 숙임, 2 우상, 3 우, 4 좌, 5 좌상, 6·7 정면 | `shake` 원샷 |
| lie-front | 0–3 고개 든 엎드리기(2 눈감음, 3 갸웃), 4–7 고개 내리기(7 눈감음) | `lie-front` 반복, `lie-down` 반복(4·5 인트로) |
| recline-back | 0–7 뒤돌아 어깨 너머 보기(2·6 눈감음) | `recline` 반복 |
| scratch | 0 앉아 올려보기, 1 뒷다리 들기, 2–4 긁기, 5 내리기, 6·7 앉기 | `sit` 반복(6·7·0), `scratch` 원샷, 시선 프레임 `SIT_LOOK` |
| yawn | 0 엎드림, 1 눈감고 웃음, 2–4 하품, 5 혀 내민 웃음, 6·7 엎드림 (엉덩이 왼쪽·머리 오른쪽 → `source: right`) | `yawn` 원샷, `smile` 반복(1·5·1·6) |
| crouch-rumination | 0 정면 서기, 1 엎드리는 중, 2 웅크림, 3·4 핥기, 5 웅크림, 6 다가오기(미사용), 7 정면 서기(미사용) | `crouch` 반복(인트로 0·1, 사이클 2·5), `lick` 원샷(인트로 0·1, 2·3·2·4·5·2·3·2) |

## 크기 정합 규칙

같은 개로 보이도록 머리 크기와 자세별 높이를 맞춘다. 기준은 motion-v2 정면 대기 153px(CSS). 네발 서기 ≈ 155px, 앉기 ≈ 147px, 두 발 서기 ≈ 215px, 엎드리기 ≈ 98px, 정면 엎드림(원근으로 머리가 큼) ≈ 117px. 결과는 `docs/previews/size-calibration.png`.

## 제작 규약 (신규 시트)

- 1536×1024, 4×2 격자, 프레임 사이 최소 20px 여백, 배경은 단색 회색(#808080 근처) 또는 체커.
- 같은 시트 안에서는 같은 몸 크기, 발바닥 기준선 유지. 그림자·소품·격자선 없음(있어도 중립색이면 제거됨).
- 좌우가 대칭인 동작은 한 방향만 만들고 런타임 반전을 쓴다(`source` 방향을 매니페스트에 적는다).

다음 제작 대상: 서 있는 자세의 웃는 표정, 정면 대기/엎드림 고개 좌우 돌림, v3 스타일의 대기·걷기 재생성, 독립 달리기.
