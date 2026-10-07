# 나만의 피지컬 AI 제품 만들기

이 폴더는 과제 제출용 작업 폴더입니다. 나만의 피지컬 AI 제품을 기획하고, 그 제품을 소개하는 홈페이지를 만들어 GitHub Pages로 배포합니다.

## 폴더 구성

```
physicalAI/
├── README.md          ← 지금 보고 있는 안내 문서
├── index.html         ← 제품 소개 홈페이지 (GitHub Pages 시작 파일)
├── images/            ← 홈페이지에 쓸 이미지 (제품 사진, 스케치 등)
├── stitch/            ← 홈페이지가 참조하는 자산과 Stitch 디자인 자료
│   ├── *.svg          ← 로고, LCD 화면 그래픽 (index.html에서 상대경로로 참조)
│   ├── design-system.md
│   ├── project.json
│   └── screenshot.png
├── PRD/
└── report/
```

## GitHub Pages 배포

`main` 브랜치의 루트(`/`)가 배포 대상이므로, `index.html`은 루트에 두고 이미지는 `./stitch/` 등 상대경로로 참조합니다.
푸시 후 저장소의 Settings → Pages에서 Source가 `main` / `(root)`로 설정되어 있는지 확인합니다. 반영에는 1~2분 정도 걸립니다.
