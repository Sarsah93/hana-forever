# 빌드 확인 가이드

## 사전 준비 (Windows)

`npm run tauri build`로 `.exe`를 만들려면 Node 외에 Rust 툴체인이 필요합니다.

1. **Node.js 20 이상** — https://nodejs.org
2. **Rust** — https://rustup.rs 에서 `rustup-init.exe` 실행
3. **Visual Studio Build Tools** — "C++를 사용한 데스크톱 개발" 워크로드
   (Rust의 MSVC 링커가 필요로 합니다)
4. **WebView2 런타임** — Windows 11에는 기본 포함, Windows 10이면
   https://developer.microsoft.com/microsoft-edge/webview2 에서 설치

설치 확인:

```powershell
node -v
cargo --version
```

## 단계별 확인

빌드가 깨졌을 때 어디서 깨졌는지 좁히려면 아래 순서대로 실행합니다.

```powershell
npm install          # 1. 의존성 설치
npm run build        # 2. 타입 검사(tsc) + 프런트엔드 번들(vite) -> dist/
npm run tauri dev    # 3. 개발 모드로 실행해 창이 뜨는지 확인
npm run tauri build  # 4. 배포용 설치 파일 생성
```

2단계까지는 Rust 없이도 통과합니다. 즉 **2단계에서 실패하면 TypeScript 문제, 3~4단계에서 실패하면 Rust/Tauri 환경 문제**입니다.

## 산출물 위치

| 항목 | 경로 |
| --- | --- |
| 프런트엔드 번들 | `dist/` |
| 실행 파일 | `src-tauri/target/release/hana-forever.exe` |
| NSIS 설치 파일 | `src-tauri/target/release/bundle/nsis/Hana Forever_0.1.0_x64-setup.exe` |

## CI

`.github/workflows/build.yml`이 push마다 두 가지를 검증합니다.

- `frontend` — Ubuntu에서 `npm run build` (타입 검사 + 번들)
- `windows` — `windows-latest`에서 `npm run tauri build`로 실제 설치 파일 생성

`windows` 작업이 성공하면 Actions 실행 페이지 하단 **Artifacts**의
`hana-forever-windows`에서 `.exe`를 내려받아 바로 실행해 볼 수 있습니다.
로컬에 Rust를 설치하지 않아도 빌드 결과를 확인할 수 있습니다.

## 자주 나오는 오류

**`link.exe not found`** — Visual Studio Build Tools의 C++ 워크로드가 없습니다. 위 3번을 설치하세요.

**`error: Microsoft Visual C++ 14.0 or greater is required`** — 같은 원인입니다.

**창이 투명하지 않거나 뜨지 않음** — WebView2 런타임 누락입니다. 위 4번을 확인하세요.

**하나가 보이지 않음** — 행동 팩 로딩에 실패하면 오류 문구가 표시됩니다. `npm run build` 후 `dist/motion-v2/hana-atlas.png`와 `dist/stand-up/front-v1.png`가 있는지 확인하세요. 아직 아트가 없는 기존 기획 동작은 이번 패널에서 제공하지 않습니다.

## 테스트 배포 (다른 PC에서 써보기)

### 배포본 만들기

태그를 밀면 `release` 워크플로가 `windows-latest`에서 설치 파일을 만들어
**Releases 페이지에 초안(draft)으로** 올립니다.

```powershell
git tag v0.1.0-test1
git push origin v0.1.0-test1
```

GitHub의 Releases 화면에서 초안을 확인하고 **Publish**를 누르면 공개 다운로드 링크가 생깁니다.
공개 저장소이므로 그 링크는 GitHub 로그인 없이도 받을 수 있습니다.

로컬에서 직접 만들려면 `npm run tauri build` 후
`src-tauri/target/release/bundle/nsis/` 안의 `*-setup.exe`를 전달하면 됩니다.

### 받는 쪽에서 필요한 것

- Windows 10 이상, 64비트
- 관리자 권한 **불필요** — 현재 사용자에게만 설치됩니다 (`installMode: currentUser`)
- WebView2 런타임 — 없으면 설치 중 자동으로 함께 설치됩니다
  (`webviewInstallMode: downloadBootstrapper`, 이때만 인터넷 연결 필요)

### 조작 방법

창에 테두리도 닫기 버튼도 없고 작업 표시줄에도 뜨지 않으므로, 조작은 아래 두 경로뿐입니다.

| 하고 싶은 것 | 방법 |
| --- | --- |
| 옮기기 | 하나를 직접 드래그하고 놓기 |
| 행동 패널 열기/닫기 | **F2**, 또는 트레이 아이콘 우클릭 |
| 작업 표시줄 위로 데려오기 | 트레이 아이콘 우클릭 |
| **종료** | 트레이 아이콘 우클릭 → `하나 보내주기`, 또는 패널의 `종료` 버튼 |

행동 패널과 디버그 라벨은 배포 빌드에서 기본으로 숨겨집니다 (네이티브 개발 실행에서도 닫힌 채 시작; `npm run dev` 브라우저 미리보기는 패널 표시).
