"""실행 진입점 뼈대 (M1: PC 웹캠). 파이프라인이 구현되면 여기서 이어 붙인다.

    cd code
    python main.py
"""
from posture_pipeline import PipelineConfig, PosturePipeline


def main():
    cfg = PipelineConfig()
    pipe = PosturePipeline(cfg)  # TODO: detector / pose / landmarker 를 꽂기 (처음엔 MediaPipe 래퍼)

    # TODO: cv2.VideoCapture 로 카메라 열고 configure_camera() 로 720p@30 설정
    # TODO: 캘리브레이션 화면 (카운트다운 -> 촬영). pipe.calibration_state() 로 안내 문구 표시
    # TODO: 루프에서 pipe.process_frame(frame, time.monotonic()) 호출
    # TODO: 결과(decision)에 따라 화면에 상태 표시 (정상 / 거북목 / 입벌림). LCD 는 나중에.
    # TODO: 종료 시 카메라 release
    raise NotImplementedError


if __name__ == "__main__":
    main()
