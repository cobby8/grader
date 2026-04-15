/**
 * grading.jsx -- Illustrator ExtendScript 그레이딩 스크립트 (AI 레이어 기반)
 *
 * 동작 흐름:
 *   1. config.json 읽기 (스크립트와 같은 폴더)
 *   2. 기준 디자인 AI 파일 열기 (CMYK) — PDF 폴백 지원
 *   3. "몸판" 레이어에서 메인 색상 추출 (AI 파일일 때)
 *      또는 가장 큰 pathItem에서 추출 (PDF 폴백일 때)
 *   4. "요소" 레이어의 아이템을 선택 → 복사 (배경 제외!)
 *   5. 디자인 문서 닫기
 *   6. 타겟 패턴 SVG 열기 (CMYK)
 *   7. 레이어 3개 생성 (배경fill / 디자인요소 / 패턴선) — z-order 보장
 *   8. 패턴 조각에 추출한 색상으로 fill → 배경 레이어
 *   9. 원본 패턴 선 → 패턴선 레이어
 *   10. 클립보드의 "요소" → 디자인요소 레이어에 붙여넣기
 *   11. PDF 저장
 *   12. 정리 (문서 닫기, result.json)
 *
 * AI 파일 레이어 구조 (기대값):
 *   레이어 1: "패턴선" — 패턴 윤곽선 (참조용, 복사하지 않음)
 *   레이어 2: "요소"   — 스트라이프/로고/텍스트/번호 (이것만 복사)
 *   레이어 3: "몸판"   — 배경색 패턴 조각 (색상만 추출)
 *
 * z-order 출력 구조:
 *   최상위: 패턴 선 + 너치 (stroke만, 재단선이 보여야 함)
 *   중간:   디자인 요소 (AI의 "요소" 레이어에서 복사)
 *   최하위: 배경 fill (단색으로 채운 패턴 조각)
 *
 * 주의: ExtendScript는 ES3 기반!
 *   - var만 사용 (let/const 불가)
 *   - arrow function 불가
 *   - JSON.parse/stringify 미지원 -> 수동 구현
 *   - template literal 불가 (+ 로 문자열 연결)
 */

// ===== JSON 파서/직렬화 (ES3 호환) =====
// ExtendScript에는 JSON 객체가 없으므로 직접 구현한다.

/**
 * 간단한 JSON 파서.
 * 보안 이슈 없음 (로컬 파일만 읽으므로 eval 사용 가능).
 */
function jsonParse(str) {
    // eval로 JSON 파싱 — 로컬 파일이므로 보안 문제 없음
    return eval("(" + str + ")");
}

/**
 * 간단한 JSON 직렬화기.
 * 객체/배열/문자열/숫자/불리언/null을 JSON 문자열로 변환한다.
 */
function jsonStringify(obj) {
    if (obj === null || obj === undefined) {
        return "null";
    }
    // 문자열: 따옴표로 감싸고 특수문자 이스케이프
    if (typeof obj === "string") {
        return '"' + obj.replace(/\\/g, "\\\\")
                        .replace(/"/g, '\\"')
                        .replace(/\n/g, "\\n")
                        .replace(/\r/g, "\\r")
                        .replace(/\t/g, "\\t") + '"';
    }
    // 숫자, 불리언
    if (typeof obj === "number" || typeof obj === "boolean") {
        return String(obj);
    }
    // 배열
    if (obj instanceof Array) {
        var items = [];
        for (var i = 0; i < obj.length; i++) {
            items.push(jsonStringify(obj[i]));
        }
        return "[" + items.join(",") + "]";
    }
    // 객체
    if (typeof obj === "object") {
        var pairs = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                pairs.push(jsonStringify(key) + ":" + jsonStringify(obj[key]));
            }
        }
        return "{" + pairs.join(",") + "}";
    }
    return "null";
}

// ===== 디버그 로그 파일 (임시 디버그용, Phase 5+에서 제거 예정) =====
// 왜 필요한가:
//   - ExtendScript Toolkit 없이는 $.writeln 출력을 실시간으로 볼 수 없다.
//   - 사용자가 S/3XL/4XL 등 사이즈별 이상 동작 원인을 파악하려면
//     주요 계산 값(baseArea, targetArea, scale 등)이 파일로 남아야 한다.
//   - config.resultJsonPath와 같은 폴더에 grading-log.txt를 append로 저장한다.
//     → 여러 사이즈 실행 로그가 누적됨 → 이 파일 하나만 공유하면 분석 가능.
var _logFilePath = null;  // main() 초반 config 읽은 뒤 설정됨
var _logBuffer = [];      // flushLog() 호출 시 한 번에 파일에 기록

/**
 * 로그 한 줄 기록. $.writeln도 함께 호출해서 기존 콘솔 출력도 유지.
 * 실패 시에도 절대 스크립트를 멈추지 않는다 (try/catch로 감쌈).
 */
function writeLog(msg) {
    try {
        // toISOString은 ES5+ 기능이라 ExtendScript에서 없을 수 있다 → toString 폴백
        var now = new Date();
        var ts;
        try {
            ts = now.toISOString();
        } catch (eTs) {
            ts = now.toString();
        }
        var line = "[" + ts + "] " + msg;
        try { $.writeln(line); } catch (eWl) { /* 무시 */ }
        _logBuffer.push(line);
    } catch (eWriteLog) {
        // 로그 기록 자체 실패는 무시 (기능에 영향 없음)
    }
}

/**
 * 버퍼에 쌓인 로그를 파일에 append한다.
 * main() 종료 직전(try/finally의 finally) + 주요 분기 에러 시 호출.
 */
function flushLog() {
    try {
        if (!_logFilePath) return;        // 초기화 전이면 스킵
        if (_logBuffer.length === 0) return;
        var f = new File(_logFilePath);
        f.encoding = "UTF-8";
        // append 모드: 여러 사이즈 실행 시 로그 누적
        if (f.open("a")) {
            f.write(_logBuffer.join("\n") + "\n");
            f.close();
            _logBuffer = [];  // 중복 쓰기 방지 위해 비움
        }
    } catch (eFlush) {
        // flush 실패는 무시 (파일 권한/경로 문제 등)
    }
}

// ===== 파일 읽기/쓰기 헬퍼 =====

/**
 * 텍스트 파일을 UTF-8로 읽는다.
 * @param {string} filePath - 절대 경로
 * @returns {string} 파일 내용
 */
function readTextFile(filePath) {
    var file = new File(filePath);
    if (!file.exists) {
        throw new Error("파일을 찾을 수 없습니다: " + filePath);
    }
    file.encoding = "UTF-8";
    file.open("r");
    var content = file.read();
    file.close();
    return content;
}

/**
 * 텍스트 파일을 UTF-8로 쓴다.
 * @param {string} filePath - 절대 경로
 * @param {string} content - 쓸 내용
 */
function writeTextFile(filePath, content) {
    var file = new File(filePath);
    file.encoding = "UTF-8";
    file.open("w");
    file.write(content);
    file.close();
}

// ===== 결과 기록 함수 =====

/**
 * 성공 결과를 result.json에 기록한다.
 */
function writeSuccessResult(resultPath, outputPath, message) {
    var result = {
        success: true,
        outputPath: outputPath,
        message: message || "그레이딩 완료"
    };
    writeTextFile(resultPath, jsonStringify(result));
}

/**
 * 실패 결과를 result.json에 기록한다.
 */
function writeErrorResult(resultPath, errorMessage) {
    var result = {
        success: false,
        outputPath: "",
        message: errorMessage || "알 수 없는 오류"
    };
    writeTextFile(resultPath, jsonStringify(result));
}

// ===== 저장 옵션 (PDF / EPS) =====

/**
 * CMYK 보존 PDF 저장 옵션을 생성한다.
 * Illustrator의 PDF 저장은 기본적으로 CMYK를 유지한다.
 */
function createPdfSaveOptions() {
    var opts = new PDFSaveOptions();
    // PDF/X-4 호환 — 인쇄용 표준, CMYK 보존
    opts.compatibility = PDFCompatibility.ACROBAT7;
    // 압축 설정
    opts.preserveEditability = false;  // 편집 기능 불필요 (파일 크기 절감)
    opts.generateThumbnails = true;
    // 색상 변환하지 않음 (원본 CMYK 유지)
    opts.colorConversionID = ColorConversion.None;
    opts.colorDestinationID = ColorDestination.None;
    // 트림마크 없음
    opts.trimMarks = false;
    return opts;
}

/**
 * CMYK 보존 EPS 저장 옵션을 생성한다.
 * 왜 EPS인가:
 *   - 승화전사 업체에서 EPS 파일을 요구하는 경우가 많다.
 *   - EPS는 PostScript 기반이라 CMYK 색상 공간을 그대로 유지한다.
 */
function createEpsSaveOptions() {
    var opts = new EPSSaveOptions();
    // CS6 호환 — 대부분의 인쇄 업체 RIP에서 지원
    opts.compatibility = Compatibility.ILLUSTRATOR16;
    // 미리보기 포함 (TIFF 형식, 가장 범용적)
    opts.preview = EPSPreview.COLORTIFF;
    // 링크된 파일을 EPS 안에 포함시킨다 (단독 파일로 전달 가능)
    opts.embedLinkedFiles = true;
    // CMYK PostScript 출력 활성화
    opts.cmykPostScript = true;
    // PostScript Level 2 — Level 3보다 호환성이 좋음
    opts.postScript = EPSPostScriptLevelEnum.LEVEL2;
    return opts;
}

// ===== config.json 읽기 =====

/**
 * 스크립트와 같은 폴더의 config.json을 읽어서 파싱한다.
 * config 구조: { designAiPath?, designPdfPath?, patternSvgPath, outputPath, resultJsonPath }
 *   - outputPath: 출력 파일 경로 (.eps 또는 .pdf, 확장자로 형식 자동 판별)
 *   - outputPdfPath도 하위 호환으로 지원 (outputPath 우선)
 * designAiPath가 있으면 AI 레이어 방식, 없으면 designPdfPath로 PDF 폴백.
 */
function readConfig() {
    var scriptFile = new File($.fileName);
    var scriptFolder = scriptFile.parent;
    var configPath = scriptFolder.fsName + "\\config.json";

    $.writeln("[grading.jsx] config 경로: " + configPath);

    var configText = readTextFile(configPath);
    var config = jsonParse(configText);

    // 출력 경로: outputPath 우선, 없으면 outputPdfPath 폴백 (하위 호환)
    if (!config.outputPath && config.outputPdfPath) {
        config.outputPath = config.outputPdfPath;
    }
    if (!config.outputPath) {
        throw new Error("config에 outputPath가 필요합니다.");
    }

    // AI 파일 경로가 있으면 우선 사용, 없으면 PDF 폴백
    if (config.designAiPath) {
        $.writeln("[grading.jsx] 디자인 AI: " + config.designAiPath);
    } else if (config.designPdfPath) {
        $.writeln("[grading.jsx] 디자인 PDF (폴백): " + config.designPdfPath);
    } else {
        throw new Error("config에 designAiPath 또는 designPdfPath가 필요합니다.");
    }
    $.writeln("[grading.jsx] 패턴 SVG: " + config.patternSvgPath);
    $.writeln("[grading.jsx] 출력 경로: " + config.outputPath);

    // 출력 형식 판별 (확장자 기준)
    var outLower = config.outputPath.toLowerCase();
    if (outLower.indexOf(".eps") === outLower.length - 4) {
        config.outputFormat = "eps";
        $.writeln("[grading.jsx] 출력 형식: EPS");
    } else {
        config.outputFormat = "pdf";
        $.writeln("[grading.jsx] 출력 형식: PDF");
    }

    return config;
}

// ===== 색상 관련 함수 =====

/**
 * CMYK 색상을 새 객체로 복제한다.
 * 왜 복제가 필요한가:
 *   - ExtendScript에서 fillColor를 다른 객체에 할당하면 참조만 복사될 수 있다.
 *   - 원본 문서를 닫으면 참조가 무효화되어 에러가 발생한다.
 *   - 따라서 CMYK 값을 새 객체에 하나씩 복사해야 안전하다.
 */
function cloneCMYKColor(color) {
    var c = new CMYKColor();
    c.cyan = color.cyan;
    c.magenta = color.magenta;
    c.yellow = color.yellow;
    c.black = color.black;
    return c;
}

/**
 * 다양한 색상 타입을 안전하게 복제한다.
 * CMYKColor, RGBColor, GrayColor 등 타입에 따라 분기 처리한다.
 */
function cloneColor(color) {
    // CMYKColor — 인쇄용 표준, 가장 흔한 경우
    if (color.typename === "CMYKColor") {
        return cloneCMYKColor(color);
    }
    // RGBColor — CMYK로 변환 (인쇄용)
    if (color.typename === "RGBColor") {
        var r = color.red / 255;
        var g = color.green / 255;
        var b = color.blue / 255;
        var k = 1 - Math.max(r, g, b);
        var cmyk = new CMYKColor();
        if (k >= 1) {
            cmyk.cyan = 0;
            cmyk.magenta = 0;
            cmyk.yellow = 0;
            cmyk.black = 100;
        } else {
            cmyk.cyan = ((1 - r - k) / (1 - k)) * 100;
            cmyk.magenta = ((1 - g - k) / (1 - k)) * 100;
            cmyk.yellow = ((1 - b - k) / (1 - k)) * 100;
            cmyk.black = k * 100;
        }
        $.writeln("[grading.jsx] RGB->CMYK 변환: R" + color.red + " G" + color.green + " B" + color.blue
            + " -> C" + cmyk.cyan.toFixed(1) + " M" + cmyk.magenta.toFixed(1)
            + " Y" + cmyk.yellow.toFixed(1) + " K" + cmyk.black.toFixed(1));
        return cmyk;
    }
    // GrayColor — 흑백 디자인
    if (color.typename === "GrayColor") {
        var gray = new GrayColor();
        gray.gray = color.gray;
        return gray;
    }
    // SpotColor — 별색 (판톤 등)
    if (color.typename === "SpotColor") {
        var spot = new SpotColor();
        spot.spot = color.spot;
        spot.tint = color.tint;
        return spot;
    }
    // 알 수 없는 타입은 그대로 반환
    $.writeln("[grading.jsx] 경고: 미지원 색상 타입 — " + color.typename);
    return color;
}

// ===== 패턴선 자동 색상 전환 (APCA Lc 기반, WCAG 3.0 초안) =====

/**
 * CMYK 색상을 sRGB 선형 휘도(Y)로 변환한다.
 * 왜 선형 휘도인가:
 *   - APCA/WCAG 모두 선형 휘도(상대휘도)를 기준 입력으로 쓴다.
 *   - 단순 평균 밝기와 달리 인간 시각의 채널별 민감도(녹색 높음)를 반영한다.
 *
 * 계산 과정:
 *   1) CMYK → 근사 RGB: R=(1-C/100)*(1-K/100), G/B 동형 (M/Y 사용)
 *   2) 각 채널 sRGB 역감마: v <= 0.03928 ? v/12.92 : pow((v+0.055)/1.055, 2.4)
 *   3) 상대휘도: L = 0.2126*Rlin + 0.7152*Glin + 0.0722*Blin
 *
 * @param {CMYKColor} cmykColor - 입력 CMYK 색 (c/m/y/k는 0~100)
 * @return {Number} 0~1 범위의 선형 휘도
 */
function cmykToLinearLuminance(cmykColor) {
    // (1) CMYK → 근사 RGB (0~1)
    var c = cmykColor.cyan / 100;
    var m = cmykColor.magenta / 100;
    var y = cmykColor.yellow / 100;
    var k = cmykColor.black / 100;
    var r = (1 - c) * (1 - k);
    var g = (1 - m) * (1 - k);
    var b = (1 - y) * (1 - k);

    // (2) sRGB 역감마 보정 (채널 개별)
    var rLin = (r <= 0.03928) ? (r / 12.92) : Math.pow((r + 0.055) / 1.055, 2.4);
    var gLin = (g <= 0.03928) ? (g / 12.92) : Math.pow((g + 0.055) / 1.055, 2.4);
    var bLin = (b <= 0.03928) ? (b / 12.92) : Math.pow((b + 0.055) / 1.055, 2.4);

    // (3) 가중합 — WCAG 2.x 상대휘도 계수 (APCA도 동일 가중치 사용)
    return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * APCA(Accessible Perceptual Contrast Algorithm, WCAG 3.0 초안) Lc 값을 계산한다.
 *
 * 왜 APCA로 교체했는가:
 *   - WCAG 2.x 대비비 공식은 "밝기 1차원"만 보기 때문에 파랑/빨강/보라처럼
 *     채도가 높고 중간 밝기인 색에서 지각적 대비를 과소평가한다.
 *     실제 사례: 파랑 C100M50 배경에서 수학적으로는 검정이 이기지만
 *     사람 눈에는 흰색이 훨씬 잘 보임 — APCA는 이 케이스를 올바르게 판정한다.
 *
 * 부호 의미:
 *   - 음수 Lc: light-on-dark (어두운 배경 위 밝은 텍스트, 즉 흰 텍스트 시나리오)
 *   - 양수 Lc: dark-on-light (밝은 배경 위 어두운 텍스트, 즉 검 텍스트 시나리오)
 *   - 최종 가독성 비교는 Math.abs(Lc)로 한다 (절대값 큰 쪽이 더 잘 보임)
 *
 * 자가 점검용 기대값 (배경 → |lcW|, |lcB|, 선택):
 *   파랑   C100M50  Y≈0.2253 → 67, 50 → 흰
 *   빨강   M100Y100 Y≈0.2126 → 68, 49 → 흰
 *   초록   C70Y100  Y≈0.7308 → 12, 93 → 검
 *   노랑   Y100     Y≈0.9278 → 3, 104 → 검
 *   진회색 K85      Y≈0.0193 → 96, 16 → 흰
 *
 * @param {Number} yBg  - 배경 상대휘도 (0~1, cmykToLinearLuminance의 반환값)
 * @param {Number} yTxt - 텍스트 상대휘도 (0~1, 흰=1.0, 검=0.0)
 * @return {Number} Lc 값 (대략 -108 ~ +106 범위, 부호 있음)
 */
function apcaContrastLc(yBg, yTxt) {
    // 입력 방어: NaN/음수는 0으로 보정 (CMYK 변환 과정에서 미세 오차 가능)
    if (isNaN(yBg) || yBg < 0) yBg = 0;
    if (isNaN(yTxt) || yTxt < 0) yTxt = 0;

    var lc;
    // light-on-dark: 텍스트가 배경보다 밝음 → 음수 Lc
    if (yTxt > yBg) {
        lc = 1.14 * (Math.pow(yBg, 0.62) - Math.pow(yTxt, 0.65)) * 100;
    } else {
        // dark-on-light (텍스트가 배경보다 어둡거나 같음) → 양수 Lc
        lc = 1.14 * (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 100;
    }
    return lc;
}

/**
 * 배경 CMYK 색에 대해 흰/검 중 더 높은 APCA 대비를 주는 쪽을 반환한다.
 * 왜 APCA로 교체했는가:
 *   - WCAG 2.x는 밝기 1차원만 봐서 파랑(C100M50) 같은 중채도 색에서 흰/검 판정이 시각과 어긋남.
 *   - APCA Lc는 배경/텍스트 휘도에 비대칭 지수(0.56/0.57 vs 0.62/0.65)를 적용해 지각에 더 가깝다.
 *   - 동률 시 흰 선택을 기본 bias로 둔다(가독성 기본 안전책).
 *
 * @param {CMYKColor|null} bgCmykColor - 배경(몸판) 색. null이면 판정 불가 → null 반환
 * @return {CMYKColor|null} 선택된 stroke 색 (흰=CMYK(0,0,0,0) 또는 검=CMYK(0,0,0,100))
 */
function pickPatternStrokeColor(bgCmykColor) {
    // 배경 색이 없으면 판정 불가 → 호출부에서 keep 폴백으로 처리
    if (!bgCmykColor) {
        return null;
    }

    // 배경의 선형 휘도 (APCA 입력)
    var lBg = cmykToLinearLuminance(bgCmykColor);

    // APCA Lc 계산: 흰 텍스트 vs 검 텍스트
    // - lcWhite: 보통 음수 (어두운 배경일수록 |값| 큼 → 흰이 잘 보임)
    // - lcBlack: 보통 양수 (밝은 배경일수록 |값| 큼 → 검이 잘 보임)
    var lcWhite = apcaContrastLc(lBg, 1.0);
    var lcBlack = apcaContrastLc(lBg, 0.0);

    // 절대값 큰 쪽 = 더 잘 보이는 선 색 (동률은 흰 선택)
    if (Math.abs(lcWhite) >= Math.abs(lcBlack)) {
        var white = new CMYKColor();
        white.cyan = 0;
        white.magenta = 0;
        white.yellow = 0;
        white.black = 0;
        return white;
    }
    var black = new CMYKColor();
    black.cyan = 0;
    black.magenta = 0;
    black.yellow = 0;
    black.black = 100;
    return black;
}

/**
 * 컨테이너 내부를 재귀 순회하며 모든 path의 stroke 색을 newColor로 덮어쓴다.
 * 왜 재귀인가:
 *   - layerPattern 내부에 GroupItem / CompoundPathItem 중첩이 있을 수 있다.
 *   - 플랫하게 pathItems만 보면 중첩된 path를 놓친다.
 *
 * 스킵 규칙 (Phase 1 보수안):
 *   - fill은 절대 건드리지 않는다 (별표 등 기호 보존)
 *   - stroked === false면 스킵 (선이 없는 path)
 *   - strokeColor.typename이 "CMYKColor"/"RGBColor"/"GrayColor"(단색) 일 때만 덮어쓰기
 *   - Gradient/Pattern/NoColor는 스킵 (복합 색 덮어쓰기 위험)
 *
 * @param {Object} container - pageItems/pathItems를 가진 컨테이너 (Layer, GroupItem, CompoundPathItem)
 * @param {CMYKColor} newColor - 적용할 stroke 색
 * @return {Number} 실제로 덮어쓴 path 개수 (통계용)
 */
function applyPatternStrokeColorRecursive(container, newColor) {
    var applied = 0;
    // pageItems를 돌면서 typename별 분기
    var items = container.pageItems;
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var tn = item.typename;

        if (tn === "PathItem") {
            // 선 있는 단색 stroke만 덮어쓰기
            if (item.stroked && item.strokeColor) {
                var stn = item.strokeColor.typename;
                if (stn === "CMYKColor" || stn === "RGBColor" || stn === "GrayColor") {
                    item.strokeColor = cloneCMYKColor(newColor);
                    applied++;
                }
                // Gradient/Pattern/NoColor는 스킵
            }
        } else if (tn === "CompoundPathItem") {
            // CompoundPath 내부 pathItems 직접 순회 (pageItems 없음)
            var compPaths = item.pathItems;
            for (var j = 0; j < compPaths.length; j++) {
                var cp = compPaths[j];
                if (cp.stroked && cp.strokeColor) {
                    var cstn = cp.strokeColor.typename;
                    if (cstn === "CMYKColor" || cstn === "RGBColor" || cstn === "GrayColor") {
                        cp.strokeColor = cloneCMYKColor(newColor);
                        applied++;
                    }
                }
            }
        } else if (tn === "GroupItem") {
            // 그룹은 재귀
            applied += applyPatternStrokeColorRecursive(item, newColor);
        }
        // 기타(TextFrame/PlacedItem 등)는 스킵
    }
    return applied;
}

// ===== AI 레이어 기반 색상 추출 =====

/**
 * AI 파일의 "몸판" 레이어에서 메인 색상을 추출한다.
 * 왜 "몸판" 레이어인가:
 *   - AI 파일은 레이어가 명확히 분리되어 있다.
 *   - "몸판" 레이어에는 배경색 패턴 조각만 있으므로
 *     첫 번째 채워진 pathItem의 색상이 곧 메인 배경색이다.
 *   - PDF처럼 면적 기준으로 추측할 필요가 없어 정확도가 높다.
 *
 * @param {Document} doc - AI 디자인 문서
 * @returns {Color} 메인 색상 (복제된 객체)
 */
function extractColorFromBodyLayer(doc) {
    var bodyLayer;
    try {
        bodyLayer = doc.layers.getByName("몸판");
    } catch (e) {
        $.writeln("[grading.jsx] '몸판' 레이어를 찾을 수 없음 — 폴백으로 전체 문서 탐색");
        return null;
    }

    $.writeln("[grading.jsx] '몸판' 레이어 발견, pathItems: " + bodyLayer.pathItems.length);

    // "몸판" 레이어의 pathItems에서 첫 번째 채워진 아이템의 색상 사용
    for (var i = 0; i < bodyLayer.pathItems.length; i++) {
        var item = bodyLayer.pathItems[i];
        if (item.filled) {
            $.writeln("[grading.jsx] 몸판 색상 발견 (pathItem " + i + ")");
            return cloneColor(item.fillColor);
        }
    }

    // pathItems에 없으면 pageItems 전체를 순회 (그룹 내부 등)
    for (var j = 0; j < bodyLayer.pageItems.length; j++) {
        var pageItem = bodyLayer.pageItems[j];
        // pathItem 타입인 경우
        if (pageItem.typename === "PathItem" && pageItem.filled) {
            $.writeln("[grading.jsx] 몸판 색상 발견 (pageItem " + j + ")");
            return cloneColor(pageItem.fillColor);
        }
        // 그룹 내부 탐색
        if (pageItem.typename === "GroupItem") {
            var groupColor = findFirstFillInGroup(pageItem);
            if (groupColor) {
                $.writeln("[grading.jsx] 몸판 색상 발견 (그룹 내부)");
                return cloneColor(groupColor);
            }
        }
    }

    $.writeln("[grading.jsx] '몸판' 레이어에서 채워진 아이템을 찾을 수 없음");
    return null;
}

/**
 * 그룹 아이템 내부를 재귀 탐색하여 첫 번째 fill 색상을 찾는다.
 */
function findFirstFillInGroup(group) {
    for (var i = 0; i < group.pathItems.length; i++) {
        if (group.pathItems[i].filled) {
            return group.pathItems[i].fillColor;
        }
    }
    // 중첩 그룹도 재귀 탐색
    for (var j = 0; j < group.groupItems.length; j++) {
        var nested = findFirstFillInGroup(group.groupItems[j]);
        if (nested) return nested;
    }
    return null;
}

// ===== PDF 폴백용 색상 추출 (기존 로직) =====

/**
 * 그룹 아이템 내부를 재귀 탐색하여 가장 큰 면적의 fill 색상을 찾는다.
 */
function findLargestFillInGroups(container) {
    var largestArea = 0;
    var mainColor = null;

    for (var i = 0; i < container.groupItems.length; i++) {
        var group = container.groupItems[i];
        for (var j = 0; j < group.pathItems.length; j++) {
            var item = group.pathItems[j];
            if (item.filled) {
                var area = Math.abs(item.width * item.height);
                if (area > largestArea) {
                    largestArea = area;
                    mainColor = item.fillColor;
                }
            }
        }
        var nested = findLargestFillInGroups(group);
        if (nested && !mainColor) {
            mainColor = nested;
        }
    }
    return mainColor;
}

/**
 * PDF 디자인 문서에서 배경 메인 색상을 추출한다. (면적 기준 — 폴백용)
 */
function extractMainColorFromDoc(doc) {
    var largestArea = 0;
    var mainColor = null;

    for (var i = 0; i < doc.pathItems.length; i++) {
        var item = doc.pathItems[i];
        if (item.filled) {
            var area = Math.abs(item.width * item.height);
            if (area > largestArea) {
                largestArea = area;
                mainColor = item.fillColor;
            }
        }
    }

    if (!mainColor) {
        $.writeln("[grading.jsx] 최상위 pathItems에서 색상 못 찾음 — 그룹 내부 탐색");
        mainColor = findLargestFillInGroups(doc);
    }

    // 기본 폴백 색상
    if (!mainColor) {
        var fallback = new CMYKColor();
        fallback.cyan = 80;
        fallback.magenta = 30;
        fallback.yellow = 0;
        fallback.black = 0;
        mainColor = fallback;
        $.writeln("[grading.jsx] 경고: 메인 색상 자동 추출 실패, 기본 색상(C80 M30) 사용");
    }

    return mainColor;
}

// ===== 디자인 소스 판별 =====

/**
 * config에서 디자인 파일 경로를 결정한다.
 * AI 파일이 존재하면 AI 우선, 없으면 PDF 폴백.
 * @returns {{ path: string, isAi: boolean }}
 */
function resolveDesignFile(config) {
    // AI 파일 경로가 config에 있고, 실제 파일이 존재하면 AI 사용
    if (config.designAiPath) {
        var aiFile = new File(config.designAiPath);
        if (aiFile.exists) {
            $.writeln("[grading.jsx] AI 파일 사용: " + config.designAiPath);
            return { path: config.designAiPath, isAi: true };
        }
        $.writeln("[grading.jsx] AI 파일 없음, PDF 폴백 시도: " + config.designAiPath);
    }

    // PDF 폴백
    if (config.designPdfPath) {
        var pdfFile = new File(config.designPdfPath);
        if (pdfFile.exists) {
            $.writeln("[grading.jsx] PDF 폴백 사용: " + config.designPdfPath);
            return { path: config.designPdfPath, isAi: false };
        }
        throw new Error("디자인 PDF를 찾을 수 없습니다: " + config.designPdfPath);
    }

    throw new Error("config에 유효한 디자인 파일 경로가 없습니다.");
}

// ===== 면적 계산 유틸 =====

/**
 * 특정 레이어의 pathItem 면적을 합산한다.
 * 왜 면적을 계산하나:
 *   - 디자인 AI의 "패턴선" 레이어 면적(기준)과 타겟 SVG 패턴 면적을 비교하여
 *     요소를 적절한 비율로 스케일링하기 위해서다.
 * 50pt 미만 조각은 너치/가이드이므로 제외한다.
 * path.area는 닫힌 경로에서만 유효하므로, 열린 경로는 닫고 계산한다.
 * @param {Layer} layer - 대상 레이어
 * @returns {{ totalArea: number, pieceCount: number }}
 */
function calcLayerArea(layer) {
    var totalArea = 0;
    var count = 0;
    for (var i = 0; i < layer.pathItems.length; i++) {
        var path = layer.pathItems[i];
        // 가로/세로 모두 50pt 이상인 조각만 면적 계산 (너치/가이드 제외)
        if (Math.abs(path.width) > 50 && Math.abs(path.height) > 50) {
            // 열린 경로는 면적 계산을 위해 닫는다
            if (!path.closed) {
                path.closed = true;
            }
            // path.area는 반시계방향이면 음수이므로 절대값 사용
            totalArea += Math.abs(path.area);
            count++;
        }
    }
    return { totalArea: totalArea, pieceCount: count };
}

/**
 * 문서의 모든 레이어에서 큰 pathItem(50pt 이상)의 면적을 합산한다.
 * @param {Document} doc - 대상 문서
 * @returns {{ totalArea: number, pieceCount: number }}
 */
function calcTotalArea(doc) {
    var totalArea = 0;
    var count = 0;
    for (var li = 0; li < doc.layers.length; li++) {
        var layer = doc.layers[li];
        for (var pi = 0; pi < layer.pathItems.length; pi++) {
            var path = layer.pathItems[pi];
            if (Math.abs(path.width) > 50 && Math.abs(path.height) > 50) {
                if (!path.closed) {
                    path.closed = true;
                }
                totalArea += Math.abs(path.area);
                count++;
            }
        }
    }
    return { totalArea: totalArea, pieceCount: count };
}

// ===== 신규 헬퍼: RGB 문서 판정 =====
// 왜 이 함수가 필요한가:
//   - 사용자가 실수로 디자인 AI를 RGB 모드로 작업/저장했을 수 있다.
//   - RGB 모드에서 시작한 색은 Illustrator가 나중에 자동으로 CMYK로 변환할 때
//     원본 의도와 다른 색상값으로 양자화(손실)된다.
//   - 따라서 열자마자 색 공간을 체크해서, 엄격 모드면 즉시 중단하는 것이 안전하다.
function isRgbDocument(doc) {
    try {
        // DocumentColorSpace.RGB 이면 true 반환
        return doc.documentColorSpace === DocumentColorSpace.RGB;
    } catch (e) {
        // 호환성 문제로 enum 비교 실패 시 false (안전 쪽: 통과)
        return false;
    }
}

// ===== 신규 헬퍼: 빈 CMYK 베이스 문서 생성 =====
/**
 * 왜 새 CMYK 문서를 처음부터 만들어야 하나:
 *   - 기존 방식은 SVG를 app.open()으로 열 때 CMYK 플래그를 줬지만,
 *     SVG의 원본 hex 색이 RGB로 해석된 뒤 CMYK로 양자화되는 경로를 탔다.
 *   - 새 방식은 처음부터 CMYK 전용 문서를 만들어 두고,
 *     path만 복제(duplicate)해서 옮긴 뒤 fillColor를 CMYKColor로 재할당한다.
 *   - 이렇게 하면 색은 우리가 수식으로 직접 계산한 CMYK 값만 사용하게 된다.
 *
 * @param {number} widthPt - 아트보드 가로 (pt 단위)
 * @param {number} heightPt - 아트보드 세로 (pt 단위)
 * @returns {Document} 새로 만든 CMYK 문서
 */
function createCmykBaseDoc(widthPt, heightPt) {
    // DocumentPreset을 쓰면 버전 호환성이 가장 좋다
    var preset = new DocumentPreset();
    preset.colorMode = DocumentColorSpace.CMYK;
    preset.width = widthPt;
    preset.height = heightPt;
    preset.units = RulerUnits.Points;
    preset.title = "grading-base-cmyk";
    // Illustrator CS6+ 에서 지원하는 시그니처
    var newDoc = app.documents.addDocument("Print", preset);
    // 혹시 아트보드가 기대 크기와 다르면 재설정
    // artboardRect = [left, top, right, bottom] (Y축: 위가 큰 값)
    newDoc.artboards[0].artboardRect = [0, heightPt, widthPt, 0];
    $.writeln("[grading.jsx] CMYK 베이스 문서 생성: " + widthPt.toFixed(1) + " x " + heightPt.toFixed(1) + " pt");
    return newDoc;
}

// ===== 신규 헬퍼: SVG path를 CMYK 베이스 문서로 임포트 =====
/**
 * 왜 duplicate(targetDoc)인가:
 *   - SVG 원본 문서(svgDoc)는 RGB 기반으로 열릴 수 있다.
 *   - 하지만 path의 기하 정보(좌표/모양)는 색 공간과 무관하므로,
 *     targetDoc(이미 CMYK)으로 복제 후 fillColor를 CMYKColor로 재할당하면
 *     색은 우리가 통제하는 CMYK 값만 사용된다.
 *
 * 처리 규칙:
 *   - 50pt 이상 패턴 조각: path를 layerFill로 복제(fill=mainColor) + 원본 stroke는 layerPattern
 *   - 50pt 미만 (너치/가이드): layerPattern으로 이동
 *   - 그룹/기타: layerPattern으로 이동
 *
 * @param {Document} svgDoc - 원본 SVG 문서 (색 공간 무관)
 * @param {Document} targetDoc - CMYK 베이스 문서 (활성 상태여야 함)
 * @param {Color} mainColor - 몸판 색상 (CMYK)
 * @param {Layer} layerFill - 배경 fill 레이어 (targetDoc 소속)
 * @param {Layer} layerPattern - 패턴 선 레이어 (targetDoc 소속)
 * @returns {{ filledCount: number, targetArea: number }}
 */
function importSvgPathsToDoc(svgDoc, targetDoc, mainColor, layerFill, layerPattern) {
    var filledCount = 0;
    var targetArea = 0;
    // basePieces: 베이스 문서에 복제된 몸판 조각들의 bbox 목록
    // Phase 2에서 요소를 각 조각별로 개별 정렬할 때 매핑 대상으로 사용한다.
    var basePieces = [];

    // [DEBUG LOG] 타겟 SVG 문서 요약 (레이어 수 + 첫 아트보드 크기)
    try {
        var svgAbDbg = svgDoc.artboards[0].artboardRect;
        writeLog("importSvgPathsToDoc 시작: svgDoc=" + svgDoc.name
            + " layers=" + svgDoc.layers.length
            + " artboard=[" + svgAbDbg.join(",") + "]"
            + " size=" + (svgAbDbg[2] - svgAbDbg[0]).toFixed(1) + "x" + (svgAbDbg[1] - svgAbDbg[3]).toFixed(1));
    } catch (eLogSvg) { /* 무시 */ }

    // 원본 SVG의 모든 레이어를 순회
    for (var li = 0; li < svgDoc.layers.length; li++) {
        var srcLayer = svgDoc.layers[li];

        // 뒤에서부터 처리 (duplicate/move 시 인덱스가 밀릴 수 있어 역순이 안전)
        var pathCount = srcLayer.pathItems.length;
        for (var pi = pathCount - 1; pi >= 0; pi--) {
            var path = srcLayer.pathItems[pi];

            // 가로/세로 모두 50pt 이상 = 패턴 조각으로 간주
            if (Math.abs(path.width) > 50 && Math.abs(path.height) > 50) {
                // 열린 경로는 닫기 (fill 적용 가능하게)
                if (!path.closed) {
                    path.closed = true;
                }
                // 타겟 면적 합산 (STEP 6의 스케일링 기준)
                var _pathArea = Math.abs(path.area);
                targetArea += _pathArea;
                // [DEBUG LOG] 50pt 이상 통과한 path 상세 (사이즈별 조각 수/면적 분포 확인)
                try {
                    var _pb = path.geometricBounds;
                    writeLog("  path[layer=" + li + ",idx=" + pi + "] w="
                        + Math.abs(path.width).toFixed(1)
                        + " h=" + Math.abs(path.height).toFixed(1)
                        + " area=" + _pathArea.toFixed(1)
                        + " bounds=[" + _pb[0].toFixed(1) + "," + _pb[1].toFixed(1)
                        + "," + _pb[2].toFixed(1) + "," + _pb[3].toFixed(1) + "]");
                } catch (eLp) { /* 무시 */ }

                // 1) fill용 사본을 targetDoc의 배경 레이어로 복제
                //    duplicate(targetContainer, ElementPlacement) 로 문서 간 복제 가능
                var fillCopy = path.duplicate(layerFill, ElementPlacement.PLACEATEND);
                fillCopy.filled = true;
                // 우리가 직접 만든 CMYKColor를 할당 (RGB 원본과 무관해짐)
                fillCopy.fillColor = cloneCMYKColor(mainColor);
                fillCopy.stroked = false;

                // 2) 원본 stroke는 패턴선 레이어로 복제 (fill 제거)
                var lineCopy = path.duplicate(layerPattern, ElementPlacement.PLACEATEND);
                lineCopy.filled = false;
                // stroke 색이 RGB면 CMYK로 변환
                if (lineCopy.stroked && lineCopy.strokeColor) {
                    if (lineCopy.strokeColor.typename === "RGBColor") {
                        lineCopy.strokeColor = cloneColor(lineCopy.strokeColor);
                    }
                }

                // basePieces에 fillCopy의 bbox 저장 (Phase 2 매핑 소스)
                // geometricBounds = [left, top, right, bottom] (Illustrator Y축: 위=큰 값)
                var fb = fillCopy.geometricBounds;
                var cx = (fb[0] + fb[2]) / 2;
                var cy = (fb[1] + fb[3]) / 2;
                basePieces.push({
                    bbox: [fb[0], fb[1], fb[2], fb[3]],
                    cx: cx,
                    cy: cy,
                    area: Math.abs(fillCopy.area)
                });

                filledCount++;
            } else {
                // 작은 조각 (너치/가이드) → 패턴선 레이어로 복제
                var smallCopy = path.duplicate(layerPattern, ElementPlacement.PLACEATEND);
                // 색 정리 (RGB → CMYK)
                if (smallCopy.filled && smallCopy.fillColor && smallCopy.fillColor.typename === "RGBColor") {
                    smallCopy.fillColor = cloneColor(smallCopy.fillColor);
                }
                if (smallCopy.stroked && smallCopy.strokeColor && smallCopy.strokeColor.typename === "RGBColor") {
                    smallCopy.strokeColor = cloneColor(smallCopy.strokeColor);
                }
            }
        }

        // 그룹 아이템도 패턴선 레이어로 그대로 복제
        var groupCount = srcLayer.groupItems.length;
        for (var gi = groupCount - 1; gi >= 0; gi--) {
            srcLayer.groupItems[gi].duplicate(layerPattern, ElementPlacement.PLACEATEND);
        }
    }

    // basePieces를 X 오름차순으로 정렬 → designPieces와 동일 순서 가정
    // (사용자 승인: SVG 몸판 조각과 디자인 AI 조각 순서가 X 오름차순으로 일치한다는 가정)
    basePieces.sort(function (a, b) { return a.cx - b.cx; });

    // [DEBUG LOG] 합산 결과 — baseArea와 비교해 스케일 이상 감지
    writeLog("importSvgPathsToDoc 완료: filledCount=" + filledCount
        + " (50pt 이상), targetArea=" + targetArea.toFixed(2) + " pt^2"
        + ", basePieces=" + basePieces.length + "개");

    return { filledCount: filledCount, targetArea: targetArea, basePieces: basePieces };
}

// ===== Phase 2 신규 함수 1: 레이어에서 몸판 조각 bbox 배열 추출 =====
/**
 * 왜 필요한가:
 *   - 디자인 AI의 "패턴선" 레이어에는 앞판/뒷판/소매 등 몸판 조각 path들이 있다.
 *   - 각 조각의 bbox를 뽑아내어, "요소"가 어느 조각 위에 놓여있는지 공간 매핑에 사용한다.
 *
 * @param {Layer} layer - 패턴선 레이어
 * @param {number} minSize - 조각으로 간주할 최소 가로/세로 크기 (pt). 너치/가이드 제외용.
 * @returns {Array<{bbox: number[], cx: number, cy: number, area: number}>}
 *   X 중심 오름차순으로 정렬된 조각 배열
 */
function extractPatternPieces(layer, minSize) {
    var pieces = [];
    if (!layer) return pieces;

    // pathItems 순회: 단독 path 조각
    for (var pi = 0; pi < layer.pathItems.length; pi++) {
        var path = layer.pathItems[pi];
        // 너치/가이드 필터: 가로/세로 모두 minSize 이상
        if (Math.abs(path.width) > minSize && Math.abs(path.height) > minSize) {
            var pb = path.geometricBounds;
            pieces.push({
                bbox: [pb[0], pb[1], pb[2], pb[3]],
                cx: (pb[0] + pb[2]) / 2,
                cy: (pb[1] + pb[3]) / 2,
                area: Math.abs(path.area)
            });
        }
    }

    // groupItems 순회: 그룹 단위 조각 (예: 칼라처럼 여러 path 묶음)
    for (var gi = 0; gi < layer.groupItems.length; gi++) {
        var grp = layer.groupItems[gi];
        var gb = grp.geometricBounds;
        var gw = Math.abs(gb[2] - gb[0]);
        var gh = Math.abs(gb[1] - gb[3]);
        if (gw > minSize && gh > minSize) {
            pieces.push({
                bbox: [gb[0], gb[1], gb[2], gb[3]],
                cx: (gb[0] + gb[2]) / 2,
                cy: (gb[1] + gb[3]) / 2,
                area: gw * gh // 그룹은 정확한 area가 없으므로 bbox 면적으로 근사
            });
        }
    }

    // X 중심 오름차순 정렬 (사용자 승인 규칙: 몸판 SVG와 동일 정렬 가정)
    pieces.sort(function (a, b) { return a.cx - b.cx; });
    return pieces;
}

// ===== Phase 2 신규 함수 2: 두 bbox의 교집합 면적 =====
/**
 * 왜 필요한가:
 *   - 요소 bbox가 여러 조각에 걸쳐있을 때, "가장 많이 겹치는 조각"에 매핑해야 한다.
 *   - 교집합 면적이 클수록 해당 조각에 속할 가능성이 높다.
 *
 * @param {number[]} a - [left, top, right, bottom] (Illustrator Y: top>bottom)
 * @param {number[]} b - [left, top, right, bottom]
 * @returns {number} 교집합 면적. 겹치지 않으면 0.
 */
function bboxIntersectionArea(a, b) {
    // X축: 양쪽 left의 max ~ 양쪽 right의 min
    var ix1 = Math.max(a[0], b[0]);
    var ix2 = Math.min(a[2], b[2]);
    var iw = ix2 - ix1;
    if (iw <= 0) return 0;

    // Y축: Illustrator는 top이 큰 값, bottom이 작은 값 → 교집합은 min(top)~max(bottom)
    var iy1 = Math.min(a[1], b[1]);   // top 쪽 (작은 top = 교집합의 top)
    var iy2 = Math.max(a[3], b[3]);   // bottom 쪽 (큰 bottom = 교집합의 bottom)
    var ih = iy1 - iy2;
    if (ih <= 0) return 0;

    return iw * ih;
}

// ===== Phase 2 신규 함수 3: 요소 bbox와 가장 잘 매칭되는 조각 인덱스 =====
/**
 * 왜 필요한가:
 *   - 요소 한 개가 어느 몸판 조각 위에 놓였는지 판정해야 한다.
 *   - 1차: 교집합 면적 최대인 조각 선택.
 *   - 2차: 교집합이 모두 0이면 중심 간 거리 최소인 조각으로 폴백.
 *
 * @param {number[]} itemBbox - [left, top, right, bottom]
 * @param {Array} pieces - extractPatternPieces 결과
 * @returns {number} 매칭된 조각 인덱스 (-1 = 매칭 실패)
 */
function findBestMatchingPiece(itemBbox, pieces) {
    if (!pieces || pieces.length === 0) return -1;

    var bestIdx = -1;
    var bestArea = 0;

    // 1차: 교집합 면적 최대 조각 찾기
    for (var i = 0; i < pieces.length; i++) {
        var area = bboxIntersectionArea(itemBbox, pieces[i].bbox);
        if (area > bestArea) {
            bestArea = area;
            bestIdx = i;
        }
    }
    if (bestIdx >= 0) return bestIdx;

    // 2차 폴백: 중심 간 유클리드 거리 최소 조각
    var icx = (itemBbox[0] + itemBbox[2]) / 2;
    var icy = (itemBbox[1] + itemBbox[3]) / 2;
    var bestDist = Infinity;
    for (var j = 0; j < pieces.length; j++) {
        var dx = icx - pieces[j].cx;
        var dy = icy - pieces[j].cy;
        var d = dx * dx + dy * dy; // 제곱 비교면 충분 (sqrt 생략)
        if (d < bestDist) {
            bestDist = d;
            bestIdx = j;
        }
    }
    return bestIdx;
}

// ===== Phase 2 신규 함수 4: 개별 요소를 매칭 조각으로 이동 =====
/**
 * 왜 필요한가:
 *   - 요소 전체를 한 덩어리로 중앙 이동하면 각 조각(앞판/뒷판/소매) 위에 놓이지 않는다.
 *   - 원본 디자인 AI에서 요소가 designPiece 기준으로 가진 상대 오프셋을 보존하면서,
 *     basePiece(베이스 문서의 해당 몸판) 중심으로 맞춰 이동해야 자연스럽다.
 *
 * 방식 B (원본 상대 위치 보존):
 *   - 새 중심 = basePiece.center + (원본 상대 오프셋 × linearScale)
 *   - 원본 상대 오프셋 = 원본 요소 중심 - designPiece 중심 (스케일 전)
 *   - 요소는 이미 linearScale로 스케일된 상태 → 오프셋도 동일 비율로 적용
 *
 * @param {PageItem} item - 이동 대상 요소 (이미 스케일된 상태)
 * @param {Object} originalCenter - {cx, cy} 스케일 전 원본 요소 중심
 * @param {Object} designPiece - 원본 디자인 AI의 매칭된 조각 {cx, cy}
 * @param {Object} basePiece - 베이스 문서의 매칭된 조각 {cx, cy}
 * @param {number} linearScale - 면적 비율 선형 스케일 (sqrt(targetArea/baseArea))
 */
function alignElementToPiece(item, originalCenter, designPiece, basePiece, linearScale) {
    if (!item || !designPiece || !basePiece) return;

    // 원본 상대 오프셋 (스케일 전 공간에서 측정)
    var relX = originalCenter.cx - designPiece.cx;
    var relY = originalCenter.cy - designPiece.cy;

    // 스케일 적용 후 새 중심
    var newCx = basePiece.cx + relX * linearScale;
    var newCy = basePiece.cy + relY * linearScale;

    // 현재(스케일 후) 요소 중심
    var ib = item.geometricBounds;
    var curCx = (ib[0] + ib[2]) / 2;
    var curCy = (ib[1] + ib[3]) / 2;

    // translate 오프셋 (현재 → 새 위치)
    var dx = newCx - curCx;
    var dy = newCy - curCy;
    item.translate(dx, dy);
}

// ===== 신규 헬퍼: 요소 그룹을 몸판 중앙으로 정렬 =====
/**
 * 왜 별도 함수로 뽑았나:
 *   - 기존 코드에서 동일한 중앙 정렬 로직이 두 번 중복돼 있었다.
 *   - 한 곳으로 모아 유지보수성을 높인다.
 *
 * @param {GroupItem} group - 중앙으로 이동할 요소 그룹
 * @param {Layer} layerFill - 몸판(배경 fill) 레이어 (전체 BBox 기준)
 */
function alignToBodyCenter(group, layerFill) {
    if (!group || !layerFill) return;
    var fillItems = layerFill.pageItems;
    if (fillItems.length === 0) return;

    // 몸판 전체 BBox 계산 (Illustrator Y축: 위=큰 값, 아래=작은 값)
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var fi = 0; fi < fillItems.length; fi++) {
        var fb = fillItems[fi].geometricBounds; // [left, top, right, bottom]
        if (fb[0] < minX) minX = fb[0];
        if (fb[1] > maxY) maxY = fb[1];
        if (fb[2] > maxX) maxX = fb[2];
        if (fb[3] < minY) minY = fb[3];
    }
    var bodyCenterX = (minX + maxX) / 2;
    var bodyCenterY = (minY + maxY) / 2;

    // 요소 그룹 중앙
    var gb = group.geometricBounds;
    var groupCenterX = (gb[0] + gb[2]) / 2;
    var groupCenterY = (gb[1] + gb[3]) / 2;

    // 오프셋 이동
    var offsetX = bodyCenterX - groupCenterX;
    var offsetY = bodyCenterY - groupCenterY;
    group.translate(offsetX, offsetY);

    $.writeln("[grading.jsx] 몸판 중앙 정렬: 중심(" + bodyCenterX.toFixed(1) + ", " + bodyCenterY.toFixed(1)
        + ") 이동량(" + offsetX.toFixed(1) + ", " + offsetY.toFixed(1) + ")");
}

/**
 * pageItem 배열의 합집합 geometricBounds 계산 (2026-04-16, 버그 C 대응 D1 모드).
 *
 * 왜 필요한가:
 *   - STEP 10 D1 모드는 "요소 전체"가 아트보드 안에 들어가는지 판정해야 한다.
 *   - 개별 요소가 layerDesign에 흩어져 있으면 그룹 bounds를 얻을 수 없으므로,
 *     배열 순회로 합집합 bounds를 직접 계산.
 *
 * Illustrator 좌표: [left, top, right, bottom], top > bottom (Y 위쪽이 큼).
 * @param {PageItem[]} items
 * @returns {Number[]} [left, top, right, bottom]
 */
function calculateUnionBoundsOfItems(items) {
    if (!items || items.length === 0) return [0, 0, 0, 0];
    var first = items[0].geometricBounds; // [left, top, right, bottom]
    var minLeft = first[0];
    var maxTop = first[1];
    var maxRight = first[2];
    var minBottom = first[3];
    for (var i = 1; i < items.length; i++) {
        var b = items[i].geometricBounds;
        if (b[0] < minLeft) minLeft = b[0];       // 가장 왼쪽
        if (b[1] > maxTop) maxTop = b[1];         // 가장 위 (Y 큰 값)
        if (b[2] > maxRight) maxRight = b[2];     // 가장 오른쪽
        if (b[3] < minBottom) minBottom = b[3];   // 가장 아래 (Y 작은 값)
    }
    return [minLeft, maxTop, maxRight, minBottom];
}

// ===== 메인 로직 =====

/**
 * 그레이딩 메인 함수 (재설계판).
 *
 * 핵심 원칙:
 *   - 처음부터 CMYK 전용 베이스 문서를 새로 만들어 작업 공간으로 사용한다.
 *   - 몸판(패턴 SVG)을 먼저 배치해서 크기/위치를 확정한 뒤,
 *     요소(디자인 AI의 "요소" 레이어)를 clipboard로 가져와 맞춘다.
 *   - RGB 디자인 AI는 config.allowRgbDesign=false(기본)면 즉시 중단.
 *
 * 흐름 (STEP 0~11):
 *   0. config.json 읽기
 *   1. 디자인 AI를 잠시 열어 메타 정보 추출 (mainColor, baseArea, 요소 copy)
 *   2. 패턴 SVG를 열어 아트보드 크기 측정
 *   3. CMYK 베이스 문서 생성 (아트보드 = SVG 크기)
 *   4. SVG path를 베이스 문서로 임포트 (fill + 패턴선 레이어 분리)
 *   5. SVG 원본 문서 닫기
 *   6. "디자인 요소" 레이어 생성 → paste (클립보드)
 *   7. 면적 비율 스케일링
 *   8. 몸판 중앙 정렬
 *   9. (안전망) 요소 내 잔존 RGB 순회 보정
 *  10. 레이어 z-order 통합 + 저장
 *  11. 정리 + result.json 기록
 */
function main() {
    $.writeln("[grading.jsx] 스크립트 시작 (CMYK 베이스 + 몸판 우선 재작성판)");

    // ===== STEP -1: 대화상자 자동 계속 처리 =====
    // 왜 필요한가: Illustrator는 AI 파일 열 때 폰트 누락/프로파일 불일치/링크 이미지 누락 등
    // 다양한 경고 대화상자를 띄운다. 사용자가 매번 "계속" 버튼을 클릭해야 하면 자동화 의미가 없다.
    // DONTDISPLAYALERTS 설정 시 경고를 기본 동작(계속)으로 자동 처리한다.
    // 단, 치명 오류(파일 손상 등)는 여전히 표시될 수 있으나 이는 정상 동작.
    try {
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
        $.writeln("[grading.jsx] userInteractionLevel=DONTDISPLAYALERTS 적용 (경고 자동 계속)");
    } catch (uiError) {
        // Illustrator 버전 차이로 실패 가능 — 무시하고 진행
        $.writeln("[grading.jsx] userInteractionLevel 설정 실패, 무시: " + uiError);
    }

    // ===== STEP 0: config.json 읽기 =====
    var config = readConfig();
    var resultPath = config.resultJsonPath;
    // allowRgbDesign: true가 아니면 false로 취급 (엄격 모드 기본)
    var allowRgbDesign = (config.allowRgbDesign === true);

    // ===== 디버그 로그 파일 경로 초기화 =====
    // 왜 outputPath 기준인가:
    //   - 사용자가 실제로 받아보는 결과물(.ai)이 outputPath에 저장된다.
    //   - 로그가 결과물 바로 옆에 있어야 "이 파일 어떻게 나왔지?"를 바로 추적 가능.
    //   - resultJsonPath는 내부 메타 경로라 사용자 입장에서는 outputPath가 더 자연스럽다.
    // 폴백 순서: outputPath 폴더 → resultJsonPath 폴더 (둘 다 없으면 로그 스킵)
    // append 모드라 사이즈별 실행이 누적된다 → 사용자가 이 파일 하나만 공유하면 됨.
    try {
        var _logBasePath = null;
        // 1순위: outputPath (결과물 저장 경로)와 같은 폴더
        if (config.outputPath) {
            _logBasePath = config.outputPath;
        } else if (config.resultJsonPath) {
            // 2순위 폴백: resultJsonPath 폴더
            _logBasePath = config.resultJsonPath;
        }
        if (_logBasePath) {
            var _logBaseFile = new File(_logBasePath);
            _logFilePath = _logBaseFile.parent.fsName + "\\grading-log.txt";
            writeLog("=== grading.jsx 시작 ===");
            writeLog("config: designAiPath=" + (config.designAiPath || "(없음)"));
            writeLog("config: designPdfPath=" + (config.designPdfPath || "(없음)"));
            writeLog("config: patternSvgPath=" + (config.patternSvgPath || "(없음)"));
            writeLog("config: outputPath=" + (config.outputPath || "(없음)"));
            writeLog("config: targetSize=" + (config.targetSize || "(미설정)"));
        }
    } catch (eLogInit) {
        // 로그 초기화 실패는 무시 (로그 없이 진행 가능)
    }
    // patternLineColor: "auto" | "white" | "black" | "keep"
    // 왜 기본 "auto"인가: 배경 밝기에 따라 흰/검을 자동 선택해서 패턴선 가시성을 보장.
    // UI 노출 없이 config.json으로만 제어 (사용자 결정 Q1=A).
    var patternLineColorMode = (config && config.patternLineColor) ? config.patternLineColor : "auto";

    // 작업 중 참조할 문서 핸들들 (에러 시 정리를 위해 상위 스코프에 선언)
    var designDoc = null;  // 디자인 AI/PDF (메타 추출 후 바로 close)
    var svgDoc = null;     // 패턴 SVG 원본 (path duplicate 소스, 이후 close)
    var baseDoc = null;    // 새로 만든 CMYK 베이스 문서 (최종 저장 대상)

    try {
        // ===== STEP 1: 디자인 파일 경로 결정 (AI 우선, PDF 폴백) =====
        var designInfo = resolveDesignFile(config);
        var designFilePath = designInfo.path;
        var isAiFile = designInfo.isAi;

        // ===== STEP 2: 디자인 파일 열기 + RGB 엄격 모드 체크 =====
        // 왜 CMYK 플래그 없이 그냥 여나:
        //   - 디자인 AI가 이미 CMYK면 그대로 열린다 (의도한 색 그대로)
        //   - 디자인 AI가 RGB면 isRgbDocument로 감지하고 즉시 중단 가능
        //   - CMYK 플래그를 주면 RGB 원본이 강제로 양자화되어 원본 수치가 소실된다
        var designFile = new File(designFilePath);
        designDoc = app.open(designFile);
        $.writeln("[grading.jsx] 디자인 파일 열림: " + designDoc.name + " (AI: " + isAiFile + ")");

        // RGB 디자인 엄격 차단 (옵션 A)
        if (isRgbDocument(designDoc)) {
            if (!allowRgbDesign) {
                throw new Error("디자인 AI가 RGB 모드입니다. Illustrator에서 '파일 > 문서 색상 모드 > CMYK 색상'으로 변경 후 재저장해주세요. (강제 진행하려면 config.allowRgbDesign=true)");
            }
            $.writeln("[grading.jsx] 경고: 디자인이 RGB 모드이지만 allowRgbDesign=true로 진행합니다 (색상 정확도 낮음)");
        }

        // ===== STEP 2A: "패턴선" 레이어에서 기준 패턴 면적 추출 =====
        // 왜 기준 면적을 여기서 구하나:
        //   - 디자인 AI의 "패턴선" 레이어는 디자이너가 작업한 원본 패턴 크기를 나타낸다.
        //   - 타겟 SVG 면적과 비율을 계산해 요소를 자연스럽게 축소/확대한다.
        //   - designDoc을 닫기 전에 미리 뽑아둬야 한다.
        var baseArea = 0;
        var basePieceCount = 0;
        if (isAiFile) {
            try {
                var patternLineLayer = designDoc.layers.getByName("패턴선");
                var baseResult = calcLayerArea(patternLineLayer);
                baseArea = baseResult.totalArea;
                basePieceCount = baseResult.pieceCount;
                $.writeln("[grading.jsx] 기준 패턴 면적: " + baseArea.toFixed(0) + " pt² (" + basePieceCount + "개 조각)");
                // [DEBUG LOG] 기준 몸판 면적 — 원인 분석 핵심 값
                writeLog("STEP 2A 기준 baseArea=" + baseArea.toFixed(2) + " pt^2, basePieceCount=" + basePieceCount);
            } catch (e) {
                $.writeln("[grading.jsx] 경고: '패턴선' 레이어 면적 계산 실패: " + e.message);
                writeLog("[WARN] STEP 2A 기준 면적 계산 실패: " + e.message);
            }
        }

        // ===== STEP 3: 메인 색상 추출 ("몸판" 레이어) =====
        // 왜 designDoc에서 뽑나: 디자인 파일이 몸판 색상의 원천이기 때문.
        // 단, 아래 STEP 4에서 이 색을 cloneCMYKColor로 CMYK 문서에 다시 할당한다.
        var mainColor = null;
        if (isAiFile) {
            mainColor = extractColorFromBodyLayer(designDoc);
            if (!mainColor) {
                $.writeln("[grading.jsx] '몸판' 레이어 색상 추출 실패 — 전체 문서 폴백");
                mainColor = cloneColor(extractMainColorFromDoc(designDoc));
            }
        } else {
            // PDF 폴백: 면적 기준
            mainColor = cloneColor(extractMainColorFromDoc(designDoc));
        }
        // mainColor는 반드시 CMYK여야 하므로 한 번 더 정규화
        if (mainColor && mainColor.typename !== "CMYKColor") {
            mainColor = cloneColor(mainColor);
        }

        if (mainColor && mainColor.typename === "CMYKColor") {
            $.writeln("[grading.jsx] 메인 색상 (CMYK): C=" + mainColor.cyan.toFixed(1)
                + " M=" + mainColor.magenta.toFixed(1)
                + " Y=" + mainColor.yellow.toFixed(1)
                + " K=" + mainColor.black.toFixed(1));
        } else {
            $.writeln("[grading.jsx] 메인 색상 타입: " + (mainColor ? mainColor.typename : "(null)"));
        }

        // ===== STEP 4: "요소" 레이어 아이템 레퍼런스 수집 (duplicate 모드) =====
        // 버그 B 수정 (2026-04-16): clipboard copy 대신 elemItems 배열로 레퍼런스만 보관한다.
        // 이유:
        //   - 기존 app.copy() 호출은 이후 svgDoc.close() 시점에 AICB clipboard 번역기가
        //     간헐적으로 무효화되어 paste=0(2XS/4XL 재현) 버그를 유발했다.
        //   - Illustrator는 단일 인스턴스 앱이라 이전 실행의 clipboard/문서 상태가 공유된다.
        //   - STEP 7의 path.duplicate(layerFill) 패턴과 동일하게 문서 간 직접 복제로 전환하면
        //     clipboard 의존 자체를 제거할 수 있다 (실전 검증 완료).
        //   - designDoc은 STEP 8의 duplicate 완료 직후까지 살려둬야 원본 참조가 유효하다.
        //   - paste 시점에 붙여넣어진 아이템의 잔존 RGB는 STEP 9 안전망에서 순회 변환.
        //
        // ★ Phase 2 추가: 요소 copy 전에 아래 두 가지를 사전 수집한다.
        //   1) designPieces: "패턴선" 레이어의 각 조각 bbox (X 오름차순)
        //   2) elementOriginalCenters[i] + elementPieceIndex[i]:
        //      "요소" 레이어 i번째 아이템의 원본 중심 + 매핑된 조각 인덱스
        //   → 베이스 문서에서 paste된 요소들을 이 인덱스에 따라 개별 배치할 때 사용.
        var designPieces = [];             // 디자인 AI의 패턴선 조각들 (Phase 2 매핑 소스)
        var elementOriginalCenters = [];   // 각 요소의 스케일 전 원본 중심 {cx, cy}
        var elementPieceIndex = [];        // 각 요소가 매칭된 designPieces 인덱스
        var elementCountAtCopy = 0;        // paste 시점에 수 불일치 감지용
        // 버그 B 수정: clipboard 대신 원본 PageItem 레퍼런스 배열 (STEP 8에서 duplicate 사용)
        var elemItems = [];
        if (isAiFile) {
            var elemLayer;
            try {
                elemLayer = designDoc.layers.getByName("요소");
            } catch (e) {
                throw new Error("AI 파일에 '요소' 레이어가 없습니다. 레이어 이름을 확인해주세요.");
            }

            // --- Phase 2 사전 수집 ①: designPieces (패턴선 레이어 조각 bbox) ---
            try {
                var designPatternLayer = designDoc.layers.getByName("패턴선");
                // minSize 50pt: importSvgPathsToDoc의 기준과 동일 → 동일 조각 집합 기대
                designPieces = extractPatternPieces(designPatternLayer, 50);
                $.writeln("[grading.jsx] [Phase 2] designPieces 수집: " + designPieces.length + "개 (X 오름차순)");
            } catch (ePp) {
                $.writeln("[grading.jsx] [Phase 2] 경고: '패턴선' 레이어 조각 수집 실패 — 전체 중심 폴백 예정 (" + ePp.message + ")");
                designPieces = [];
            }

            $.writeln("[grading.jsx] '요소' 레이어 아이템 수: " + elemLayer.pageItems.length);

            // --- Phase 2 사전 수집 ②: 각 요소의 원본 중심 + 매칭 조각 인덱스 ---
            // 주의: elemLayer.pageItems는 PathItem/GroupItem/TextItem 등 섞여있지만
            //       모두 geometricBounds를 갖는다. 순서는 copy→paste 시 유지된다고 가정.
            for (var emi = 0; emi < elemLayer.pageItems.length; emi++) {
                var emItem = elemLayer.pageItems[emi];
                var emb = emItem.geometricBounds; // [left, top, right, bottom]
                var emCx = (emb[0] + emb[2]) / 2;
                var emCy = (emb[1] + emb[3]) / 2;
                elementOriginalCenters.push({ cx: emCx, cy: emCy });
                // designPieces가 비었으면 매칭 스킵 (-1 저장)
                var bestIdx = (designPieces.length > 0)
                    ? findBestMatchingPiece([emb[0], emb[1], emb[2], emb[3]], designPieces)
                    : -1;
                elementPieceIndex.push(bestIdx);
            }
            elementCountAtCopy = elemLayer.pageItems.length;
            $.writeln("[grading.jsx] [Phase 2] 요소별 매핑 기록: " + elementPieceIndex.length + "개");

            // 버그 B 수정: clipboard copy 대신 elemItems 배열에 레퍼런스만 축적한다.
            //   - for 루프 순서가 pageItems[0..N]과 동일 → elementPieceIndex 매핑 정확히 동일 유지
            //   - app.copy() 호출 제거로 svgDoc.close() 간섭 경로 원천 차단
            for (var ei = 0; ei < elemLayer.pageItems.length; ei++) {
                elemItems.push(elemLayer.pageItems[ei]);
            }
            if (elemItems.length > 0) {
                writeLog("STEP 4 (duplicate 모드): 요소 " + elemItems.length + "개 레퍼런스 보관");
                $.writeln("[grading.jsx] '요소' 레이어 " + elemItems.length + "개 아이템 레퍼런스 보관 (duplicate 모드)");
            } else {
                writeLog("[WARN] STEP 4: 요소 레이어에 pageItems 없음 — 디자인 AI 구조 확인 필요");
                $.writeln("[grading.jsx] 경고: '요소' 레이어에 아이템이 없음");
            }
        } else {
            // PDF 폴백: 전체 아트보드 요소 clipboard 적재 (AI 경로 버그 B와 별개, 기존 유지)
            // 사용자 Q1=A(PDF 제거 예정)이므로 최소 변경 유지
            designDoc.selectObjectsOnActiveArtboard();
            app.executeMenuCommand("copy");
            $.writeln("[grading.jsx] 디자인 전체 요소 clipboard 적재 (PDF 폴백)");
        }
        // 주의: designDoc은 STEP 8의 duplicate 완료 직후까지 살려둔다.
        //       elemItems 배열이 참조하는 PageItem이 유효하려면 원본 문서가 열려 있어야 하기 때문.

        // ===== STEP 5: 패턴 SVG 열기 → 아트보드 크기 측정 → CMYK 베이스 문서 생성 =====
        // 왜 순서가 이러한가:
        //   1) SVG를 열어야 아트보드 크기(pt)를 정확히 알 수 있다.
        //   2) 그 크기로 같은 사이즈의 CMYK 문서를 새로 만든다.
        //   3) SVG의 path를 CMYK 문서로 복제(duplicate)하며 색을 재할당한다.
        var patternFile = new File(config.patternSvgPath);
        if (!patternFile.exists) {
            throw new Error("패턴 SVG를 찾을 수 없습니다: " + config.patternSvgPath);
        }
        // SVG는 원래 색 공간으로 연다 (CMYK 강제 금지 → 양자화 회피)
        svgDoc = app.open(patternFile);
        $.writeln("[grading.jsx] 패턴 SVG 열림: " + svgDoc.name
            + " (colorSpace=" + (svgDoc.documentColorSpace === DocumentColorSpace.CMYK ? "CMYK" : "RGB") + ")");

        var svgAb = svgDoc.artboards[0].artboardRect;
        var svgWidth = svgAb[2] - svgAb[0];
        var svgHeight = svgAb[1] - svgAb[3];
        $.writeln("[grading.jsx] SVG 아트보드: " + svgWidth.toFixed(1) + " x " + svgHeight.toFixed(1) + " pt");

        // CMYK 베이스 문서 생성 (이것이 최종 출력 문서가 된다)
        baseDoc = createCmykBaseDoc(svgWidth, svgHeight);
        app.activeDocument = baseDoc;

        // ===== STEP 6: 베이스 문서에 레이어 3개 생성 =====
        // layers.add()는 최상위에 추가되므로 맨 아래부터 만든다:
        //   아래(배경 fill) → 중간(디자인 요소) → 위(패턴 선)
        var defaultLayer = baseDoc.layers[0];

        var layerFill = baseDoc.layers.add();
        layerFill.name = "배경 fill";

        var layerDesign = baseDoc.layers.add();
        layerDesign.name = "디자인 요소";

        var layerPattern = baseDoc.layers.add();
        layerPattern.name = "패턴 선";

        $.writeln("[grading.jsx] 레이어 생성: 패턴선(위) / 디자인요소(중간) / 배경fill(아래)");

        // ===== STEP 7: SVG path를 CMYK 베이스 문서로 임포트 =====
        // importSvgPathsToDoc 내부에서:
        //   - 50pt 이상: layerFill로 복제 + fill=mainColor + layerPattern로 stroke 복제
        //   - 50pt 미만: layerPattern으로 복제
        //   - RGB 색은 cloneColor로 CMYK 수식 변환
        var importResult = importSvgPathsToDoc(svgDoc, baseDoc, mainColor, layerFill, layerPattern);
        var filledCount = importResult.filledCount;
        var targetArea = importResult.targetArea;
        // Phase 2: 베이스 문서의 몸판 조각 bbox 목록 (X 오름차순) — 개별 정렬 타겟
        var basePieces = importResult.basePieces || [];
        $.writeln("[grading.jsx] 패턴 " + filledCount + "개 조각 임포트 완료");
        $.writeln("[grading.jsx] 타겟 패턴 면적: " + targetArea.toFixed(0) + " pt² (" + filledCount + "개 조각)");
        $.writeln("[grading.jsx] [Phase 2] basePieces 수집: " + basePieces.length + "개 (X 오름차순)");

        if (filledCount === 0) {
            $.writeln("[grading.jsx] 경고: 50pt 이상 조각이 없음 — 패턴 SVG를 확인하세요");
        }

        // SVG 원본 문서 닫기 (path는 이미 베이스 문서로 복제됨)
        try {
            svgDoc.close(SaveOptions.DONOTSAVECHANGES);
            svgDoc = null;
            $.writeln("[grading.jsx] SVG 원본 문서 닫음");
        } catch (eSvg) {
            $.writeln("[grading.jsx] 경고: SVG 문서 닫기 실패 (" + eSvg.message + ")");
        }

        // 베이스 문서의 빈 기본 레이어 제거 (베이스 생성 시 기본 레이어가 자동으로 하나 만들어짐)
        try {
            if (defaultLayer.pageItems.length === 0) {
                defaultLayer.remove();
            }
        } catch (eDef) { /* 무시 */ }

        // 활성 문서를 베이스로 재확인
        app.activeDocument = baseDoc;

        // ===== STEP 8: 요소를 baseDoc의 "디자인 요소" 레이어로 duplicate =====
        // 왜 duplicate 기반으로 바뀌었나 (버그 B 수정 2026-04-16):
        //   - clipboard(copy/paste)는 Illustrator 앱 전역 상태라 svgDoc.close()와 간섭,
        //     2XS/4XL에서 paste=0(요소 0개) 간헐 실패가 발생했다.
        //   - PageItem.duplicate(targetContainer, PLACEATEND)는 clipboard 없이 문서 간 직접 복제.
        //   - STEP 7의 path.duplicate(layerFill)와 동일 패턴이라 실전 검증 완료.
        //
        // 왜 지금 duplicate하나:
        //   - STEP 7에서 몸판(패턴 SVG)이 이미 베이스 문서에 배치돼 있다.
        //   - 그 위에 요소를 올려야 몸판 좌표계를 기준으로 정렬하기 쉽다.
        baseDoc.activeLayer = layerDesign;
        var pastedItems = [];
        // AI 경로: elemItems 배열을 순회하며 각 요소를 layerDesign에 직접 복제
        if (isAiFile && elemItems.length > 0) {
            for (var di = 0; di < elemItems.length; di++) {
                // ElementPlacement.PLACEATEND: layerDesign의 맨 끝(뒤)에 추가 — 순서 보존
                var dup = elemItems[di].duplicate(layerDesign, ElementPlacement.PLACEATEND);
                pastedItems.push(dup);
            }
            writeLog("STEP 8 duplicate 완료: " + pastedItems.length + "개 복제됨");
            $.writeln("[grading.jsx] 디자인 요소를 '디자인 요소' 레이어에 duplicate 완료 ("
                + pastedItems.length + "개)");
        } else if (!isAiFile) {
            // PDF 폴백: 기존 clipboard paste 경로 유지 (AI 경로와 별개)
            app.executeMenuCommand("paste");
            $.writeln("[grading.jsx] PDF 폴백: 디자인 요소 paste 완료");
            // selection이 paste 결과를 반환 — pastedItems 배열로 변환
            if (baseDoc.selection && baseDoc.selection.length > 0) {
                for (var pi = 0; pi < baseDoc.selection.length; pi++) {
                    pastedItems.push(baseDoc.selection[pi]);
                }
            }
        } else {
            // AI 경로인데 elemItems가 비어있는 방어 케이스
            writeLog("[WARN] STEP 8: elemItems 비어있음 — 요소 복제 스킵");
            $.writeln("[grading.jsx] 경고: elemItems 비어있음 — 요소 복제 스킵");
        }
        // [DEBUG LOG] duplicate 직후 검증 — 요소가 실제로 들어왔는지 확인
        try {
            writeLog("STEP 8 paste 직후: baseDoc.pageItems=" + baseDoc.pageItems.length
                + ", pastedItems.length=" + pastedItems.length
                + ", layerDesign.pageItems=" + layerDesign.pageItems.length);
        } catch (ePasteLog) { /* 무시 */ }

        // 이제 designDoc 닫아도 안전 (duplicate 완료 — elemItems 레퍼런스 더 이상 불필요)
        if (designDoc) {
            try {
                designDoc.close(SaveOptions.DONOTSAVECHANGES);
                designDoc = null;
                $.writeln("[grading.jsx] 디자인 문서 닫음");
            } catch (eDesign) {
                $.writeln("[grading.jsx] 경고: 디자인 문서 닫기 실패 (" + eDesign.message + ")");
            }
        }

        // 이후 기존 group/scale/align 로직은 selection 기반이므로, pastedItems를 선택 상태로 만든다.
        baseDoc.selection = null;
        for (var psi = 0; psi < pastedItems.length; psi++) {
            try { pastedItems[psi].selected = true; } catch (eSel) { /* 무시 */ }
        }
        var pastedGroup = null;
        // Phase 2 개별 정렬에 사용할 effective linearScale (스케일 적용 후 값)
        var linearScaleApplied = 1.0;
        if (pastedItems && pastedItems.length > 0) {
            $.writeln("[grading.jsx] 붙여넣은 요소 수: " + pastedItems.length);

            // 스케일/정렬을 위해 그룹화 (1개든 여러 개든 통일되게 처리)
            app.executeMenuCommand("group");
            pastedGroup = baseDoc.selection[0];

            // ===== STEP 9: 면적 비율 스케일링 =====
            // 왜 면적 제곱근인가:
            //   - 면적 비율은 길이의 제곱에 비례하므로, 선형 스케일은 √(면적비).
            //   - 예: 면적비 0.81 → 길이비 0.9 → 가로/세로 각각 90%.
            if (baseArea > 0 && targetArea > 0 && pastedGroup) {
                var areaRatio = targetArea / baseArea;
                var linearScale = Math.sqrt(areaRatio);
                $.writeln("[grading.jsx] 면적 비율: " + areaRatio.toFixed(4)
                    + " (기준:" + baseArea.toFixed(0) + " → 타겟:" + targetArea.toFixed(0) + ")");
                $.writeln("[grading.jsx] 선형 스케일: " + linearScale.toFixed(4)
                    + " (" + (linearScale * 100).toFixed(1) + "%)");
                // [DEBUG LOG] 스케일 계산 핵심 값 — 사이즈별 이상 검증용
                writeLog("STEP 9 스케일: areaRatio=" + areaRatio.toFixed(4)
                    + ", linearScale=" + linearScale.toFixed(4)
                    + " (baseArea=" + baseArea.toFixed(0)
                    + ", targetArea=" + targetArea.toFixed(0) + ")");

                if (Math.abs(linearScale - 1.0) > 0.005) {
                    var scalePct = linearScale * 100;
                    pastedGroup.resize(scalePct, scalePct, true, true, true, true);
                    $.writeln("[grading.jsx] 요소 스케일 적용: " + scalePct.toFixed(1) + "%");
                    linearScaleApplied = linearScale;
                    // [DEBUG LOG] 스케일 적용 후 그룹 bounds
                    try {
                        var _psgb = pastedGroup.geometricBounds;
                        writeLog("STEP 9 스케일 적용 후 pastedGroup bounds=["
                            + _psgb[0].toFixed(1) + "," + _psgb[1].toFixed(1)
                            + "," + _psgb[2].toFixed(1) + "," + _psgb[3].toFixed(1) + "]");
                    } catch (eGbLog) { /* 무시 */ }
                } else {
                    $.writeln("[grading.jsx] 스케일 차이 0.5% 미만 — 원본 크기 유지");
                    linearScaleApplied = 1.0;
                    writeLog("STEP 9 스케일 생략 (차이 0.5% 미만)");
                }
            } else {
                $.writeln("[grading.jsx] 면적 계산 불가(기준/타겟 중 하나 0) — 원본 크기 유지");
                writeLog("[WARN] STEP 9 면적 계산 불가: baseArea=" + baseArea
                    + ", targetArea=" + targetArea
                    + ", pastedGroup=" + (pastedGroup ? "있음" : "null"));
            }

            // ===== STEP 10 (Phase 2): 조각별 개별 정렬 =====
            // 왜 바뀌는가:
            //   - 기존 alignToBodyCenter는 요소 전체 그룹을 한 번에 몸판 중앙으로 이동.
            //   - 결과: 앞판/뒷판/소매 위에 각각 놓여야 할 요소들이 공중에 한 덩어리로 모임.
            //   - 방식 B: 각 요소를 사전 매핑된 조각 중심으로 이동하되,
            //             원본 designPiece 기준 상대 오프셋을 linearScale로 보존.
            //
            // 안전장치 3가지:
            //   (S1) designPieces/basePieces 수 불일치 → 전체 중심 폴백 + 경고
            //   (S2) paste된 요소 수 != 사전 기록한 elementCountAtCopy → 폴백 + 경고
            //   (S3) elementPieceIndex[i]가 -1 또는 basePieces 범위 밖 → 해당 요소만 스킵
            var useFallback = false;
            var fallbackReason = "";

            // (S1) 조각 수 불일치
            if (!isAiFile) {
                useFallback = true;
                fallbackReason = "PDF 폴백 모드: 조각 매핑 미지원";
            } else if (designPieces.length === 0 || basePieces.length === 0) {
                useFallback = true;
                fallbackReason = "designPieces(" + designPieces.length + ") 또는 basePieces(" + basePieces.length + ") 비어있음";
            } else if (designPieces.length !== basePieces.length) {
                useFallback = true;
                fallbackReason = "조각 수 불일치: designPieces=" + designPieces.length + ", basePieces=" + basePieces.length;
            }

            // 그룹을 해제해 개별 요소에 접근 가능하도록 준비 (폴백이 아닐 때만)
            // 주의: pastedGroup.pageItems는 그룹 내부 아이템이지만, 그룹 해제 후 layerDesign에
            //       직접 속하도록 옮겨야 개별 translate가 편하다.
            if (!useFallback) {
                // (S2) paste 수 불일치 검증
                var pastedChildren = pastedGroup.pageItems.length;
                if (pastedChildren !== elementCountAtCopy) {
                    useFallback = true;
                    fallbackReason = "paste 수 불일치: paste 자식=" + pastedChildren + ", copy 당시=" + elementCountAtCopy;
                }
            }

            if (useFallback) {
                // 폴백: 기존 alignToBodyCenter(전체 중심 이동) 사용
                $.writeln("[grading.jsx] [Phase 2] 폴백 사용 — 전체 중심 이동 (" + fallbackReason + ")");
                alignToBodyCenter(pastedGroup, layerFill);
            } else {
                // 정상 경로: 그룹 해제 → 각 요소 개별 translate
                // ① pastedGroup의 자식을 layerDesign으로 역순 move (배열 밀림 방지)
                //    move 후 pastedGroup이 비면 제거 가능.
                var individualItems = [];
                while (pastedGroup.pageItems.length > 0) {
                    // 항상 첫 번째 자식을 layerDesign의 PLACEATEND로 이동
                    var child = pastedGroup.pageItems[0];
                    child.move(layerDesign, ElementPlacement.PLACEATEND);
                    individualItems.push(child);
                }
                // 빈 그룹 제거
                try { pastedGroup.remove(); } catch (eRg) { /* 무시 */ }
                pastedGroup = null;

                $.writeln("[grading.jsx] [Phase 2] 그룹 해제 완료: " + individualItems.length + "개 개별 요소");

                // ② individualItems[i]는 paste 순서대로 보장된다고 가정
                //    → elementPieceIndex[i], elementOriginalCenters[i]와 1:1 매칭
                //
                // ===== D1 모드 (2026-04-16, 버그 C 대응) =====
                // 왜 도입:
                //   - alignElementToPiece는 조각별 이동으로 사이즈 커지면 몸판 벌어짐이
                //     요소 위치에 누적 전가 → 3XL/4XL에서 아트보드 초과(bottom -256~-268pt).
                //   - 대응: (1) 조각별 이동 skip, (2) 요소 전체 중심을 아트보드 중심에 복원,
                //           (3) 요소 전체가 아트보드 초과 시 그룹 중심 기준 추가 scale down (clamp).
                //
                // 롤백: USE_D1_MODE = false 로 바꾸면 기존 alignElementToPiece 경로로 즉시 복귀.
                var USE_D1_MODE = true;

                if (USE_D1_MODE) {
                    // --- D1 Step 1: 요소 전체 합집합 bounds ---
                    var unionBounds = calculateUnionBoundsOfItems(individualItems);
                    var elemLeft = unionBounds[0];
                    var elemTop = unionBounds[1];
                    var elemRight = unionBounds[2];
                    var elemBottom = unionBounds[3];
                    var elemWidth = elemRight - elemLeft;
                    var elemHeight = elemTop - elemBottom;

                    // --- D1 Step 2: 아트보드 bounds ---
                    var abRect = baseDoc.artboards[0].artboardRect; // [left, top, right, bottom]
                    var abLeft = abRect[0];
                    var abTop = abRect[1];
                    var abRight = abRect[2];
                    var abBottom = abRect[3];
                    var abWidth = abRight - abLeft;
                    var abHeight = abTop - abBottom;

                    writeLog("STEP 10 D1 시작: 요소 " + elemWidth.toFixed(1) + "x" + elemHeight.toFixed(1)
                        + ", 아트보드 " + abWidth.toFixed(1) + "x" + abHeight.toFixed(1)
                        + ", individualItems=" + individualItems.length);

                    // --- D1 Step 3: 아트보드 95% 초과 시 추가 scale down (clamp) ---
                    // 왜 95%: 완전 경계 맞춤하면 stroke/outline 겹침 위험 — 5% 여백 둠.
                    // 왜 그룹 중심 기준: 각 요소 간 상대 위치 비율을 그대로 유지해야 디자인 형태가 안 깨짐.
                    var MARGIN_RATIO = 0.95;
                    var maxAllowedWidth = abWidth * MARGIN_RATIO;
                    var maxAllowedHeight = abHeight * MARGIN_RATIO;
                    var widthScale = (elemWidth > maxAllowedWidth) ? (maxAllowedWidth / elemWidth) : 1.0;
                    var heightScale = (elemHeight > maxAllowedHeight) ? (maxAllowedHeight / elemHeight) : 1.0;
                    var clampScale = Math.min(widthScale, heightScale);

                    if (clampScale < 0.999) {
                        var clampPct = clampScale * 100;
                        writeLog("STEP 10 D1 clamp: 요소 " + elemWidth.toFixed(0) + "x" + elemHeight.toFixed(0)
                            + " > 허용 " + maxAllowedWidth.toFixed(0) + "x" + maxAllowedHeight.toFixed(0)
                            + " -> 추가 scale " + clampPct.toFixed(1) + "%");

                        // 그룹 중심 (요소 전체 bbox 중심)
                        var groupCx = (elemLeft + elemRight) / 2;
                        var groupCy = (elemTop + elemBottom) / 2;

                        for (var ci = 0; ci < individualItems.length; ci++) {
                            var d1Item = individualItems[ci];
                            var ib = d1Item.geometricBounds;
                            var icx = (ib[0] + ib[2]) / 2;
                            var icy = (ib[1] + ib[3]) / 2;
                            // 새 중심: 그룹 중심 기준 상대 거리를 clampScale 배로 축소
                            var newCx = groupCx + (icx - groupCx) * clampScale;
                            var newCy = groupCy + (icy - groupCy) * clampScale;
                            // 먼저 이동 (상대 위치 축소)
                            d1Item.translate(newCx - icx, newCy - icy);
                            // 그다음 자기 중심 기준 resize (크기 축소)
                            d1Item.resize(
                                clampPct, clampPct,       // x, y 비율
                                true, true, true, true,   // changePositions, changeFillPatterns, changeFillGradients, changeStrokePattern
                                clampPct,                 // changeLineWidths
                                Transformation.CENTER     // 자기 중심 기준
                            );
                        }
                    } else {
                        writeLog("STEP 10 D1 clamp 생략 (요소가 아트보드 내 fit)");
                    }

                    // --- D1 Step 4: 재계산 후 아트보드 중심으로 translate ---
                    var recBounds = calculateUnionBoundsOfItems(individualItems);
                    var recCx = (recBounds[0] + recBounds[2]) / 2;
                    var recCy = (recBounds[1] + recBounds[3]) / 2;
                    var abCx = (abLeft + abRight) / 2;
                    var abCy = (abTop + abBottom) / 2;
                    var dx = abCx - recCx;
                    var dy = abCy - recCy;

                    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                        for (var ti = 0; ti < individualItems.length; ti++) {
                            individualItems[ti].translate(dx, dy);
                        }
                        writeLog("STEP 10 D1 중심 정렬: dx=" + dx.toFixed(1) + " dy=" + dy.toFixed(1));
                    } else {
                        writeLog("STEP 10 D1 중심 정렬 생략 (오차 1pt 미만)");
                    }

                    // --- D1 Step 5: 최종 bounds 로그 ---
                    var finalBounds = calculateUnionBoundsOfItems(individualItems);
                    writeLog("STEP 10 D1 최종 요소 bounds=["
                        + finalBounds[0].toFixed(1) + "," + finalBounds[1].toFixed(1) + ","
                        + finalBounds[2].toFixed(1) + "," + finalBounds[3].toFixed(1) + "]"
                        + " size=" + (finalBounds[2] - finalBounds[0]).toFixed(1) + "x"
                        + (finalBounds[1] - finalBounds[3]).toFixed(1));

                    $.writeln("[grading.jsx] [Phase 2 / D1] 아트보드 clamp+중심 정렬 완료: "
                        + individualItems.length + "개 요소");
                } else {
                    // ===== 레거시 Phase 2: alignElementToPiece 조각별 정렬 (롤백용 보존) =====
                    var placedCount = 0;
                    var skippedCount = 0;
                    for (var idx = 0; idx < individualItems.length; idx++) {
                        var pieceIdx = elementPieceIndex[idx];
                        // (S3) 인덱스 범위 체크
                        if (pieceIdx < 0 || pieceIdx >= basePieces.length) {
                            skippedCount++;
                            continue;
                        }
                        var origCenter = elementOriginalCenters[idx];
                        if (!origCenter) {
                            skippedCount++;
                            continue;
                        }
                        alignElementToPiece(
                            individualItems[idx],
                            origCenter,
                            designPieces[pieceIdx],
                            basePieces[pieceIdx],
                            linearScaleApplied
                        );
                        placedCount++;
                    }
                    $.writeln("[grading.jsx] [Phase 2] 개별 정렬 완료: 배치=" + placedCount
                        + ", 스킵=" + skippedCount + " / 총 " + individualItems.length);
                    // [DEBUG LOG] 개별 정렬 결과 — S에서 0개, 3XL에서 과대 배치 등 원인 파악
                    writeLog("STEP 10 개별 정렬: 배치=" + placedCount
                        + ", 스킵=" + skippedCount
                        + ", 총=" + individualItems.length
                        + ", linearScaleApplied=" + linearScaleApplied.toFixed(4));
                }
                // 배치된 요소 전체의 bounds 측정 (layerDesign 기준)
                try {
                    var lMin = Infinity, tMax = -Infinity, rMax = -Infinity, bMin = Infinity;
                    var hasAny = false;
                    for (var _dbi = 0; _dbi < layerDesign.pageItems.length; _dbi++) {
                        var _dbGb = layerDesign.pageItems[_dbi].geometricBounds;
                        if (_dbGb[0] < lMin) lMin = _dbGb[0];
                        if (_dbGb[1] > tMax) tMax = _dbGb[1];
                        if (_dbGb[2] > rMax) rMax = _dbGb[2];
                        if (_dbGb[3] < bMin) bMin = _dbGb[3];
                        hasAny = true;
                    }
                    if (hasAny) {
                        writeLog("STEP 10 최종 요소 전체 bounds=["
                            + lMin.toFixed(1) + "," + tMax.toFixed(1)
                            + "," + rMax.toFixed(1) + "," + bMin.toFixed(1) + "]"
                            + " size=" + (rMax - lMin).toFixed(1) + "x" + (tMax - bMin).toFixed(1));
                    } else {
                        writeLog("STEP 10 최종 요소 전체 bounds: 없음 (layerDesign 비어있음)");
                    }
                } catch (eBoundsLog) { /* 무시 */ }
            }
        } else {
            $.writeln("[grading.jsx] 경고: 붙여넣은 요소가 없음 — 디자인 파일 확인 필요");
            // [DEBUG LOG] S 사이즈 증상 — paste 후 선택된 요소 0개
            writeLog("[WARN] STEP 8 붙여넣은 요소 없음: baseDoc.selection="
                + (baseDoc.selection ? baseDoc.selection.length : "null")
                + ", layerDesign.pageItems=" + layerDesign.pageItems.length);
        }

        // 선택 해제
        baseDoc.selection = null;

        // ===== STEP 11-A (9번 작업): RGB 잔존 안전망 (축소판) =====
        // 왜 축소판만 두나:
        //   - STEP 7의 importSvgPathsToDoc에서 path 단위로 이미 CMYK 변환 완료.
        //   - 몸판 쪽 RGB 경로는 없으므로, 안전망은 붙여넣은 요소(디자인)만 순회한다.
        //   - 몸판을 재순회하지 않음 → 원본 CMYK 수치 유지.
        var safetyConverted = 0;
        var designItems = layerDesign.pathItems;
        for (var ci = 0; ci < designItems.length; ci++) {
            var it = designItems[ci];
            // fill이 RGB면 CMYK로 변환
            if (it.filled && it.fillColor && it.fillColor.typename === "RGBColor") {
                it.fillColor = cloneColor(it.fillColor);
                safetyConverted++;
            }
            // stroke가 RGB면 CMYK로 변환
            if (it.stroked && it.strokeColor && it.strokeColor.typename === "RGBColor") {
                it.strokeColor = cloneColor(it.strokeColor);
                safetyConverted++;
            }
        }
        if (safetyConverted > 0) {
            $.writeln("[grading.jsx] 안전망 RGB→CMYK: " + safetyConverted + "개 색 변환");
        } else {
            $.writeln("[grading.jsx] 안전망 RGB→CMYK: 변환 대상 없음 (이미 CMYK)");
        }

        // ===== STEP 11-A+ : 패턴선 자동 색상 전환 (Phase 1: stroke만) =====
        // 왜 여기인가:
        //   - 이 시점에 layerPattern은 아직 독립 레이어로 살아있고, 중첩 구조 그대로.
        //   - STEP 11-B에서 finalLayer로 통합되면 컨테이너 순회 대상이 달라진다.
        //   - 한 블록으로 격리되어 있어 롤백도 이 구간만 지우면 끝.
        //
        // 모드별 동작:
        //   - "keep": 원본 유지 (아무 것도 하지 않음)
        //   - "white": 고정 흰
        //   - "black": 고정 검
        //   - "auto": APCA Lc 대비로 흰/검 자동 선택 (mainColor 없으면 keep 폴백)
        var chosenStrokeColor = null;
        var actuallyApplied = false;
        // APCA 수치 보관용 (로그 출력에만 사용, auto 모드일 때만 채워짐)
        var autoLcWhite = null;
        var autoLcBlack = null;
        if (patternLineColorMode === "white") {
            chosenStrokeColor = new CMYKColor();
            chosenStrokeColor.cyan = 0;
            chosenStrokeColor.magenta = 0;
            chosenStrokeColor.yellow = 0;
            chosenStrokeColor.black = 0;
        } else if (patternLineColorMode === "black") {
            chosenStrokeColor = new CMYKColor();
            chosenStrokeColor.cyan = 0;
            chosenStrokeColor.magenta = 0;
            chosenStrokeColor.yellow = 0;
            chosenStrokeColor.black = 100;
        } else if (patternLineColorMode === "auto") {
            // mainColor가 CMYK면 APCA 판정, 아니면 keep 폴백
            if (mainColor && mainColor.typename === "CMYKColor") {
                chosenStrokeColor = pickPatternStrokeColor(mainColor);
                // 로그용 APCA 수치 재계산 (pickPatternStrokeColor 내부 로직과 동일)
                var lBgForLog = cmykToLinearLuminance(mainColor);
                autoLcWhite = apcaContrastLc(lBgForLog, 1.0);
                autoLcBlack = apcaContrastLc(lBgForLog, 0.0);
            } else {
                chosenStrokeColor = null; // keep 폴백
            }
        }
        // "keep" 또는 auto에서 판정 실패 → chosenStrokeColor는 null → 스킵

        if (chosenStrokeColor) {
            var appliedCount = applyPatternStrokeColorRecursive(layerPattern, chosenStrokeColor);
            actuallyApplied = (appliedCount > 0);
            var colorLabel = (chosenStrokeColor.black >= 100) ? "black(K100)" : "white(0)";
            // auto 모드일 때만 APCA 수치 함께 출력 (소수점 1자리)
            var apcaInfo = "";
            if (autoLcWhite !== null && autoLcBlack !== null) {
                var lcW1 = Math.round(autoLcWhite * 10) / 10;
                var lcB1 = Math.round(autoLcBlack * 10) / 10;
                apcaInfo = " method=APCA lcW=" + lcW1 + " lcB=" + lcB1;
            }
            $.writeln("[PATTERN LINE] mode=" + patternLineColorMode
                + apcaInfo
                + " color=" + colorLabel
                + " applied=" + appliedCount + " path(s)");
        } else {
            $.writeln("[PATTERN LINE] mode=" + patternLineColorMode + " applied=skip (keep original)");
        }

        // ===== STEP 11-B (10번 작업): 레이어 z-order 통합 =====
        // Illustrator stacking 규칙: 컨테이너 배열 앞(index 0) = 위, 끝(PLACEATEND) = 아래.
        // 의도한 z-order: 패턴선(위) > 디자인 요소(중간) > 배경 fill(아래).
        // 따라서 "위에 놓일 것부터" PLACEATEND로 먼저 이동해야 뒤에 옮긴 것이 아래로 쌓인다.
        var finalLayer = baseDoc.layers.add();
        finalLayer.name = "그레이딩 출력";

        // 1) 패턴선을 먼저 이동 → finalLayer 최상단에 자리잡음
        while (layerPattern.pageItems.length > 0) {
            layerPattern.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }
        // 2) 디자인 요소는 그 아래로 쌓임 (중간)
        while (layerDesign.pageItems.length > 0) {
            layerDesign.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }
        // 3) 배경 fill은 최하단
        while (layerFill.pageItems.length > 0) {
            layerFill.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }
        try { layerFill.remove(); } catch (e1) {}
        try { layerDesign.remove(); } catch (e2) {}
        try { layerPattern.remove(); } catch (e3) {}

        $.writeln("[grading.jsx] 레이어 통합 완료: 패턴선(위) > 디자인(중간) > 배경fill(아래)");

        // ===== STEP 11-C: 파일 저장 (EPS 또는 PDF) =====
        var outputFile = new File(config.outputPath);
        if (config.outputFormat === "eps") {
            var epsOpts = createEpsSaveOptions();
            baseDoc.saveAs(outputFile, epsOpts);
            $.writeln("[grading.jsx] EPS 저장 완료: " + config.outputPath);
        } else {
            var pdfOpts = createPdfSaveOptions();
            baseDoc.saveAs(outputFile, pdfOpts);
            $.writeln("[grading.jsx] PDF 저장 완료: " + config.outputPath);
        }

        // ===== STEP 11-D: 정리 + result.json =====
        baseDoc.close(SaveOptions.DONOTSAVECHANGES);
        baseDoc = null;

        var modeMsg = isAiFile ? "AI 레이어(재설계)" : "PDF 폴백";
        var formatMsg = config.outputFormat === "eps" ? "EPS" : "PDF";
        writeSuccessResult(resultPath, config.outputPath,
            "그레이딩 완료 (" + modeMsg + ", " + formatMsg + ") - " + filledCount + "개 조각 + 요소 배치");
        $.writeln("[grading.jsx] 완료! (" + modeMsg + ")");

    } catch (err) {
        $.writeln("[grading.jsx] 오류: " + err.message);
        // [DEBUG LOG] 에러 발생 지점 기록 (스택은 ExtendScript에 없지만 메시지는 유용)
        writeLog("[ERROR] " + err.message);

        // 열린 문서 정리 (역순 close)
        try {
            if (designDoc) designDoc.close(SaveOptions.DONOTSAVECHANGES);
        } catch (eD) { /* 무시 */ }
        try {
            if (svgDoc) svgDoc.close(SaveOptions.DONOTSAVECHANGES);
        } catch (eS) { /* 무시 */ }
        try {
            if (baseDoc) baseDoc.close(SaveOptions.DONOTSAVECHANGES);
        } catch (eB) { /* 무시 */ }

        writeErrorResult(resultPath, err.message);
    }

    // ===== 디버그 로그 파일 저장 (성공/실패 모두) =====
    // 왜 try/finally 대신 여기서 호출하나:
    //   - 기존 try/catch 구조를 건드리지 않고 최소 변경으로 flush 보장.
    //   - 위 catch에서 return/throw가 없으므로 정상 흐름이 여기에 도달.
    writeLog("=== grading.jsx 종료 ===\n");
    flushLog();
}

// ===== 실행 =====
main();
