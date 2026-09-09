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

```powershell
npm install          # 1. 의존성 설치
npm test             # 2. 물리·행동 회귀 테스트 (tsc로 도메인만 컴파일)
npm run build        # 3. 타입 검사(tsc) + 두 페이지 번들(vite) -> dist/
npm run tauri dev    # 4. 개발 모드 실행 (디버그 빌드: 터미널/콘솔이 보이는 것이 정상)
npm run tauri build  # 5. 배포용 설치 파일 (릴리스 빌드: 콘솔 창 없음)
```

3단계까지는 Rust 없이도 통과합니다. **3단계에서 실패하면 TypeScript 문제, 4~5단계에서 실패하면 Rust/Tauri 환경 문제**입니다.

## 산출물 위치

| 항목 | 경로 |
| --- | --- |
| 프런트엔드 번들 | `dist/` (`index.html` 하나 창, `panel.html` 액션 패널, `motion-v2/`, `motion-v3/`, `stand-up/`, `idle-stand/`) |
| 실행 파일 | `src-tauri/target/release/hana-forever.exe` |
| NSIS 설치 파일 | `src-tauri/target/release/bundle/nsis/Hana Forever_0.1.0_x64-setup.exe` |

`dist/`에는 `_source/`, `_review/`, 스프라이트 README가 들어가지 않습니다(`vite.config.ts`의 정리 플러그인).

## 아이콘

`assets/icon/hana-icon.png`(투명 배경 네발 서기, 1024²)가 소스입니다. 바꾸려면:

```powershell
node tools/sprites/icon.cjs                                   # idle-stand/front-v1.png에서 소스 재생성
npx tauri icon assets/icon/hana-icon.png -o src-tauri/icons   # 전체 아이콘 세트 재생성
```

## CI

`.github/workflows/build.yml`이 push마다 두 가지를 검증합니다.

- `frontend` — Ubuntu에서 `npm test`, `npm run build`
- `windows` — `windows-latest`에서 `npm run tauri build`로 설치 파일과 무설치 실행 파일 생성

`windows` 작업이 성공하면 Actions 실행 페이지 하단 **Artifacts**에 두 개가 올라옵니다.

| Artifact | 내용 |
| --- | --- |
| `hana-forever-setup` | `Hana Forever_<버전>_x64-setup.exe` (NSIS 설치형) |
| `hana-forever-portable` | `Hana-Forever_<버전>_x64-portable.exe` (무설치, WebView2 필요) |

같은 브랜치에 새 push가 오면 진행 중인 이전 실행은 취소됩니다. 버전은 `src-tauri/tauri.conf.json`의 `version`을 따릅니다.

## 자주 나오는 오류

**`link.exe not found`** — Visual Studio Build Tools의 C++ 워크로드가 없습니다.

**`error: Microsoft Visual C++ 14.0 or greater is required`** — 같은 원인입니다.

**창이 투명하지 않거나 뜨지 않음** — WebView2 런타임 누락입니다.

**하나가 보이지 않음** — 아트 로딩에 실패하면 오류 문구가 표시됩니다. `npm run build` 후 `dist/motion-v2/hana-atlas.png`, `dist/motion-v3/hana-atlas-v3.png`, `dist/stand-up/front-v1.png`가 있는지 확인하세요. 집중 모드가 켜져 있고 빈 자리가 없으면 일부러 숨어 있는 상태입니다(트레이 메뉴에서 집중 모드 해제).

**검은 콘솔 창이 함께 뜸** — 개발 모드(`npm run tauri dev`)나 `target/debug/`의 디버그 실행 파일입니다. 릴리스 빌드(`npm run tauri build`)는 `windows_subsystem = "windows"`로 콘솔 없이 실행됩니다.

**패널이 열리지 않음** — 패널은 `tauri.conf.json`의 `panel` 창입니다. 개발 모드에서는 `http://localhost:1420/panel.html`이 열리는지, 배포 빌드에서는 `dist/panel.html`이 있는지 확인하세요. 웹뷰 쪽 오류는 개발 모드 터미널에 `[hana] error: …`로 찍힙니다.

## 테스트 배포 (다른 PC에서 써보기)

태그를 밀면 `release` 워크플로가 `windows-latest`에서 테스트를 돌린 뒤 설치 파일과 무설치 실행 파일을 만들어 **Releases 페이지에 초안(draft)으로** 올립니다.

```powershell
git tag v0.1.0-test1
git push origin v0.1.0-test1
```

GitHub의 Releases 화면에서 초안을 확인하고 **Publish**를 누르면 공개 다운로드 링크가 생깁니다. 초안에는 `*-setup.exe`(설치형)와 `*-portable.exe`(무설치) 두 파일이 붙습니다.

### 받는 쪽에서 필요한 것

- Windows 10 이상, 64비트
- 관리자 권한 **불필요** — 현재 사용자에게만 설치됩니다 (`installMode: currentUser`)
- WebView2 런타임 — 없으면 설치 중 자동으로 함께 설치됩니다

### 조작 방법

창에 테두리도 닫기 버튼도 없고 작업 표시줄에도 뜨지 않으므로, 조작은 아래 경로뿐입니다.

| 하고 싶은 것 | 방법 |
| --- | --- |
| 옮기기 | 하나를 직접 드래그하고 놓기 |
| 액션 패널 열기/닫기 | 하나 **우클릭**, **F2**, 또는 트레이 아이콘 우클릭 |
| 점심·퇴근 시간, 집중 모드 | 패널 설정 탭 또는 트레이 메뉴 |
| 작업 표시줄 위로 데려오기 | 트레이 아이콘 우클릭 |
| **종료** | 트레이 아이콘 우클릭 → `하나 보내주기`, 또는 패널 설정 탭의 `종료` |

패널은 처음에 닫혀 있습니다(`npm run dev` 브라우저 미리보기는 페이지 안에 표시).
