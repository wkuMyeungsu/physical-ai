"""키포인트 단위 전처리 (preprocess.md 2장, 파이프라인 K1~K5).

순서가 중요: 신뢰도 게이팅 -> undistort -> 이상치 -> 결측 -> 스무딩 (4장 '순서가 바뀌면' 표 참고).
모든 함수는 (16, 2) 좌표 배열을 다루고, 결측은 NaN 으로 표현한다.
"""
from enum import Enum

import numpy as np

from .config import KeypointConfig


class Status(str, Enum):
    OK = "ok"
    HOLD = "hold"      # 판정 보류: 타이머 일시정지 (리셋 X)
    RESET = "reset"    # 구간 무효: 상태 리셋


def gate_by_score(xy: np.ndarray, score: np.ndarray, thr: float) -> np.ndarray:
    """[K1] score < thr 인 점을 NaN 으로. (NaN 점수도 결측)  -- 한 줄짜리라 직접 구현해도 됨."""
    raise NotImplementedError


def undistort_points(xy: np.ndarray, K, dist) -> np.ndarray:
    """[K2] 좌표만 왜곡 보정. dist 가 None(무왜곡 렌즈 가정)이면 그대로 반환.

    TODO(공부): cv2.undistortPoints(P=K 로 픽셀 좌표 복원). 이미지 remap 은 하지 않는다.
    """
    raise NotImplementedError


class OutlierFilter:
    """[K3] 튄 값을 NaN 으로 바꿔 다음 단계(결측 처리)로 넘긴다.

    TODO(공부): 세 가지 규칙을 하나씩 구현
      1) 속도 임계값: 한 프레임 이동량 > 어깨폭 * 0.2 (30fps 기준 -> 실제 dt 로 환산할 것)
      2) Hampel 필터: 최근 7프레임 중앙값/MAD(*1.4826), 3-시그마 밖이면 이상치.
         MAD 가 0 이 되는 정지 상태를 위한 하한이 필요.
      3) 구조 일관성: 어깨폭/눈 간격이 베이스라인 대비 +-25% 벗어나면 해당 점 의심
    TODO: 연속으로 N프레임 거부되면 '실제 이동'으로 보고 수용하는 규칙(레벨 시프트).
          없으면 빠른 정상 움직임 뒤에 계속 거부되는 문제가 생김.
    """

    def __init__(self, cfg: KeypointConfig):
        self.cfg = cfg
        # TODO: 점별 버퍼(deque), 마지막 위치/시각, 거부 연속 횟수 상태 만들기

    def filter(self, xy: np.ndarray, t: float, baseline_ref=None) -> np.ndarray:
        raise NotImplementedError


class MissingHandler:
    """[K4] 결측 길이별 처리.

        <= 0.2s : 마지막 값 유지 (또는 등속 외삽)
        0.2~2s  : 판정 보류 (Status.HOLD)
        >= 2s   : 구간 무효 (Status.RESET)

    TODO: 점마다 '마지막으로 유효했던 시각'을 기억하고 gap 을 계산.
    TODO: 양방향 보간은 쓰지 않는다 (실시간이라 지연이 생김).
    """

    def __init__(self, cfg: KeypointConfig):
        self.cfg = cfg

    def fill(self, xy: np.ndarray, t: float):
        """(채워진 xy, 점별 gap(초)) 반환."""
        raise NotImplementedError

    def status(self, gaps: np.ndarray, required_idx: np.ndarray) -> Status:
        """필요한 점들 중 가장 긴 gap 으로 OK/HOLD/RESET 결정."""
        raise NotImplementedError


class OneEuro:
    """[K5] One Euro 필터. 정지 시 강하게, 움직일 때 약하게 -> 지연이 작음.

    TODO(공부): Casiez et al. 2012 'One Euro Filter' 논문/구현. min_cutoff, beta, d_cutoff 의 역할.
    TODO: 거북목용(어깨/윤곽, 느리게)과 입벌림용(입 점, 빠르게)을 점 그룹별로 다른 파라미터로.
    주의: beta 의 의미는 좌표 단위(px)에 의존 -> 해상도가 바뀌면 다시 맞춰야 함.
    """

    def __init__(self, min_cutoff, beta, d_cutoff: float = 1.0):
        pass

    def __call__(self, xy: np.ndarray, t: float) -> np.ndarray:
        raise NotImplementedError
