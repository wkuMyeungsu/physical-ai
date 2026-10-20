# 거북목 & 입벌림 AI 코치 — SBC · MCU 부품 선정 보고서

> **문서 메타데이터**
> - **프로젝트**: 거북목 & 입벌림 AI 코치 (Neck & Mouth AI Coach / Desk Posture Coach)
> - **범위**: SBC·MCU 선정 근거, 시제품 부품 목록(BOM), 전원·연결 요약
> - **버전**: v2.1.0
> - **작성일**: 2026-10-14 (v1.0.0) / 2026-10-16 (v1.1.0 ~ v1.3.0) / 2026-10-20 (v2.0.0, v2.1.0)
> - **v2.0.0 변경**: SBC·MCU 선정 과정을 다시 정리하고, 문서를 선정 근거 중심으로 줄임. 부품 구성은 v1.3.0과 같음
> - **v2.1.0 변경**: 객관적인 선정 자료로 정리 (외부 맥락 설명 제거)
> - **상태**: 시제품 기준. 단가와 전력은 추정치이며 보드를 받으면 실측으로 갱신

---

## 0. 결론

| 구분 | 선정 | 한 줄 이유 |
| :--- | :--- | :--- |
| **SBC** | **Radxa ZERO 3W (RK3566, 2GB / eMMC 16GB)** | 손가락만 한 크기에 NPU가 있고, PC의 USB-C 하나로 전원과 데이터를 받음 |
| **MCU** | **쓰지 않음** | 모터·배터리·여러 센서가 없어서 MCU가 맡을 일이 없음 |

---

## 1. 제품 조건

| 조건 | 내용 | 부품 선택에 주는 영향 |
| :--- | :--- | :--- |
| 설치 | 모니터 위 가운데에 클립으로 얹음 | **작고 가벼워야** 함 |
| 전원 | USB-C 케이블 하나 (PC 포트 또는 충전기), 배터리 없음 | 소비전력이 **PC USB-C 포트(5V 1.5A) 안**이어야 함 |
| AI | 카메라 1대, 상체 분할(3~5fps) + 얼굴·입술 랜드마크(10~15fps), 전부 기기 안에서 | **NPU**가 있으면 좋음. 큰 GPU는 불필요 |
| 소프트웨어 | 리눅스 + Docker 컨테이너 3개 ([container_architecture.md](container_architecture.md)) | RAM 1GB 이상 |
| 출력·입력 | 2인치 LCD, 버튼 1개 | SPI·GPIO만 있으면 됨 |
| 실시간 제어 | 없음 (모터·비상정지 없음) | MCU가 필요 없음 |

---

## 2. SBC 선정

### 2.1 후보 비교

| 후보 | 크기 | 전원 | AI | 판단 |
| :--- | :--- | :--- | :--- | :--- |
| Raspberry Pi 5 | 85×56mm | 5V/5A 권장 | NPU 없음 (CPU 추론) | ✕ PC USB-C 포트 하나로 전원 공급이 어렵고, 모니터 위에 얹기엔 큼 |
| Pi 5 + AI HAT+ (Hailo) | Pi 5 + HAT | Pi 5보다 큼 | 13~26 TOPS | ✕ 성능은 남고 크기·전력이 더 커짐 |
| Jetson Orin Nano | 큼 | 7~25W | 67 TOPS | ✕ 카메라 1대 제품에는 과함. 가격·발열 부담 |
| RK3588 보드 (Orange Pi 5 등) | 신용카드 크기 | 수 W~10W 이상 | 6 TOPS | ✕ 성능은 남고 크기·전력이 맞지 않음 |
| Pi Zero 2 W | 65×30mm | 1W 안팎 | NPU 없음, RAM 512MB | ✕ 크기는 맞지만 AI·컨테이너 여러 개가 어려움 |
| **Radxa ZERO 3W** | **65×30mm** (Zero 2 W와 같은 크기) | **공식 최대 3.3W** | **NPU 0.8 TOPS (INT8)**, RAM 2GB 이상 | **✓ 선정** |

- 크기·전력은 Pi Zero 2 W가 맞지만 RAM 512MB에 NPU가 없어 AI 추론과 컨테이너 여러 개가 어렵습니다. **같은 크기에 NPU가 있는 보드**가 Radxa ZERO 3W입니다.

### 2.2 Radxa ZERO 3W를 고른 이유

- **크기**: Zero 2 W와 같은 65×30mm라 모니터 위 클립 케이스에 들어갑니다.
- **전원**: USB-C OTG 포트 하나로 전원과 데이터(USB 가상 네트워크)를 함께 받습니다. 공식 최대 소비전력이 3.3W(USB 주변기기 제외)라 PC USB-C 포트로 충분합니다.
- **AI**: RK3566 NPU에서 `yolov8n-seg`(640×640, INT8)가 RKNN Model Zoo 기준 약 28.9 FPS입니다. 모델 계산만 잰 값이라 실제로는 훨씬 느리지만, 목표가 3~5fps라 범위 안입니다.
- **Docker**: RAM 2GB면 컨테이너 3개(합계 약 1GB)와 OS를 함께 올릴 수 있습니다.
- **연결**: CSI 카메라 커넥터, 40핀 GPIO(SPI LCD·버튼), Wi-Fi 6 내장(Wi-Fi 모드용)이 모두 보드에 있습니다.
- **저장**: eMMC 모델을 골라 MicroSD 없이 OS·모델·기록을 보관합니다 (8시간 연속 기록의 신뢰성).

### 2.3 알아 둘 약점

| 약점 | 내용 | 대책 |
| :--- | :--- | :--- |
| 실제 속도 | Zero 3에서 YOLO11n을 RKNNLite로 돌렸을 때 **프레임당 700~800ms(2~3fps)** 였다는 사용자 보고가 있음. 벤치마크는 모델 계산만 잰 값이고, CPU에서 하는 전처리·마스크 후처리가 병목 | 마스크는 얼굴·상체 1개씩만 낮은 해상도로, 분할은 3~5fps·랜드마크는 10~15fps로 주기를 나눔. 모자라면 입력을 640 → 416/320으로 줄임 |
| 모델 준비 | RK3566용으로 변환된 얼굴 랜드마크 모델을 찾지 못함 | PC(x86)에서 ONNX → RKNN으로 직접 변환 (RKNN 변환은 x86에서만 됨) |
| 자료가 적음 | 라즈베리 파이보다 커뮤니티와 예제가 적음 | 보드를 받으면 NPU(`rsetup` Overlays에서 켬)·카메라·USB 가젯부터 먼저 확인 |

### 2.4 참고 대안 — Pi Zero 2 W + Raspberry Pi AI Camera (보류)

- AI Camera(Sony IMX500)는 **카메라 센서 안에서 추론**을 해서 Zero 2 W의 약점(NPU 없음)을 메울 수 있고, 라즈베리 파이라 자료가 많습니다. 약 $70.
- 보류한 이유: 센서 안의 메모리가 약 8MB(펌웨어·가중치·작업 메모리 공유), INT8, 입력 최대 640×640이라 **분할 모델과 얼굴 랜드마크 두 개를 함께 올리기 빡빡**합니다. Zero 2 W의 RAM 512MB도 컨테이너 3개에 부족합니다.
- ZERO 3W에서 속도가 끝내 안 나오면 다시 검토합니다.

---

## 3. MCU를 쓰지 않는 이유

MCU는 보통 즉시 반응이 필요한 제어, 센서 상시 수집, 저전력 동작을 맡습니다. 이 제품에서 MCU가 맡을 만한 일을 하나씩 확인했습니다.

| MCU가 맡는 대표적인 일 | 이 제품에서는 |
| :--- | :--- |
| 모터 정지 등 즉시 반응하는 안전 제어 | 모터·액추에이터가 없음 |
| 여러 센서 값 상시 수집 | 센서는 카메라 하나이고 CSI로 SBC에 직결 |
| 배터리로 오래 버티기 (저전력) | 배터리 없음, 항상 USB 전원 |
| 화면·버튼 | 2인치 LCD는 SBC의 SPI로 1프레임 약 31~38ms, 버튼 1개는 GPIO로 충분 |

- 카메라와 TinyML을 지원하는 **ESP32-S3**만으로 SBC 없이 만드는 구성도 검토했지만, 얼굴 검출 정도는 되어도 상체 분할과 입술 랜드마크를 함께 돌리기엔 연산·메모리가 부족해서 제외했습니다.
- MCU를 넣으면 펌웨어 1개, 보드 간 통신, 전원 경로만 늘어납니다. **SBC 단독 구성**으로 갑니다.
- 나중에 배터리형으로 바꾸거나 진동 모터 같은 액추에이터를 달면, 그때 ESP32-C3급 MCU를 추가합니다.

---

## 4. 시제품 부품 목록 (BOM)

PRD 목표 단가(대당 120,000원 이하) 기준입니다. **단가는 추정치**입니다.

| 부품 | 사양 | 수량 | 역할 | 예상 단가 (원) |
| :--- | :--- | :---: | :--- | ---: |
| **Radxa ZERO 3W** | RK3566, NPU 0.8 TOPS, LPDDR4 2GB, eMMC 16GB, Wi-Fi 6 | 1 | 컴퓨팅 (AI 추론, 판정, 웹 서버) | 55,000 |
| **IMX219 카메라 모듈 + 광각 렌즈** | 8MP, 720p@30fps 운용, 수평 화각 72~78° 저왜곡 렌즈, 22핀↔15핀 FPC | 1 | 50~80cm 거리에서 얼굴과 어깨선을 함께 촬영. 공식 모듈은 수평 62°라 좁아서 렌즈만 넓은 모듈 사용 | 25,000 |
| **2.0" IPS LCD** | 320×240, ST7789, SPI | 1 | 캐릭터 경고, 캘리브레이션 안내 | 10,000 |
| **택트 스위치** | 6×6mm | 1 | 스누즈(짧게) · 캘리브레이션(3초) · 설정 메뉴(10초) | 1,000 |
| **USB-C 케이블** | C to C, 5V/3A, USB 2.0 데이터 | 1 | 전원 + 데이터 | 6,000 |
| **히트싱크 + 써멀패드** | 알루미늄 20×14×6mm | 1 | 8시간 연속 추론 시 발열 관리 | 3,000 |
| **클립형 케이스 (3D 프린팅)** | PLA/PETG, 렌즈 슬라이더(프라이버시 커버) | 1 | 모니터 위 고정, 비사용 시 렌즈 가림 | 10,000 |
| **합계** | | | | **110,000** |

---

## 5. 전원 · 연결 요약

### 5.1 전원

| 항목 | 값 (추정) |
| :--- | :--- |
| 보드 + 카메라 + LCD 평균 | 약 3.5W (5V 약 0.7A) |
| 피크 (부팅, NPU+CPU 최대 부하) | 약 6.5W (5V 약 1.3A) |
| 전원 조건 | **USB-C 전용**: PC USB-C 포트(5V 1.5A 이상) 또는 USB-C 충전기(5V 2A 이상) |

- 구형 USB-A 포트(500mA)는 피크 때 전압이 떨어져 재부팅될 수 있어 지원하지 않습니다.
- 보드를 받으면 USB 전력계로 실측해 갱신합니다.

### 5.2 연결

| 구간 | 방식 |
| :--- | :--- |
| 카메라 → 보드 | MIPI CSI-2 (22핀 FPC) |
| 보드 → LCD | SPI 40MHz + GPIO(DC, RST) |
| 버튼 → 보드 | GPIO 입력 (내부 풀업, 누르면 Low) |
| 보드 ↔ PC | USB 모드: USB 가상 네트워크 (PC 직결) / Wi-Fi 모드: 보드 내장 Wi-Fi (충전기 연결) |

- Bluetooth는 쓰지 않으므로 항상 끕니다.

### 5.3 핀 연결 (40핀 헤더)

| 부품 핀 | 보드 핀 | 기능 |
| :--- | :---: | :--- |
| LCD VCC / GND | Pin 1 / Pin 6 | 3.3V / GND |
| LCD SCL / SDA / CS | Pin 23 / Pin 19 / Pin 24 | `SPI3_CLK_M1` / `SPI3_MOSI_M1` / `SPI3_CS0_M1` |
| LCD DC / RST | Pin 18 / Pin 22 | `GPIO3_B2` / `GPIO3_C1` |
| LCD BL | 3.3V 직결 | 백라이트 항상 켬 (시제품) |
| 버튼 | Pin 16 / Pin 14 | GPIO 입력 / GND |

- 디버그 시리얼(UART2: Pin 8, 10)은 비워 둡니다. Pin 16의 GPIO 이름과 내부 풀업 지원은 보드 핀맵에서 확인합니다.

---

## 6. 보드를 받으면 먼저 확인할 것

| 우선순위 | 항목 |
| :---: | :--- |
| 1 | NPU 켜기(`rsetup` → Overlays)와 카메라 인식. 시스템 업데이트 뒤 카메라가 안 잡혔다는 보고가 있어 업데이트 전후로 확인 |
| 1 | 캡처 + 추론 + 후처리 전체로 3~5fps가 나오는지 |
| 1 | USB 가젯(가상 네트워크) 동작. ZERO 3W에서 동작 사례를 아직 못 찾음. 안 되면 PC 직결 때도 Wi-Fi 모드로 동작 |
| 2 | 피크 전류 실측 (5.1 갱신) |
| 2 | 8시간 연속 가동 시 온도와 프레임 드랍 |

---

## 참고 자료

- [Radxa ZERO 3W 사양 (CNX Software)](https://www.cnx-software.com/2023/12/08/radxa-zero-3w-sbc-rockchip-rk3566-8gb-ram-wifi6-raspberry-pi-zero-2-w-form-factor/?amp=1)
- [보드 소비전력 (Radxa 공식 포럼)](https://forum.radxa.com/t/energy-consumption/12404)
- [Radxa ZERO 3 지원 카메라 (Radxa 공식 문서)](https://docs.radxa.com/en/zero/zero3/accessories/camera)
- [Radxa Camera 8M 219 사양 — 수평 62° (Radxa 공식 문서)](https://docs.radxa.com/en/accessories/camera_8m_219)
- [RKNN Model Zoo 벤치마크 (Rockchip 공식 GitHub)](https://github.com/airockchip/rknn_model_zoo)
- [Rockchip RKNN 내보내기 (Ultralytics 공식 문서)](https://docs.ultralytics.com/integrations/rockchip-rknn/)
- [Zero 3 실사용 속도 보고 (Radxa 공식 포럼)](https://forum.radxa.com/t/optimizing-object-detection-on-radxa-zero-3-rk3566-performance-issues/25700)
- [ZERO 3W NPU 켜기 (Radxa 공식 포럼)](https://forum.radxa.com/t/how-to-enable-npu-in-overlays-for-radxa-zero-3w/23533)
- [ZERO 3W USB 가젯(RNDIS) 질문 (Radxa 공식 포럼)](https://forum.radxa.com/t/zero-3w-rndis-and-g-ether-on-debian-desktop-os/19998)
- [Raspberry Pi AI Camera 사양 · 센서 메모리 (CNX Software)](https://www.cnx-software.com/2024/10/01/raspberry-pi-ai-camera-with-sony-imx500-ai-sensor-and-rp2040-mcu/)
