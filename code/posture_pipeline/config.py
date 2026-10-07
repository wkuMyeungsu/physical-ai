"""설정값 모음.

값은 전부 report/preprocess.md 의 '시작값(경험칙)'이다. 근거가 있는 값이 아니므로
PoC 에서 같은 녹화 데이터로 비교하며 바꿔 나갈 것.
"""
from dataclasses import dataclass, field

# --- 키포인트 레이아웃 -------------------------------------------------------
# l/r 은 영상 기준 좌/우. lip_t{i} 와 lip_b{i} 는 입술 안쪽 위/아래 한 쌍 (MAR 계산용).
KP_NAMES = [
    "face_l", "face_r", "l_eye", "r_eye", "nose", "chin",
    "mouth_l", "mouth_r",
    "lip_t0", "lip_t1", "lip_t2", "lip_b0", "lip_b1", "lip_b2",
    "l_shoulder", "r_shoulder",
]
KP = {name: i for i, name in enumerate(KP_NAMES)}

# TODO(공부): 실제로 고른 랜드마크 모델(PFLD 등)의 출력 점 번호를 위 이름에 매핑하는 표를 만들기.
#   입술 '안쪽' 점이 나오는 모델인지가 핵심 (preprocess.md 6장).


@dataclass
class ImageConfig:           # preprocess.md 1장
    gate_width: int = 320
    luma_min: float = 40.0
    luma_max: float = 220.0
    blur_ratio_min: float = 0.30
    roi_scale: float = 1.4
    input_size: int = 192
    # 아래 보정은 시제품 기본 OFF. 효과가 입증되면 켠다 (PRD 5.1-7)
    use_roll_align: bool = False
    use_gamma: bool = False
    use_clahe: bool = False


@dataclass
class KeypointConfig:        # preprocess.md 2장
    score_thr: float = 0.5
    hampel_win: int = 7
    hampel_k: float = 3.0
    vel_frac: float = 0.2
    structure_tol: float = 0.25
    fill_hold_s: float = 0.2     # 이하: 마지막 값 유지
    suspend_s: float = 2.0       # 이하: 판정 보류 / 초과: 리셋
    turtle_min_cutoff: float = 0.5
    turtle_beta: float = 0.005
    mouth_min_cutoff: float = 1.5
    mouth_beta: float = 0.03


@dataclass
class CalibrationConfig:     # preprocess.md 5장, PRD 2장
    countdown_s: float = 3.0
    capture_s: float = 10.0
    min_samples: int = 60


@dataclass
class DecisionConfig:        # preprocess.md 4장 D1, PRD 2장
    turtle_on_s: float = 30.0
    mouth_on_s: float = 8.0
    max_yaw_deg: float = 30.0
    cooldown_s: float = 60.0
    daily_cap: int = 20


@dataclass
class PipelineConfig:
    image: ImageConfig = field(default_factory=ImageConfig)
    kp: KeypointConfig = field(default_factory=KeypointConfig)
    calib: CalibrationConfig = field(default_factory=CalibrationConfig)
    decision: DecisionConfig = field(default_factory=DecisionConfig)
    pose_fps: float = 4.0        # 포즈 3~5fps
    face_fps: float = 12.0       # 얼굴 랜드마크 10~15fps
