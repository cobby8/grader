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

// ===== 메인 로직 =====

/**
 * 그레이딩 메인 함수.
 *
 * AI 파일일 때:
 *   - "몸판" 레이어에서 메인 색상 추출
 *   - "요소" 레이어만 선택 복사 (배경 제외!)
 *   - 패턴 문서에 붙여넣기
 *
 * PDF 폴백일 때:
 *   - 가장 큰 면적 pathItem에서 색상 추출
 *   - 전체 요소 복사 → 붙여넣기 (기존 방식)
 */
function main() {
    $.writeln("[grading.jsx] 스크립트 시작 (AI 레이어 기반 그레이딩)");

    var config = readConfig();
    var resultPath = config.resultJsonPath;
    var patternDoc = null;
    var designDoc = null;

    try {
        // ===== STEP 1: 디자인 파일 경로 결정 (AI 우선, PDF 폴백) =====
        var designInfo = resolveDesignFile(config);
        var designFilePath = designInfo.path;
        var isAiFile = designInfo.isAi;

        // ===== STEP 2: 디자인 파일 열기 (CMYK) + 아트보드 크기 저장 =====
        var designFile = new File(designFilePath);
        designDoc = app.open(designFile, DocumentColorSpace.CMYK);
        $.writeln("[grading.jsx] 디자인 파일 열림: " + designDoc.name + " (AI: " + isAiFile + ")");

        // 디자인 아트보드 크기를 저장한다 (나중에 요소 스케일링에 사용)
        // 왜 여기서 저장하나: 디자인 문서를 닫으면 아트보드 정보에 접근할 수 없으므로
        var designAb = designDoc.artboards[0].artboardRect;
        var designAbLeft = designAb[0];    // 좌상단 X
        var designAbTop = designAb[1];     // 좌상단 Y (Illustrator Y축은 아래로 감소)
        var designAbWidth = designAb[2] - designAb[0];   // 아트보드 가로 (pt)
        var designAbHeight = designAb[1] - designAb[3];  // 아트보드 세로 (pt)
        $.writeln("[grading.jsx] 디자인 아트보드: " + designAbWidth.toFixed(1) + " x " + designAbHeight.toFixed(1) + " pt"
            + " (left=" + designAbLeft.toFixed(1) + ", top=" + designAbTop.toFixed(1) + ")");

        // ===== STEP 2A: "패턴선" 레이어에서 기준 패턴 면적 추출 =====
        // 왜 기준 면적이 필요한가:
        //   - AI 디자인 파일의 "패턴선" 레이어는 디자이너가 작업한 원본 패턴 크기를 나타낸다.
        //   - 타겟 SVG 패턴과 면적 비율을 계산해서 요소를 적절히 축소/확대한다.
        //   - 예: 기준 면적 10000, 타겟 면적 8100 → 비율 0.81 → 선형 스케일 0.9 (90%)
        var baseArea = 0;
        var basePieceCount = 0;
        if (isAiFile) {
            try {
                var patternLineLayer = designDoc.layers.getByName("패턴선");
                var baseResult = calcLayerArea(patternLineLayer);
                baseArea = baseResult.totalArea;
                basePieceCount = baseResult.pieceCount;
                $.writeln("[grading.jsx] 기준 패턴 면적: " + baseArea.toFixed(0) + " pt² (" + basePieceCount + "개 조각)");
            } catch (e) {
                $.writeln("[grading.jsx] 경고: '패턴선' 레이어 면적 계산 실패: " + e.message);
            }
        }

        // ===== STEP 3: 메인 색상 추출 =====
        var mainColor = null;

        if (isAiFile) {
            // AI 파일: "몸판" 레이어에서 색상 추출 — 변환 불필요 (이미 CMYK)
            mainColor = extractColorFromBodyLayer(designDoc);

            // "몸판" 레이어에서 못 찾으면 전체 문서 폴백
            if (!mainColor) {
                $.writeln("[grading.jsx] '몸판' 레이어 색상 추출 실패 — 전체 문서 폴백");
                mainColor = cloneColor(extractMainColorFromDoc(designDoc));
            }
        } else {
            // PDF 폴백: 기존 방식 (면적 기준)
            var rawColor = extractMainColorFromDoc(designDoc);
            mainColor = cloneColor(rawColor);
        }

        // 추출한 색상 정보 로그
        if (mainColor.typename === "CMYKColor") {
            $.writeln("[grading.jsx] 메인 색상: C=" + mainColor.cyan.toFixed(1)
                + " M=" + mainColor.magenta.toFixed(1)
                + " Y=" + mainColor.yellow.toFixed(1)
                + " K=" + mainColor.black.toFixed(1));
        } else {
            $.writeln("[grading.jsx] 메인 색상 타입: " + mainColor.typename);
        }

        // ===== STEP 4: "요소" 레이어 복사 (AI) 또는 전체 복사 (PDF) =====
        if (isAiFile) {
            // AI 파일: "요소" 레이어의 아이템만 선택하여 복사
            // 왜 "요소"만 복사하나:
            //   - "몸판" 레이어는 배경색이므로 패턴에 직접 fill로 적용함
            //   - "패턴선" 레이어는 참조용이므로 복사하지 않음
            //   - "요소" 레이어의 스트라이프/로고/텍스트/번호만 필요함
            var elemLayer;
            try {
                elemLayer = designDoc.layers.getByName("요소");
            } catch (e) {
                throw new Error("AI 파일에 '요소' 레이어가 없습니다. 레이어 이름을 확인해주세요.");
            }

            $.writeln("[grading.jsx] '요소' 레이어 아이템 수: " + elemLayer.pageItems.length);

            // 기존 선택 해제
            designDoc.selection = null;

            // "요소" 레이어의 모든 아이템을 선택
            for (var ei = 0; ei < elemLayer.pageItems.length; ei++) {
                elemLayer.pageItems[ei].selected = true;
            }

            // 선택된 아이템이 있을 때만 복사
            if (designDoc.selection && designDoc.selection.length > 0) {
                app.executeMenuCommand("copy");
                $.writeln("[grading.jsx] '요소' 레이어 " + designDoc.selection.length + "개 아이템 복사 완료");
            } else {
                $.writeln("[grading.jsx] 경고: '요소' 레이어에 선택 가능한 아이템이 없음");
            }
        } else {
            // PDF 폴백: 전체 요소 복사 (기존 방식)
            designDoc.selectObjectsOnActiveArtboard();
            app.executeMenuCommand("copy");
            $.writeln("[grading.jsx] 디자인 전체 요소 복사 완료 (PDF 폴백)");
        }

        // 디자인은 아직 닫지 않음! 클립보드 유지를 위해 패턴에 붙여넣기 후 닫음.
        $.writeln("[grading.jsx] 디자인 문서 유지 (클립보드 보존)");

        // ===== STEP 5: 타겟 패턴 SVG 열기 =====
        var patternFile = new File(config.patternSvgPath);
        if (!patternFile.exists) {
            throw new Error("패턴 SVG를 찾을 수 없습니다: " + config.patternSvgPath);
        }
        // CMYK 색상 공간으로 열기 — 인쇄용 색상 보존
        patternDoc = app.open(patternFile, DocumentColorSpace.CMYK);
        $.writeln("[grading.jsx] 패턴 SVG 열림 (CMYK): " + patternDoc.name);

        // 아트보드 크기 확인
        var ab = patternDoc.artboards[0];
        var abRect = ab.artboardRect;
        var docWidth = abRect[2] - abRect[0];
        var docHeight = abRect[1] - abRect[3];
        $.writeln("[grading.jsx] 아트보드: " + docWidth.toFixed(1) + " x " + docHeight.toFixed(1) + " pt");

        // ===== STEP 6: 레이어 생성 (z-order 관리) =====
        // layers.add()는 최상위에 추가되므로 역순으로 생성
        var defaultLayer = patternDoc.layers[0];

        // 배경 fill 레이어 — 가장 아래
        var layerFill = patternDoc.layers.add();
        layerFill.name = "배경 fill";

        // 디자인 요소 레이어 — 중간
        var layerDesign = patternDoc.layers.add();
        layerDesign.name = "디자인 요소";

        // 패턴 선 레이어 — 가장 위 (재단선/너치가 항상 보여야 함)
        var layerPattern = patternDoc.layers.add();
        layerPattern.name = "패턴 선";

        $.writeln("[grading.jsx] 레이어 생성 완료: 패턴선/디자인/배경 (위->아래)");

        // ===== STEP 7: 패턴 조각에 색상 채우기 + 레이어 이동 =====
        // SVG를 열면 polyline이 pathItem으로 변환됨
        // 큰 경로 = 패턴 조각, 작은 경로 = 너치/가이드
        var filledCount = 0;
        var pathCount = defaultLayer.pathItems.length;
        // 타겟 패턴 면적 합산용 — STEP 8에서 면적 비율 스케일링에 사용
        var targetArea = 0;

        // 뒤에서부터 처리 (이동하면 인덱스 변함)
        for (var pi = pathCount - 1; pi >= 0; pi--) {
            var path = defaultLayer.pathItems[pi];

            // 가로/세로 모두 50pt 이상인 경로만 패턴 조각으로 인정
            if (Math.abs(path.width) > 50 && Math.abs(path.height) > 50) {
                // 열린 경로면 닫기 (fill이 제대로 적용되려면 닫힌 경로여야 함)
                if (!path.closed) {
                    path.closed = true;
                }

                // 타겟 패턴 면적 합산 (기준 면적 대비 비율 계산에 사용)
                targetArea += Math.abs(path.area);

                // 복제 → fill 적용 → 배경 레이어로 이동
                var fillCopy = path.duplicate();
                fillCopy.filled = true;
                fillCopy.fillColor = mainColor;
                fillCopy.stroked = false;
                fillCopy.move(layerFill, ElementPlacement.PLACEATBEGINNING);

                // 원본은 stroke만 유지 → 패턴선 레이어로 이동
                path.filled = false;
                path.move(layerPattern, ElementPlacement.PLACEATBEGINNING);

                filledCount++;
            } else {
                // 작은 요소(너치, 가이드 등)도 패턴선 레이어로 이동
                path.move(layerPattern, ElementPlacement.PLACEATBEGINNING);
            }
        }

        // 기본 레이어에 남은 다른 아이템(그룹 등)도 패턴선 레이어로 이동
        while (defaultLayer.pageItems.length > 0) {
            defaultLayer.pageItems[0].move(layerPattern, ElementPlacement.PLACEATBEGINNING);
        }

        $.writeln("[grading.jsx] 패턴 " + filledCount + "개 조각에 색상 채움");
        $.writeln("[grading.jsx] 타겟 패턴 면적: " + targetArea.toFixed(0) + " pt² (" + filledCount + "개 조각)");

        if (filledCount === 0) {
            $.writeln("[grading.jsx] 경고: 50pt 이상 조각이 없음 — 패턴 SVG를 확인하세요");
        }

        // 빈 기본 레이어 제거
        defaultLayer.remove();

        // ===== STEP 8: 디자인 요소를 패턴 문서에 붙여넣기 + 스케일/위치 보정 =====
        // 패턴 문서를 활성화하고 디자인 레이어에 붙여넣기
        app.activeDocument = patternDoc;
        patternDoc.activeLayer = layerDesign;
        app.executeMenuCommand("paste");
        $.writeln("[grading.jsx] 디자인 요소를 '디자인 요소' 레이어에 붙여넣기 완료");

        // 이제 디자인 문서 닫기 (클립보드 사용 완료)
        if (designDoc) {
            designDoc.close(SaveOptions.DONOTSAVECHANGES);
            designDoc = null;
            $.writeln("[grading.jsx] 디자인 문서 닫음");
        }

        // 붙여넣은 요소 정보 로그
        var pastedItems = patternDoc.selection;
        if (pastedItems && pastedItems.length > 0) {
            $.writeln("[grading.jsx] 붙여넣은 요소 수: " + pastedItems.length);

            // ===== 면적 비율 기반 요소 스케일링 =====
            // 왜 면적 비율인가:
            //   - 패턴 사이즈가 달라지면 디자인 요소(로고, 스트라이프 등)도 비례 축소/확대해야 자연스럽다.
            //   - 면적 비율의 제곱근이 선형 스케일 (면적은 길이²에 비례하므로)
            //   - 예: 면적 비율 0.81 → sqrt(0.81) = 0.9 → 가로세로 각각 90%로 축소
            if (baseArea > 0 && targetArea > 0) {
                var areaRatio = targetArea / baseArea;
                // 면적 비율의 제곱근 = 선형 스케일 (가로/세로 동일 비율)
                var linearScale = Math.sqrt(areaRatio);

                $.writeln("[grading.jsx] 면적 비율: " + areaRatio.toFixed(4)
                    + " (기준:" + baseArea.toFixed(0) + " → 타겟:" + targetArea.toFixed(0) + ")");
                $.writeln("[grading.jsx] 선형 스케일: " + linearScale.toFixed(4)
                    + " (" + (linearScale * 100).toFixed(1) + "%)");

                // 스케일 차이가 0.5% 이상일 때만 적용 (거의 같으면 스킵)
                if (Math.abs(linearScale - 1.0) > 0.005) {
                    // 붙여넣은 요소를 그룹화하여 한 번에 스케일링
                    app.executeMenuCommand("group");
                    var pastedGroup = patternDoc.selection[0];

                    if (pastedGroup) {
                        // resize()는 퍼센트 단위 (0.9 → 90 전달)
                        var scalePct = linearScale * 100;
                        // 인자: scaleX%, scaleY%, 변환점선/패턴/획폭/효과도 스케일
                        pastedGroup.resize(scalePct, scalePct, true, true, true, true);
                        $.writeln("[grading.jsx] 요소 스케일 적용: " + scalePct.toFixed(1) + "%");
                    }
                } else {
                    // 스케일 불필요해도 중앙 정렬을 위해 그룹화는 필요
                    app.executeMenuCommand("group");
                    var pastedGroup = patternDoc.selection[0];
                    $.writeln("[grading.jsx] 스케일 차이 0.5% 미만 — 원본 크기 유지");
                }

                // ===== 요소 그룹을 패턴 몸판 중앙으로 이동 =====
                // 왜 중앙 정렬이 필요한가:
                //   - AI에서 복사한 요소는 원본 좌표 그대로 붙여넣기됨
                //   - 타겟 패턴 몸판의 위치/크기가 다르므로 중앙에 맞춰야 자연스럽다
                var pastedGroup = patternDoc.selection[0];
                if (pastedGroup) {
                    // fill 레이어의 전체 bounding box를 계산하여 몸판 중앙을 구한다
                    var fillItems = layerFill.pageItems;
                    var minX = Infinity;
                    var minY = Infinity;  // Illustrator Y축: 위가 큰 값, 아래가 작은 값
                    var maxX = -Infinity;
                    var maxY = -Infinity;
                    for (var fi = 0; fi < fillItems.length; fi++) {
                        var fb = fillItems[fi].geometricBounds; // [left, top, right, bottom]
                        if (fb[0] < minX) minX = fb[0];        // 가장 왼쪽
                        if (fb[1] > maxY) maxY = fb[1];         // 가장 위 (큰 값)
                        if (fb[2] > maxX) maxX = fb[2];         // 가장 오른쪽
                        if (fb[3] < minY) minY = fb[3];         // 가장 아래 (작은 값)
                    }
                    var patternCenterX = (minX + maxX) / 2;
                    var patternCenterY = (minY + maxY) / 2;

                    // 요소 그룹의 현재 중앙 좌표
                    var gb = pastedGroup.geometricBounds; // [left, top, right, bottom]
                    var groupCenterX = (gb[0] + gb[2]) / 2;
                    var groupCenterY = (gb[1] + gb[3]) / 2;

                    // 오프셋만큼 이동하여 몸판 중앙에 맞춘다
                    var offsetX = patternCenterX - groupCenterX;
                    var offsetY = patternCenterY - groupCenterY;
                    pastedGroup.translate(offsetX, offsetY);

                    $.writeln("[grading.jsx] 요소 중앙 정렬: 몸판중앙(" + patternCenterX.toFixed(1) + ", " + patternCenterY.toFixed(1)
                        + ") 이동량(" + offsetX.toFixed(1) + ", " + offsetY.toFixed(1) + ")");
                }
            } else {
                // 면적 계산이 불가능한 경우 (PDF 폴백이거나 패턴선 레이어 없음)
                // 그래도 중앙 정렬은 시도한다
                app.executeMenuCommand("group");
                var pastedGroup = patternDoc.selection[0];
                if (pastedGroup) {
                    var fillItems = layerFill.pageItems;
                    var minX = Infinity;
                    var minY = Infinity;
                    var maxX = -Infinity;
                    var maxY = -Infinity;
                    for (var fi = 0; fi < fillItems.length; fi++) {
                        var fb = fillItems[fi].geometricBounds;
                        if (fb[0] < minX) minX = fb[0];
                        if (fb[1] > maxY) maxY = fb[1];
                        if (fb[2] > maxX) maxX = fb[2];
                        if (fb[3] < minY) minY = fb[3];
                    }
                    var patternCenterX = (minX + maxX) / 2;
                    var patternCenterY = (minY + maxY) / 2;
                    var gb = pastedGroup.geometricBounds;
                    var groupCenterX = (gb[0] + gb[2]) / 2;
                    var groupCenterY = (gb[1] + gb[3]) / 2;
                    var offsetX = patternCenterX - groupCenterX;
                    var offsetY = patternCenterY - groupCenterY;
                    pastedGroup.translate(offsetX, offsetY);
                    $.writeln("[grading.jsx] 요소 중앙 정렬 (면적계산 불가): 이동량(" + offsetX.toFixed(1) + ", " + offsetY.toFixed(1) + ")");
                }
                $.writeln("[grading.jsx] 면적 계산 불가 — 요소 원본 크기 유지, 중앙 정렬만 적용");
            }
        } else {
            $.writeln("[grading.jsx] 경고: 붙여넣은 요소가 없음 — 디자인 파일 확인 필요");
        }

        // 선택 해제
        patternDoc.selection = null;

        // ===== STEP 9A: CMYK 색상 강제 변환 =====
        // doc-color-cmyk 메뉴가 일부 버전에서 안 먹히므로,
        // 모든 pathItem의 fillColor/strokeColor를 직접 CMYK로 변환
        var convertedCount = 0;
        function convertItemToCMYK(item) {
            // fill 색상 변환
            if (item.filled && item.fillColor && item.fillColor.typename === "RGBColor") {
                var rgb = item.fillColor;
                var r = rgb.red / 255;
                var g = rgb.green / 255;
                var b = rgb.blue / 255;
                var k = 1 - Math.max(r, g, b);
                var cmyk = new CMYKColor();
                if (k >= 1) {
                    cmyk.cyan = 0; cmyk.magenta = 0; cmyk.yellow = 0; cmyk.black = 100;
                } else {
                    cmyk.cyan = ((1 - r - k) / (1 - k)) * 100;
                    cmyk.magenta = ((1 - g - k) / (1 - k)) * 100;
                    cmyk.yellow = ((1 - b - k) / (1 - k)) * 100;
                    cmyk.black = k * 100;
                }
                item.fillColor = cmyk;
                convertedCount++;
            }
            // stroke 색상 변환
            if (item.stroked && item.strokeColor && item.strokeColor.typename === "RGBColor") {
                var srgb = item.strokeColor;
                var sr = srgb.red / 255;
                var sg = srgb.green / 255;
                var sb = srgb.blue / 255;
                var sk = 1 - Math.max(sr, sg, sb);
                var scmyk = new CMYKColor();
                if (sk >= 1) {
                    scmyk.cyan = 0; scmyk.magenta = 0; scmyk.yellow = 0; scmyk.black = 100;
                } else {
                    scmyk.cyan = ((1 - sr - sk) / (1 - sk)) * 100;
                    scmyk.magenta = ((1 - sg - sk) / (1 - sk)) * 100;
                    scmyk.yellow = ((1 - sb - sk) / (1 - sk)) * 100;
                    scmyk.black = sk * 100;
                }
                item.strokeColor = scmyk;
                convertedCount++;
            }
        }
        // 모든 레이어의 모든 pathItem 순회
        for (var ci = 0; ci < patternDoc.pathItems.length; ci++) {
            convertItemToCMYK(patternDoc.pathItems[ci]);
        }
        // 문서 색상 모드도 CMYK로 시도
        try { app.executeMenuCommand("doc-color-cmyk"); } catch(e) {}
        $.writeln("[grading.jsx] CMYK 변환: " + convertedCount + "개 색상 변환됨");

        // ===== STEP 9B: 레이어 통합 (올바른 z-order: 배경→디자인→패턴선) =====
        // 새 레이어를 만들고, 순서대로 아이템을 이동
        var finalLayer = patternDoc.layers.add();
        finalLayer.name = "그레이딩 출력";

        // 1) 배경 fill 아이템 먼저 (가장 뒤)
        while (layerFill.pageItems.length > 0) {
            layerFill.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }
        // 2) 디자인 요소 (중간)
        while (layerDesign.pageItems.length > 0) {
            layerDesign.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }
        // 3) 패턴 선 + 너치 (가장 위)
        while (layerPattern.pageItems.length > 0) {
            layerPattern.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }

        // 빈 레이어 제거
        try { layerFill.remove(); } catch(e) {}
        try { layerDesign.remove(); } catch(e) {}
        try { layerPattern.remove(); } catch(e) {}

        $.writeln("[grading.jsx] 레이어 통합 완료: 배경→디자인→패턴선 순서");

        // ===== STEP 9C: 파일 저장 (EPS 또는 PDF, config.outputFormat으로 판별) =====
        var outputFile = new File(config.outputPath);
        if (config.outputFormat === "eps") {
            // EPS 저장 — 승화전사 업체에서 EPS를 요구하는 경우
            var epsOpts = createEpsSaveOptions();
            patternDoc.saveAs(outputFile, epsOpts);
            $.writeln("[grading.jsx] EPS 저장 완료: " + config.outputPath);
        } else {
            // PDF 저장 — 기본 출력 형식
            var pdfOpts = createPdfSaveOptions();
            patternDoc.saveAs(outputFile, pdfOpts);
            $.writeln("[grading.jsx] PDF 저장 완료: " + config.outputPath);
        }

        // ===== STEP 10: 정리 =====
        patternDoc.close(SaveOptions.DONOTSAVECHANGES);
        patternDoc = null;

        // 성공 결과 기록
        var modeMsg = isAiFile ? "AI 레이어 방식" : "PDF 폴백 방식";
        var formatMsg = config.outputFormat === "eps" ? "EPS" : "PDF";
        writeSuccessResult(resultPath, config.outputPath,
            "그레이딩 완료 (" + modeMsg + ", " + formatMsg + ") - " + filledCount + "개 조각 색상 채움 + 디자인 요소 배치");
        $.writeln("[grading.jsx] 완료! (" + modeMsg + ")");

    } catch (err) {
        $.writeln("[grading.jsx] 오류: " + err.message);

        // 열린 문서 정리
        try {
            if (designDoc) designDoc.close(SaveOptions.DONOTSAVECHANGES);
        } catch (e) { /* 무시 */ }
        try {
            if (patternDoc) patternDoc.close(SaveOptions.DONOTSAVECHANGES);
        } catch (e) { /* 무시 */ }

        // result.json에 에러 기록
        writeErrorResult(resultPath, err.message);
    }
}

// ===== 실행 =====
main();
