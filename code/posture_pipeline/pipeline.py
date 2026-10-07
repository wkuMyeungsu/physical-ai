"""전체 파이프라인 뼈대 (preprocess.md 4장: S0~D1).

두 가지 입구:
    process_frame()     카메라 프레임 -> S2~S6b -> process_keypoints()
    process_keypoints() 키포인트 -> K1~D1   (모델 없이 로직만 검증/평가할 때)

TODO: 우선 process_keypoints 쪽부터 구현해 보기 (모델 없이 가짜 키포인트로 테스트 가능).
"""
from typing import Optional

import numpy as np

from .config import PipelineConfig
from .models import FaceDetector, FaceLandmarker, PoseEstimator


class PosturePipeline:
    def __init__(self, cfg: Optional[PipelineConfig] = None,
                 detector: Optional[FaceDetector] = None,
                 pose: Optional[PoseEstimator] = None,
                 landmarker: Optional[FaceLandmarker] = None):
        self.cfg = cfg or PipelineConfig()
        self.detector, self.pose, self.landmarker = detector, pose, landmarker
        # TODO: OutlierFilter, MissingHandler, OneEuro, HeadPose, Calibrator, DecisionEngine 등을
        #       여기서 만들어 보관. 베이스라인은 캘리브레이션이 끝나기 전엔 None.

    # --- 캘리브레이션 (PRD 2장 2번) ------------------------------------------
    def start_calibration(self, phase: str, t: float) -> None:
        """TODO: 'neutral' -> (선택) 'open' 순서로 호출. 캘리브레이션 중에는 K7 대신 표본을 모은다."""
        raise NotImplementedError

    def finish_calibration(self):
        """TODO: Baseline 생성 -> DecisionEngine 초기화 -> (필요하면) AE 잠금 콜백. 실패 시 CalibrationError."""
        raise NotImplementedError

    # --- 이미지 경로 ------------------------------------------------------------
    def process_frame(self, frame: np.ndarray, t: float):
        """
        TODO: 아래 순서를 image_ops 의 함수들로 연결
          S2  품질 게이트 -> 불량이면 NaN 키포인트로 process_keypoints (보류로 이어짐)
          S3  축소 프레임에서 얼굴 위치 확보 (이전 랜드마크로 추적, 1~2초에 1회만 검출)
          S4  원본 해상도에서 얼굴 ROI 크롭 (롤 정렬은 옵션, 기본 OFF)
          S5  ROI 보정(기본 OFF) -> 모델 입력 정규화
          S6  얼굴 랜드마크 추론 (face_fps 주기) -> roi_to_frame 으로 원본 좌표 복원
          S6b 상체 ROI 크롭 -> 포즈 추론으로 어깨 얻기 (pose_fps 주기, 결과는 잠깐 캐시)
        TODO: 주기가 안 된 프레임에서는 이전 결과를 그대로 돌려줘도 되는지 생각해 보기.
        """
        raise NotImplementedError

    # --- 키포인트 경로 ------------------------------------------------------------
    def process_keypoints(self, raw: np.ndarray, t: float):
        """raw: (16,3) [x, y, score]. 미검출은 NaN.

        TODO: 아래 순서를 keypoints / features / calibration / decision 모듈로 연결
          K1  신뢰도 게이팅
          K2  undistort (무왜곡 렌즈면 생략)
          K3  이상치 제거
          K4  결측 처리 -> 거북목/입벌림 브랜치별 Status(OK/HOLD/RESET)
          K5  One Euro 스무딩
          K6  특징 계산 (HeadPose -> turtle_features, mouth_mar)
          (캘리브레이션 중이면 여기서 표본을 Calibrator 에 넣고 종료)
          K7  베이스라인 대비 편차 (turtle_score)
          K8+D1 발화 필터, 지속시간/히스테리시스 판정, 쿨다운
        TODO: 순서가 바뀌면 생기는 문제는 preprocess.md 4장 표 참고 (예: 스무딩 -> 이상치 순서는 금지).
        """
        raise NotImplementedError
