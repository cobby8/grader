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
                targetArea += Math.abs(path.area);

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

    return { filledCount: filledCount, targetArea: targetArea };
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

    // ===== STEP 0: config.json 읽기 =====
    var config = readConfig();
    var resultPath = config.resultJsonPath;
    // allowRgbDesign: true가 아니면 false로 취급 (엄격 모드 기본)
    var allowRgbDesign = (config.allowRgbDesign === true);

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
            } catch (e) {
                $.writeln("[grading.jsx] 경고: '패턴선' 레이어 면적 계산 실패: " + e.message);
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

        // ===== STEP 4: "요소" 레이어 아이템을 클립보드에 적재 =====
        // 왜 clipboard를 쓰나:
        //   - 아직 베이스 문서가 존재하지 않아서 duplicate(targetDoc) 대상이 없다.
        //   - 그래서 designDoc에서 먼저 clipboard로 담아두고,
        //     나중에 CMYK 베이스 문서에 paste한다.
        //   - paste 시점에 붙여넣어진 아이템의 잔존 RGB는 STEP 9 안전망에서 순회 변환.
        if (isAiFile) {
            var elemLayer;
            try {
                elemLayer = designDoc.layers.getByName("요소");
            } catch (e) {
                throw new Error("AI 파일에 '요소' 레이어가 없습니다. 레이어 이름을 확인해주세요.");
            }

            $.writeln("[grading.jsx] '요소' 레이어 아이템 수: " + elemLayer.pageItems.length);
            designDoc.selection = null;
            for (var ei = 0; ei < elemLayer.pageItems.length; ei++) {
                elemLayer.pageItems[ei].selected = true;
            }
            if (designDoc.selection && designDoc.selection.length > 0) {
                app.executeMenuCommand("copy");
                $.writeln("[grading.jsx] '요소' 레이어 " + designDoc.selection.length + "개 아이템 clipboard 적재");
            } else {
                $.writeln("[grading.jsx] 경고: '요소' 레이어에 선택 가능한 아이템이 없음");
            }
        } else {
            // PDF 폴백: 전체 아트보드 요소
            designDoc.selectObjectsOnActiveArtboard();
            app.executeMenuCommand("copy");
            $.writeln("[grading.jsx] 디자인 전체 요소 clipboard 적재 (PDF 폴백)");
        }
        // 주의: designDoc은 STEP 6까지 살려둔다. clipboard가 유효하려면 원본 문서 존재가 안전하다.

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
        $.writeln("[grading.jsx] 패턴 " + filledCount + "개 조각 임포트 완료");
        $.writeln("[grading.jsx] 타겟 패턴 면적: " + targetArea.toFixed(0) + " pt² (" + filledCount + "개 조각)");

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

        // ===== STEP 8: clipboard → "디자인 요소" 레이어에 paste =====
        // 왜 지금 paste하나:
        //   - STEP 7에서 몸판(패턴 SVG)이 이미 베이스 문서에 배치돼 있다.
        //   - 그 위에 요소를 paste하면 몸판 좌표계를 기준으로 정렬하기 쉽다.
        baseDoc.activeLayer = layerDesign;
        app.executeMenuCommand("paste");
        $.writeln("[grading.jsx] 디자인 요소를 '디자인 요소' 레이어에 붙여넣기 완료");

        // 이제 designDoc 닫아도 안전 (clipboard 사용 완료)
        if (designDoc) {
            try {
                designDoc.close(SaveOptions.DONOTSAVECHANGES);
                designDoc = null;
                $.writeln("[grading.jsx] 디자인 문서 닫음");
            } catch (eDesign) {
                $.writeln("[grading.jsx] 경고: 디자인 문서 닫기 실패 (" + eDesign.message + ")");
            }
        }

        // 붙여넣은 요소 수 확인
        var pastedItems = baseDoc.selection;
        var pastedGroup = null;
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

                if (Math.abs(linearScale - 1.0) > 0.005) {
                    var scalePct = linearScale * 100;
                    pastedGroup.resize(scalePct, scalePct, true, true, true, true);
                    $.writeln("[grading.jsx] 요소 스케일 적용: " + scalePct.toFixed(1) + "%");
                } else {
                    $.writeln("[grading.jsx] 스케일 차이 0.5% 미만 — 원본 크기 유지");
                }
            } else {
                $.writeln("[grading.jsx] 면적 계산 불가(기준/타겟 중 하나 0) — 원본 크기 유지");
            }

            // ===== STEP 10 (8번 작업): 몸판 중앙 정렬 =====
            alignToBodyCenter(pastedGroup, layerFill);
        } else {
            $.writeln("[grading.jsx] 경고: 붙여넣은 요소가 없음 — 디자인 파일 확인 필요");
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

        // ===== STEP 11-B (10번 작업): 레이어 z-order 통합 =====
        // Illustrator stacking 규칙: 컨테이너 배열 앞(index 0) = 위, 끝(PLACEATEND) = 아래.
        // 의도한 z-order: 디자인 요소(위) > 배경 fill(중간) > 패턴선(아래).
        // 따라서 "위에 놓일 것부터" PLACEATEND로 먼저 이동해야 뒤에 옮긴 것이 아래로 쌓인다.
        var finalLayer = baseDoc.layers.add();
        finalLayer.name = "그레이딩 출력";

        // 1) 디자인 요소를 먼저 이동 → finalLayer 최상단에 자리잡음
        while (layerDesign.pageItems.length > 0) {
            layerDesign.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }
        // 2) 배경 fill은 그 아래로 쌓임
        while (layerFill.pageItems.length > 0) {
            layerFill.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }
        // 3) 패턴선은 최하단
        while (layerPattern.pageItems.length > 0) {
            layerPattern.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }
        try { layerFill.remove(); } catch (e1) {}
        try { layerDesign.remove(); } catch (e2) {}
        try { layerPattern.remove(); } catch (e3) {}

        $.writeln("[grading.jsx] 레이어 통합 완료: 디자인(위) > 배경fill > 패턴선(아래)");

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
}

// ===== 실행 =====
main();
