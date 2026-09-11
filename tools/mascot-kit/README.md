# 마스코트 키트

다른 강아지 사진을 넣으면 지금 앱이 그 강아지로 바뀝니다.
'하나'에 해당하는 것은 **사진과 이름 두 가지뿐**이고, 나머지 — 상태기계, 물리,
투명·항상 위 창, 트레이, 드래그, F2 패널, NSIS 배포, CI — 는 그대로 따라갑니다.

## 준비물

| 항목 | 비고 |
| --- | --- |
| Python 3.10+ | `pip install -r tools/mascot-kit/requirements.txt` |
| Node 20+, Rust, VS Build Tools | 설치 파일을 만들 때만 (docs/BUILD.md 참고) |
| `OPENAI_API_KEY` | API 경로를 쓸 때만. 없으면 자동으로 무료 경로 |

## 1. 사진 준비

폴더 하나에 **파일 이름으로 역할을 표시해서** 넣습니다. 이름이 곧 규약입니다.

```
photos/
  full-body-1.jpg          필수, 2장 이상 — 전신이 다 나온 사진
  full-body-2.jpg
  face-1.jpg               필수, 1장 이상 — 얼굴이 크게 나온 사진
  pose-stand-up-front.jpg  선택 — 특정 포즈를 찍은 사진
```

조건:

- 짧은 쪽이 **768px 이상**
- `.jpg` `.jpeg` `.png` `.webp`
- 강아지 한 마리만. 사람 손이나 다른 동물이 크게 걸치면 컷아웃이 지저분해집니다
- 배경은 아무래도 괜찮지만, 털 색과 확연히 다를수록 결과가 깔끔합니다

검사만 먼저 돌려볼 수 있습니다.

```bash
python tools/mascot-kit/build_sprites.py --input photos/ --check
```

조건을 못 채우면 무엇이 모자란지 짚어주고 멈춥니다.

## 2. 이름 정하기

`mascot.config.json` 을 엽니다.

```json
{
  "mascotName": "초코",
  "appName": "Choco Forever",
  "identifier": "com.chocoforever.desktop",
  "appearance": {
    "breed": "white maltese",
    "coat": "soft white straight fur",
    "features": "round black eyes, black nose, small drop ears",
    "exclude": "no harness, no collar, no clothes, no human hands"
  }
}
```

`appearance` 는 API 경로의 프롬프트에 그대로 들어갑니다. 영어로 적으세요.
`identifier` 는 다른 앱과 겹치지 않게 바꿔야 설치 시 충돌하지 않습니다.

```bash
python tools/mascot-kit/apply_config.py
```

창 제목, 트레이 메뉴, 드래그 손잡이, 번들 이름까지 이 한 줄로 맞춰집니다.

## 3. 스프라이트 만들기

```bash
python tools/mascot-kit/build_sprites.py --input photos/
```

`OPENAI_API_KEY` 가 있으면 API 경로, 없으면 무료 경로로 자동 선택합니다.
`--path api` 또는 `--path local` 로 강제할 수 있고, `--only idle-stand` 로 한 동작만
다시 만들 수 있습니다.

| | API 경로 (`gpt-image-1.5`) | 무료 경로 (`rembg`) |
| --- | --- | --- |
| 비용 | 이미지당 과금 | 없음 |
| 준비 | 키 발급 + 크레딧 충전 | 첫 실행 때 모델 약 1GB 다운로드 |
| 사진에 없는 포즈 | 만들어냄 | 못 만듦 — `pose-*.jpg` 로 직접 찍어 넣어야 함 |
| 목줄·옷 제거 | `exclude` 대로 지워짐 | 그대로 남음 |
| 품질 | 하나와 동일한 수준 | 원본 사진 품질에 그대로 좌우됨 |

무료 경로로 먼저 결과를 보고, 마음에 안 들면 API 경로로 다시 돌리는 순서를 권합니다.

## 4. 확인하고 빌드

```bash
npm run dev          # 브라우저에서 바로 확인
npm run tauri build  # 설치 파일 생성
```

`src-tauri/target/release/bundle/nsis/*-setup.exe` 가 결과물입니다.
관리자 권한 없이 설치되고, WebView2가 없는 PC면 설치 중 자동으로 함께 받습니다.

## 파이프라인이 하는 일

```
사진 ──▶ 검사 ──▶ 생성 ──▶ 정규화 ──▶ 매니페스트 ──▶ 앱
       조건 확인   API 또는   1024x1024      sprites.
                  rembg     바닥선 y=969   generated.json
```

**정규화 단계가 핵심입니다.** 생성 결과는 "투명 배경 어딘가에 있는 강아지"일 뿐이라
그대로 쓰면 동작을 바꿀 때마다 크기와 발 위치가 달라져 마스코트가 위아래로 튑니다.
알파 경계로 잘라내고, 공통 높이로 맞추고, 모든 포즈를 같은 바닥선에 앉힙니다.
규격은 `spritekit.py` 의 `CANVAS`, `BASELINE_Y`, `SUBJECT_MAX_H` 에 있습니다.

## 한계

현재 포즈는 `idle-stand/front`, `stand-up/front` 두 개입니다. 나머지 11개 동작은
스프라이트가 없어 🐩 자리표시자로 표시됩니다 — 하나도 지금 같은 상태입니다.
동작을 늘리려면 `poses.json` 에 항목을 추가하세요. 코드는 건드릴 필요가 없습니다.

프레임 애니메이션(걷기 등)은 아직 지원하지 않습니다. 매니페스트의 `frameCount`,
`fps` 자리는 이미 있으므로, 스프라이트 스트립을 만들 수 있게 되면 그때 채우면 됩니다.
