"""모델 인터페이스. YOLO-seg(얼굴·상체 분할)와 MediaPipe Face Landmarker 를 이 모양으로 감싸서 꽂는다.

TODO(공부): 먼저 PC 에서 MediaPipe 로 같은 인터페이스를 만들어 '기준 출력'으로 쓰고,
            이후 RKNN(보드) 모델 출력과 비교한다 (PRD 5.3 개발 단계 M1 -> M2).
"""
from typing import Protocol

import numpy as np


class Segmenter(Protocol):
    def infer(self, frame_small: np.ndarray) -> dict:
        """축소 프레임 -> {"face": 박스·마스크, "upper_body": 박스·마스크}. 검출 안 된 클래스는 키가 없다. 3~5fps 로 호출."""


class FaceLandmarker(Protocol):
    def infer(self, model_input: np.ndarray) -> np.ndarray:
        """(1,3,H,W) 입력 -> (N,3) [x, y, score]. 점 번호는 config.py 의 매핑 표로 KP_NAMES 에 맞춘다 (표는 아직 없음, 입술 내측 점 포함 여부 확인 필요)."""
