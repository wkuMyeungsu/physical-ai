"""특징 계산 (preprocess.md 2장 (f)(g), 파이프라인 K6).

거북목은 '얼굴이 커지는 것'이 신호, 입벌림은 '얼굴 크기를 제거'해야 하므로 정규화를 따로 한다.
"""
import numpy as np

# 베이스라인 대비 이 방향으로 변하면 거북목 쪽 (pitch 는 고개 숙임이 +)
TURTLE_SIGNS = {"face_ratio": +1.0, "chin_gap": -1.0, "pitch": +1.0, "face_w": +1.0}


class HeadPose:
    """머리 pitch/yaw/roll (deg).

    TODO(공부): cv2.solvePnP + 일반 얼굴 3D 모델 점(코끝, 턱, 눈 두 개, 입꼬리 두 개).
                회전행렬 -> 오일러각 변환, 이전 해를 초기값으로 써서 뒤집힘(ambiguity) 줄이기.
    주의: 일반 모델 기반이라 오차가 수 도 이상일 수 있음. 부호 규약(숙임 +)을 직접 확인해 볼 것.
    """

    def __init__(self, K):
        pass

    def __call__(self, xy: np.ndarray):
        """{'pitch','yaw','roll'} 또는 None."""
        raise NotImplementedError


def turtle_features(xy: np.ndarray, shoulder_w: float, pitch):
    """원점 = 어깨 중점, 스케일 = (강하게 스무딩한) 어깨폭.

    반환 예: {"face_ratio": 얼굴폭/어깨폭, "chin_gap": (어깨선 y - 턱 y)/어깨폭, "pitch": ..., "face_w": 얼굴폭(px)}

    TODO: 가설 검증이 필요한 부분 -> 상체 전체가 다가오는 경우와 목만 나오는 경우가 구분되는지
          (preprocess.md 2장 '거북목의 구분 문제').
    """
    raise NotImplementedError


def mouth_mar(xy: np.ndarray, pitch_rel_deg=None):
    """MAR = 입술 안쪽 상하 간격(3쌍 평균) / 입 너비.

    TODO(공부): 왜 입 너비로 정규화하는지 (얼굴 크기 변화 제거).
    TODO: pitch 보정(/cos)은 기본 OFF. 효과가 있는지는 ablation 으로 확인 (보정량이 작고 pitch 오차가 큼).
    TODO: yaw 가 커지면 입 너비가 줄어 MAR 이 커짐 -> yaw 보류 규칙과 함께 생각하기.
    """
    raise NotImplementedError


def shoulder_tilt_deg(xy: np.ndarray) -> float:
    """어깨선 기울기(deg). 캘리브레이션 품질 검사용. (atan2 한 줄)"""
    raise NotImplementedError
