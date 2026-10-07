"""모델 인터페이스. 나중에 RTMPose / PFLD 등을 이 모양으로 감싸서 꽂는다.

TODO(공부): 먼저 PC 에서 MediaPipe 로 같은 인터페이스를 만들어 '기준 출력'으로 쓰고,
            이후 RKNN(보드) 모델 출력과 비교한다 (PRD 5.3 개발 단계 M1 -> M2).
"""
from typing import Protocol

import numpy as np


class FaceDetector(Protocol):
    def detect(self, frame_small: np.ndarray):
        """축소 프레임에서 얼굴 bbox (x, y, w, h) 또는 None. 1~2초에 1회만 호출."""


class FaceLandmarker(Protocol):
    def infer(self, model_input: np.ndarray) -> np.ndarray:
        """(1,3,H,W) 입력 -> (14,3) [x, y, score]. KP_NAMES[:14] 순서."""


class PoseEstimator(Protocol):
    def infer(self, model_input: np.ndarray) -> np.ndarray:
        """상체 ROI 크롭(탑다운) 입력 -> (2,3) [l_shoulder, r_shoulder]."""
