# code/ — 전처리 파이프라인 뼈대

[report/preprocess.md](../report/preprocess.md)를 따라 만든 **빈 뼈대**입니다. 함수 본문은 `NotImplementedError`이고, 구현 힌트와 공부할 주제는 `TODO` 주석에 있습니다.

| 파일 | 설계안 | 하는 일 |
|---|---|---|
| `config.py` | 전체 | 시작값 모음 (경험칙, PoC로 조정) |
| `image_ops.py` | 1장 (S0~S5) | 카메라 설정, 품질 게이트, ROI 크롭, 입력 정규화 |
| `keypoints.py` | 2장 (K1~K5) | 이상치, 결측, 스무딩 |
| `features.py` | 2장 (K6) | 머리 자세, 거북목 특징, MAR |
| `calibration.py` | 5장 (K7) | 개인 베이스라인, 재캘리브레이션, 입 임계값 적응 |
| `decision.py` | 4장 (K8, D1) | 발화 필터, 지속시간 판정, 쿨다운 |
| `pipeline.py` | 4장 | 위 모듈을 연결 |
| `models.py` | 6장 | 얼굴 검출, 얼굴 랜드마크, 포즈 모델 인터페이스 |

## 추천 구현 순서 (모델 없이 시작)

1. `features.py`의 `shoulder_tilt_deg`, `mouth_mar` (단순 기하)
2. `keypoints.py`의 `gate_by_score` → `MissingHandler` → `OneEuro` → `OutlierFilter`
3. `decision.py`의 `HysteresisTimer` → `SpeechFilter`
4. `calibration.py`의 `Calibrator` → `turtle_score`
5. `pipeline.py`의 `process_keypoints` (가짜 키포인트로 테스트)
6. `image_ops.py`와 `process_frame`, 이후 모델 연결 (`models.py`)
