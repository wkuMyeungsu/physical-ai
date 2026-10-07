"""개인 베이스라인 (preprocess.md 5장, 파이프라인 K7).

핵심: 정면 영상으로는 절대 각도를 못 재므로 '내 바른 자세 대비 변화량'으로 판정한다.
베이스라인은 추론 때와 똑같은 S0~K6 을 통과한 특징으로 만들어야 한다.
기준 자세는 사용 중 자동 갱신하지 않는다 (나쁜 자세를 정상으로 학습하는 것을 방지).
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from .config import CalibrationConfig


class CalibrationError(RuntimeError):
    """재촬영이 필요한 경우. reasons 에 사용자에게 안내할 사유."""

    def __init__(self, reasons: List[str]):
        self.reasons = reasons
        super().__init__("; ".join(reasons))


@dataclass
class Baseline:
    stats: Dict[str, Tuple[float, float]]    # 특징 -> (median, sigma)
    mar_closed: float
    mar_on: float                            # 입벌림 발동 임계값
    mar_off: float                           # 해제 임계값 (히스테리시스: off < on)
    ref: Dict[str, float] = field(default_factory=dict)   # 어깨폭, 눈 간격, 어깨 위치, 블러, 밝기 등
    warnings: List[str] = field(default_factory=list)


class Calibrator:
    """카운트다운(3s) -> 촬영(10s) -> (선택) 입 벌림 촬영(4s) 동안 특징을 모아 Baseline 을 만든다.

    TODO(공부): median / MAD 로 대표값과 산포를 구하는 이유 (깜빡임, 미세 움직임에 강함).
    TODO: 촬영 시작 직후 1초는 버린다 (AE 수렴, 자세 정착).
    TODO: 재촬영 조건(CalibrationError)
        - 유효 표본 부족 / 촬영 중 움직임 큼(face_ratio 상대 산포 > 10%)
        - 어깨선 기울어짐 / 얼굴이 정면이 아님(yaw, roll)
        -> 정면 영상으로 '바른 자세'를 직접 판정할 수는 없으므로 이런 간접 검사만 가능 (한계)
    TODO: 입 임계값 = 다문 상태 MAR 과 벌린 상태 MAR 의 중간값 (벌림 샘플이 없으면 기본 간격 가정)
    """

    def __init__(self, cfg: CalibrationConfig):
        self.cfg = cfg

    def start(self, phase: str, t: float) -> None:
        """phase: 'neutral' | 'open'"""
        raise NotImplementedError

    def state(self, phase: str, t: float) -> str:
        """'idle' | 'countdown' | 'capture' | 'done' (UI 카운트다운 표시용)"""
        raise NotImplementedError

    def add(self, phase: str, t: float, sample: dict) -> None:
        raise NotImplementedError

    def finish(self) -> Baseline:
        raise NotImplementedError


def turtle_score(base: Baseline, feats: Dict[str, float], weights: Dict[str, float]) -> float:
    """각 특징의 robust z-score 에 거북목 방향 부호를 곱해 가중 평균. 클수록 거북목.

    TODO: z = (값 - median) / sigma. 값이 너무 튀지 않게 +-6 정도로 clip.
    TODO: 가중치는 처음엔 동일. 측면 CVA 정답이 생기면 상관 높은 특징에 가중치를 주거나 회귀로 학습.
    """
    raise NotImplementedError


class RecalibMonitor:
    """어깨폭/위치가 베이스라인에서 오래 벗어나 있으면 카메라가 움직인 것으로 보고 재촬영을 '제안'.

    TODO: 기준(어깨폭 +-25%, 위치 이동 어깨폭의 0.6배, 60초)은 시작값. 사용자 테스트로 조정.
    """

    def __init__(self, cfg: CalibrationConfig, base: Baseline):
        pass

    def update(self, t: float, shoulder_w: float, sh_mid) -> bool:
        raise NotImplementedError


class MouthAdapter:
    """시제품 적응(PRD 5.3): 사용 중 '입 다문 상태' MAR 분포를 따라 입 임계값을 허용 범위 안에서 이동.

    TODO: 다문 상태 표본만 EMA 로 갱신, 발화/알림 중/보류 구간은 제외.
    TODO: 임계값 이동 한도(예: 다문~벌림 간격의 30%)를 둔다. 거북목 기준 자세는 절대 건드리지 않는다.
    """

    def __init__(self, cfg: CalibrationConfig, base: Baseline):
        pass

    def update(self, t: float, mar: float, skip: bool) -> None:
        raise NotImplementedError
