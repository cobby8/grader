# Illustrator ExtendScript 그레이딩 스크립트

## 개요

Grader 앱에서 Adobe Illustrator를 호출하여 디자인 PDF를 그레이딩(사이즈별 스케일링)하는 스크립트입니다.

## 파일 구조

```
illustrator-scripts/
├── grading.jsx      ← 메인 그레이딩 스크립트
├── config.json      ← (앱이 자동 생성) 실행 설정
├── result.json      ← (스크립트가 생성) 실행 결과
└── README.md        ← 이 파일
```

## 실행 방법

### 방법 1: 앱에서 자동 실행 (정상 워크플로우)
Grader 앱이 config.json을 생성한 후 Illustrator를 커맨드라인으로 호출합니다.

### 방법 2: 수동 테스트
1. `config.json`을 수동으로 작성합니다 (아래 형식 참조)
2. Illustrator를 열고 File > Scripts > Other Script... 선택
3. `grading.jsx`를 선택하여 실행
4. `result.json`에서 결과를 확인합니다

## config.json 형식

```json
{
  "designPdfPath": "C:/path/to/design_XL.pdf",
  "patternSvgPath": "C:/path/to/pattern_XS.svg",
  "outputPdfPath": "C:/path/to/output_XS.pdf",
  "scaleX": 0.95,
  "scaleY": 0.92,
  "baseSize": "XL",
  "targetSize": "XS",
  "resultJsonPath": "C:/path/to/result.json"
}
```

| 필드 | 설명 |
|------|------|
| designPdfPath | 기준 디자인 PDF 절대 경로 |
| patternSvgPath | 타겟 사이즈 패턴 SVG 경로 (빈 문자열이면 클리핑 건너뜀) |
| outputPdfPath | 출력 PDF 저장 경로 |
| scaleX | 가로 스케일 비율 (1.0 = 100%) |
| scaleY | 세로 스케일 비율 (1.0 = 100%) |
| baseSize | 기준 사이즈 이름 (참고용) |
| targetSize | 타겟 사이즈 이름 (참고용) |
| resultJsonPath | 결과 JSON 저장 경로 |

## result.json 형식

```json
{
  "success": true,
  "outputPath": "C:/path/to/output_XS.pdf",
  "message": "그레이딩 완료 (95.0% x 92.0%)"
}
```

## 기술 제약

- ExtendScript는 ES3 기반 (let/const, arrow function, JSON.parse 사용 불가)
- JSON 파싱은 eval()로, 직렬화는 수동 구현
- Illustrator 버전에 따라 API 동작이 다를 수 있음
