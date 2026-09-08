# Hana Forever 🐩

갈색 토이푸들 **하나**가 Windows 바탕화면 위에서 걷고, 쉬고, 사용자를 따라다니는 데스크톱 동반자입니다.

## 실행

```powershell
npm install
npm run tauri dev
```

개발 중에는 작은 행동 패널에서 기본 동작을 바로 시험할 수 있습니다. `hana-forever.exe`를 만들려면 다음을 실행합니다.

```powershell
npm run tauri build
```

## 현재 준비된 기반

- 장식 없는 투명·항상 위 Windows 창과 클릭 통과 토글
- 드래그로 위치 이동, 걷기/달리기/점프의 시간 독립적 움직임
- 요청한 제자리·좌우 기본 동작 13종의 의미 기반 상태 정의
- 원본 사진/영상과 배포용 투명 스프라이트를 분리하는 자산 규약

실제 마스코트 렌더링에는 `assets/sprites/README.md`의 규격에 맞춘 투명 스프라이트가 필요합니다. 프레임 작업이 완료되면 `src/assets/manifest.ts`에만 등록하면 됩니다.

더 자세한 확장 구조와 다음 단계는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 참고하세요.
