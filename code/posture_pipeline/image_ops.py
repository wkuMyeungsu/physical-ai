"""이미지 단위 전처리 (preprocess.md 1장, 파이프라인 S0~S5).

원칙: 픽셀 연산은 ROI 단위로만, 가능하면 하지 않는다. 켜는 것 = 품질 게이트, ROI 크롭, 입력 정규화.
"""
import numpy as np

from .config import ImageConfig


def configure_camera(cap, width=1280, height=720, fps=30) -> None:
    """[S0] 해상도/FPS 설정, 캘리브레이션 후 AE 잠금 또는 완만화.

    TODO(공부): cv2.VideoCapture 의 CAP_PROP_* 값, UVC 컨트롤(노출, 전원 주파수 60Hz)을
                카메라 제품이 지원하는지 확인 (v4l2-ctl --list-ctrls 등).
    """
    raise NotImplementedError


def quality_gate(frame: np.ndarray, cfg: ImageConfig, blur_ref=None):
    """[S2] 너무 어둡거나 밝거나 흐린 프레임이면 (False, 사유, 통계) 를 반환 -> 판정 보류.

    TODO(공부): 평균 휘도 계산, Laplacian 분산으로 블러 측정(cv2.Laplacian).
    TODO: 블러 기준은 '베이스라인 대비 비율'이라 캘리브레이션 때 blur 를 같이 저장해야 함.
    """
    raise NotImplementedError


def make_small(frame: np.ndarray, width: int):
    """[S3] 얼굴 위치 찾기용 축소 프레임과 배율 반환. (cv2.resize, INTER_AREA)"""
    raise NotImplementedError


def roi_from_keypoints(xy: np.ndarray, cfg: ImageConfig):
    """[S3] 이전 프레임 랜드마크로 얼굴 ROI (cx, cy, side) 를 추정 = '검출 대신 추적'.

    TODO: 얼굴 좌우 폭과 눈~턱 길이로 정사각 ROI 를 만들고 cfg.roi_scale 배 여유를 둔다.
    TODO: 점이 NaN 이면 None 을 반환해서 호출한 쪽이 검출기를 다시 돌리게 한다.
    """
    raise NotImplementedError


def crop_roi(frame: np.ndarray, center, side: float, out_size: int, roll_deg: float = 0.0):
    """[S4] 원본 해상도에서 ROI 를 잘라 out_size 로 리사이즈. (roi, M[원본->ROI]) 반환.

    TODO(공부): cv2.getRotationMatrix2D + cv2.warpAffine 으로 crop/회전/resize 를 한 번에.
    TODO: 반드시 '축소 프레임이 아니라 원본'에서 자를 것 (입술 간격이 뭉개지는 것을 방지).
    TODO: 탑다운 포즈용 상체 ROI(얼굴 폭의 몇 배)도 같은 함수를 재사용 가능한지 생각해 보기.
    """
    raise NotImplementedError


def roi_to_frame(pts_roi: np.ndarray, M: np.ndarray) -> np.ndarray:
    """[S6 이후] 모델이 낸 ROI 좌표를 원본 프레임 좌표로 되돌림. (cv2.invertAffineTransform)"""
    raise NotImplementedError


def enhance_roi(roi_bgr: np.ndarray, cfg: ImageConfig) -> np.ndarray:
    """[S5] 감마/CLAHE (기본 OFF). cfg 플래그가 모두 꺼져 있으면 입력을 그대로 반환.

    TODO(공부): YCrCb 의 Y 채널에만 적용, cv2.createCLAHE, 감마 LUT.
    주의: 켜려면 학습/양자화 calibration 데이터에도 같은 처리를 넣어야 입력 분포가 맞음.
    """
    raise NotImplementedError


def to_model_input(roi_bgr: np.ndarray, cfg: ImageConfig) -> np.ndarray:
    """[S5] (1,3,H,W) float32 로 변환. mean/std/채널 순서는 학습·양자화와 '완전히 동일'해야 함.

    TODO: 선택한 모델의 전처리 규격을 문서에서 확인해 그대로 옮기기.
    """
    raise NotImplementedError
