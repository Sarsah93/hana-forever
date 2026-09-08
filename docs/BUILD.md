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

**빌드는 되는데 하나가 안 보이고 🐩 이모지만 보임** — 정상입니다.
`src/assets/manifest.ts`에 등록된 스프라이트가 없는 동작은 자리표시자로 표시됩니다.
`assets/sprites/README.md`의 규격에 맞춰 스프라이트를 만들고 매니페스트에 등록하면 대체됩니다.
