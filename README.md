# Hana Forever 🐩

갈색 토이푸들 **하나**가 Windows 작업 표시줄 위에서 걷고, 창에 기대고, 점프 후 다시 착지하는 데스크톱 동반자입니다.

## 실행

```powershell
npm install
npm run tauri dev
```

`npm run dev`는 브라우저 안의 장애물 미리보기입니다. Windows 데스크톱 창과 작업 표시줄에 실제로 반응하려면 `npm run tauri dev`를 사용하세요.

```powershell
npm test
npm run build
npm run tauri build
```

빌드 준비와 설치 파일 위치는 [docs/BUILD.md](docs/BUILD.md)에 있습니다.

## 현재 동작

- 테두리·그림자 없는 투명 창, 트레이 메뉴, 클릭 통과 및 복구
- 작업 표시줄 윗면을 바닥으로 인식하고 좌우 보행
- 실제 일반 창의 측면 충돌, 윗면 착지, 아랫면 점프 충돌
- 뒷발을 바닥에 둔 채 창 옆에 두 앞발을 기대기
- 중력에 따른 1회 점프·낙하·착지, 드래그 후 떨어지기
- 대기/걷기/기대기/점프·착지 16키포즈 아틀라스, 프레임별 발 앵커

F2 또는 하나 우클릭으로 패널을 열고, 방향키로 걷기, Space/더블클릭으로 점프합니다. 키보드는 하나 창에 포커스가 있을 때 동작합니다. 트레이에서 바닥 복귀·패널 열기·종료도 할 수 있습니다.

이번 아트는 **첫 동작 연결용 키포즈 팩**입니다. 빠른 이동은 걷기 프레임을 재사용하고, 나머지 원래 기획 동작은 후속 제작 대상입니다. 최대화 창처럼 몸이 들어갈 공간이 없을 때는 그 창을 배경으로 취급합니다.

세부 동작, 제약, 검증 항목은 [docs/DESKTOP_MOTION.md](docs/DESKTOP_MOTION.md), 구조는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), 아트 규약은 [assets/sprites/README.md](assets/sprites/README.md)를 참고하세요.
