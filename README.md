# Grader (그레이더)

> **승화전사 유니폼 제작을 위한 자동 패턴 그레이딩 프로그램**
>
> 디자이너가 기준 사이즈 디자인 파일 하나만 작업하면, 5XS부터 5XL까지 13단계 사이즈의 인쇄용 PDF 파일을 자동으로 생성하는 데스크톱 프로그램입니다.

[![Status](https://img.shields.io/badge/status-MVP%20완성-success)]()
[![Platform](https://img.shields.io/badge/platform-Windows-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

**GitHub**: https://github.com/cobby8/grader

---

## 주요 특징

- 🎨 **CMYK 색상 완벽 보존** — 승화전사 인쇄에 필수적인 CMYK 색상 공간을 스케일링 과정에서 손실 없이 유지합니다.
- 📏 **5XS ~ 5XL 13단계 사이즈** — 한 번의 디자인으로 전 사이즈의 인쇄 파일을 자동 생성합니다.
- 👕 **의류 패턴 프리셋 시스템** — 자주 쓰는 패턴(옷본)을 등록해두고 재사용할 수 있습니다.
- 🖥️ **데스크톱 앱** — 인터넷 연결 없이 로컬에서 동작하는 가벼운 Tauri 기반 프로그램입니다.

---

## 스크린샷

![메인 화면](docs/screenshot-main.png)

> 실제 스크린샷은 추후 추가 예정입니다.

---

## 핵심 기능

| 기능 | 설명 |
|------|------|
| 📂 **패턴 프리셋 등록** | SVG 옷본 조각과 사이즈별 치수를 저장해 재사용 |
| 🎨 **PDF 디자인 업로드** | 기준 사이즈 PDF를 업로드하면 자동으로 CMYK 검증 및 미리보기 생성 |
| 📏 **사이즈 선택** | 5XS부터 5XL까지 원하는 사이즈를 체크박스로 간편 선택 |
| 📄 **자동 그레이딩** | 선택한 모든 사이즈의 인쇄용 PDF를 한 번에 생성 |
| 🔬 **CMYK 상세 분석** | 벡터/이미지별 색상 공간 검증 + 파일 크기 리포트 제공 |

---

## 워크플로우

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ ①SVG 패턴  │ → │ ②PDF 디자인│ → │ ③사이즈    │ → │ ④그레이딩  │ → │ ⑤CMYK 보존 │
│   등록      │   │   업로드    │   │   선택      │   │   생성      │   │   PDF 출력  │
└─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘
```

---

## 기술 스택

| 구분 | 사용 기술 |
|------|----------|
| **데스크톱 앱** | Tauri 2.x (가벼운 데스크톱 앱 프레임워크) |
| **프론트엔드** | React 19 + TypeScript + react-router-dom 7 |
| **백엔드** | Rust (Tauri 커맨드 — 파일 입출력 담당) |
| **그래픽 엔진** | Python 3.13 + PyMuPDF + reportlab (PDF 처리 전문 라이브러리) |

> **비유로 이해하기**: Tauri는 프로그램의 껍데기(창문), React는 사용자가 보는 화면, Rust는 파일을 열고 닫는 손, Python은 실제 PDF를 자르고 붙이는 장인의 작업대입니다.

---

## 설치 및 실행

### 필수 요구사항

프로그램을 실행하려면 먼저 아래 4가지를 설치해야 합니다.

| 항목 | 다운로드 링크 | 용도 |
|------|--------------|------|
| **Windows 10/11** | — | 운영체제 |
| **Node.js 18+** | https://nodejs.org | 프론트엔드 실행 |
| **Rust** | https://rustup.rs | 백엔드 빌드 |
| **Python 3.10+** | https://python.org | PDF 그래픽 처리 |
| **Visual Studio Build Tools** | Rust 설치 시 자동 안내 | C++ 컴파일러 |

### 설치 단계

```bash
# 1. 저장소 복제
git clone https://github.com/cobby8/grader.git
cd grader

# 2. Node.js 의존성 설치
npm install

# 3. Python 가상환경 생성 및 패키지 설치
cd python-engine
python -m venv venv
venv/Scripts/pip install -r requirements.txt
cd ..

# 4. 개발 모드 실행
./dev.bat
```

### 프로덕션 빌드

배포용 설치 파일(.exe)을 만들려면:

```bash
npm run tauri build
```

빌드가 완료되면 `src-tauri/target/release/bundle/` 폴더에 설치 파일이 생성됩니다.

---

## 사용 방법

프로그램은 총 **4개의 화면(페이지)** 으로 구성되어 있으며, 순서대로 진행하면 됩니다.

### 1단계 — 패턴 관리 (옷본 등록)

> 자주 쓰는 옷 패턴을 미리 저장해두는 단계입니다.

1. **[새 프리셋]** 버튼 클릭
2. 프리셋 이름 입력 (예: "라운드넥 티셔츠")
3. SVG 조각 파일 추가 (앞판, 뒷판, 소매 등)
4. 사이즈별 치수 입력 (5XS ~ 5XL의 가로/세로)
5. **[저장]** 클릭

### 2단계 — 디자인 등록

> 인쇄할 디자인 PDF를 업로드하는 단계입니다.

1. **[새 디자인 업로드]** 클릭
2. 기준 사이즈 PDF 파일 선택
3. 자동으로 **CMYK 색상 검증** 실행
4. 미리보기 확인 후 저장

### 3단계 — 사이즈 선택

> 어떤 사이즈의 파일을 만들지 선택하는 단계입니다.

1. 사용할 **패턴 프리셋** 선택
2. 인쇄할 **디자인** 선택
3. **기준 사이즈** 선택 (보통 M 또는 L)
4. **생성할 사이즈** 체크박스로 선택 (예: S, M, L, XL)

### 4단계 — 파일 생성

> 실제 인쇄용 PDF 파일을 만드는 단계입니다.

1. **[파일 생성 시작]** 버튼 클릭
2. 진행 상황 실시간 확인
3. 완료되면 **[결과 폴더 열기]** 버튼으로 결과 확인

### 출력 결과 위치

```
AppData/outputs/{날짜시간}/{디자인명}_{사이즈}.pdf
```

예시: `AppData/outputs/20260408_143022/로고티셔츠_XL.pdf`

---

## 프로젝트 구조

```
grader/
├── src/                       # React 프론트엔드 (사용자가 보는 화면)
│   ├── components/            # 공통 컴포넌트 (버튼, 모달 등)
│   ├── pages/                 # 4개 페이지
│   │   ├── PatternManage.tsx  # ①패턴 관리
│   │   ├── DesignUpload.tsx   # ②디자인 등록
│   │   ├── SizeSelect.tsx     # ③사이즈 선택
│   │   └── FileGenerate.tsx   # ④파일 생성
│   ├── types/                 # TypeScript 타입 정의
│   └── stores/                # 상태 관리
│
├── src-tauri/                 # Rust 백엔드 (파일 입출력 담당)
│
├── python-engine/             # Python 그래픽 엔진 (PDF 처리)
│   ├── pdf_handler.py         # PDF 정보 추출 + CMYK 검증
│   ├── pattern_scaler.py      # 사이즈별 스케일 비율 계산
│   ├── pdf_grader.py          # 그레이딩된 PDF 생성
│   ├── main.py                # CLI 엔트리포인트
│   └── requirements.txt       # Python 패키지 목록
│
├── dev.bat                    # 개발 모드 실행 스크립트
├── build.bat                  # 빌드 실행 스크립트
└── REPORT.md                  # 기술 타당성 상세 보고서
```

---

## Python CLI 커맨드 (개발자용)

Python 엔진을 직접 호출해야 할 때 사용하는 명령어입니다.

```bash
# PDF 파일 정보 조회 (페이지 수, 크기 등)
python main.py get_pdf_info <pdf_path>

# CMYK 색상 공간 검증
python main.py verify_cmyk <pdf_path>

# 색상 상세 분석 (벡터/이미지별)
python main.py analyze_color <pdf_path>

# 미리보기 이미지 생성
python main.py generate_preview <pdf_path> <out_png> [dpi]

# 사이즈별 스케일 비율 계산
python main.py calc_scale <preset_json> <base_size> <target_size>

# 그레이딩된 PDF 생성 (최종 출력)
python main.py generate_graded <pdf_path> <out_pdf> <scale_x> <scale_y>
```

---

## 현재 상태 및 로드맵

### ✅ MVP 완성 기능

- 패턴 등록부터 파일 생성까지 **전체 워크플로우 동작**
- CMYK 색상 보존 검증 완료
- E2E 통합 테스트 통과

### 🔄 향후 계획

- 📊 **엑셀 주문서 자동 인식** — 주문서만 넣으면 사이즈/수량 자동 파악
- 🔐 **Supabase 계정/권한 관리** — 여러 사용자 협업 지원
- 🎨 **Adobe Illustrator 직접 연동** — 일러스트레이터에서 바로 그레이딩 (선택적 확장)
- 📁 **EPS 출력 지원** — PDF 외 EPS 포맷도 추가
- ⚡ **배치 처리** — 여러 디자인을 한 번에 처리

---

## 기여

버그 리포트, 기능 제안, Pull Request 모두 환영합니다.

1. 이 저장소를 Fork
2. 새 브랜치 생성 (`git checkout -b feature/my-feature`)
3. 변경사항 커밋 (`git commit -m 'feat: 내 기능 추가'`)
4. 브랜치 Push (`git push origin feature/my-feature`)
5. Pull Request 생성

---

## 라이선스

MIT License

---

## 관련 문서

- 📋 **[REPORT.md](./REPORT.md)** — 기술 타당성 상세 보고서 (10장 분량)
- 📂 **.claude/knowledge/architecture.md** — 프로젝트 아키텍처 설명
