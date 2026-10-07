"""발화 필터 + 지속시간/히스테리시스 판정 + 알림 피로 방지 (preprocess.md 4장 K8, D1).

PRD 2장: 거북목 30초(30초~3분), 입벌림 8초 지속 시 발동 (시작값). 쿨다운/스누즈/일일 상한 적용.
"""
from typing import Optional

from .calibration import Baseline
from .config import DecisionConfig
from .keypoints import Status


class HysteresisTimer:
    """value >= on 이 on_s 초 누적되면 발동, value <= off 가 off_s 초 지속되면 해제.

    TODO(공부): 히스테리시스(해제 임계값 < 발동 임계값)가 깜빡임을 막는 원리.
    TODO: paused -> 타이머 일시정지(리셋 안 함), reset -> 전부 초기화, locked -> 새 발동 금지(쿨다운).
    TODO: 프레임이 오래 끊긴 구간(dt 가 큼)은 누적하지 않도록 dt 에 상한.
    반환: 'start' | 'stop' | None
    """

    def __init__(self, on_thr: float, off_thr: float, on_s: float, off_s: float):
        pass

    def update(self, t: float, value: float, paused=False, reset=False, locked=False) -> Optional[str]:
        raise NotImplementedError


class SpeechFilter:
    """[K8] 말하기 등 짧은 주기 입 개폐를 '입벌림'에서 제외.

    TODO: 최근 1.5초 창에서 MAR 이 임계값을 오르내린 횟수(>=3) 또는 표준편차가 크면 발화로 판단.
    TODO(생각): 하품/음식 섭취는 어떻게 구분할지 (PRD 3장 라벨 규칙과 연결, 아직 미정).
    """

    def __init__(self, window_s: float, min_crossings: int, std_ratio: float):
        pass

    def update(self, t: float, mar: float, mid_thr: float, mar_on: float) -> bool:
        raise NotImplementedError


class DecisionEngine:
    """거북목/입벌림 타이머 + 보류 규칙 + 알림 피로 방지를 묶는다.

    TODO: 보류(HOLD) 조건 = 점 결측 0.2~2s, yaw 가 +-30° 초과, 영상 품질 불량, 발화 중(입벌림 한정).
    TODO: 알림 해제 후 cooldown_s 동안 재알림 금지, 스누즈, 일일 상한(daily_cap).
    TODO: MouthAdapter 로 입 임계값을 갱신하고 타이머에 반영.
    """

    def __init__(self, cfg: DecisionConfig, base: Baseline):
        pass

    def snooze(self, t: float, seconds: float) -> None:
        raise NotImplementedError

    def update(self, t: float, turtle_score: float, mar: float,
               st_turtle: Status, st_mouth: Status, yaw: Optional[float]) -> dict:
        """예: {'turtle_event': 'start'|'stop'|None, 'mouth_event': ..., 'speaking': bool, ...}"""
        raise NotImplementedError
