/**
 * grading.jsx -- Illustrator ExtendScript 그레이딩 스크립트 (패턴 선 복사 + 단색 배경 채우기)
 *
 * 동작 흐름:
 *   1. config.json 읽기 (스크립트와 같은 폴더)
 *   2. 기준 디자인 PDF 열기 → 배경 메인 색상(가장 큰 면적 pathItem의 fillColor) 추출
 *   3. 디자인 닫기 (색상만 추출했으므로)
 *   4. 타겟 사이즈 패턴 SVG 열기 (이것이 "틀"이 됨)
 *   5. 패턴 각 조각(polyline→pathItem)에 추출한 색상으로 fill 적용
 *   6. PDF로 저장
 *   7. result.json 작성 + 문서 닫기
 *
 * 왜 이 방식인가:
 *   - 디자인은 현재 단색 배경이므로, 배경색만 추출해서 패턴 조각에 채우면 충분하다.
 *   - 그라데이션/레이어 구분은 추후 진행한다.
 *   - 클리핑 마스크 방식보다 단순하고 확실하다.
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

// ===== PDF 저장 옵션 =====

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

// ===== config.json 읽기 =====

/**
 * 스크립트와 같은 폴더의 config.json을 읽어서 파싱한다.
 * config 구조: { designPdfPath, patternSvgPath, outputPdfPath, resultJsonPath }
 */
function readConfig() {
    var scriptFile = new File($.fileName);
    var scriptFolder = scriptFile.parent;
    var configPath = scriptFolder.fsName + "\\config.json";

    $.writeln("[grading.jsx] config 경로: " + configPath);

    var configText = readTextFile(configPath);
    var config = jsonParse(configText);

    $.writeln("[grading.jsx] 디자인 PDF: " + config.designPdfPath);
    $.writeln("[grading.jsx] 패턴 SVG: " + config.patternSvgPath);
    $.writeln("[grading.jsx] 출력 경로: " + config.outputPdfPath);

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
 * 알 수 없는 타입은 그대로 반환 (참조 복사 — 같은 문서 내에서만 안전).
 */
function cloneColor(color) {
    // CMYKColor — 인쇄용 표준, 가장 흔한 경우
    if (color.typename === "CMYKColor") {
        return cloneCMYKColor(color);
    }
    // RGBColor — 화면용 디자인에서 올 수 있음
    if (color.typename === "RGBColor") {
        var rgb = new RGBColor();
        rgb.red = color.red;
        rgb.green = color.green;
        rgb.blue = color.blue;
        return rgb;
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
        spot.spot = color.spot;       // 스팟 색상 참조
        spot.tint = color.tint;       // 농도
        return spot;
    }
    // GradientColor — 그라데이션은 추후 처리 예정
    // 현재는 참조 그대로 반환 (단색 배경에서는 발생하지 않을 것)
    $.writeln("[grading.jsx] 경고: 미지원 색상 타입 — " + color.typename);
    return color;
}

/**
 * 그룹 아이템 내부를 재귀 탐색하여 가장 큰 면적의 fill 색상을 찾는다.
 * 왜 재귀 탐색이 필요한가:
 *   - PDF를 Illustrator로 열면 요소들이 그룹으로 중첩될 수 있다.
 *   - doc.pathItems는 최상위 경로만 포함하므로 그룹 내부를 별도로 탐색해야 한다.
 */
function findLargestFillInGroups(container) {
    var largestArea = 0;
    var mainColor = null;

    for (var i = 0; i < container.groupItems.length; i++) {
        var group = container.groupItems[i];

        // 그룹 내 pathItems 순회
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

        // 중첩 그룹도 재귀 탐색
        var nested = findLargestFillInGroups(group);
        if (nested && !mainColor) {
            // 최상위에서 못 찾았을 때만 중첩 결과 사용
            mainColor = nested;
        }
    }

    return mainColor;
}

/**
 * 디자인 문서에서 배경 메인 색상을 추출한다.
 * 방법: 가장 큰 면적(width * height)을 가진 pathItem의 fillColor를 반환한다.
 * 왜 면적 기준인가:
 *   - 배경은 보통 전체를 덮는 가장 큰 사각형이므로 면적이 가장 크다.
 *   - 로고/텍스트 등 작은 요소는 자연스럽게 제외된다.
 */
function extractMainColor(doc) {
    var largestArea = 0;
    var mainColor = null;

    // 모든 최상위 pathItem을 순회하여 가장 큰 면적의 fillColor 찾기
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

    // 최상위에서 못 찾으면 그룹 내부도 탐색 (PDF는 그룹 중첩이 흔함)
    if (!mainColor) {
        $.writeln("[grading.jsx] 최상위 pathItems에서 색상 못 찾음 — 그룹 내부 탐색");
        mainColor = findLargestFillInGroups(doc);
    }

    // 그래도 못 찾으면 기본 CMYK 색상 사용 (안전 폴백)
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

// ===== 메인 로직 =====

/**
 * 그레이딩 메인 함수.
 * 디자인에서 메인 색상을 추출한 뒤, 패턴 조각에 해당 색상을 채운다.
 *
 * 왜 이 방식인가:
 *   - 현재 디자인은 단색 배경이므로 색상 추출 + 채우기만으로 충분하다.
 *   - 클리핑 마스크 방식보다 단순하고, 패턴 형태 그대로 출력된다.
 *   - 그라데이션/다중 레이어는 추후 확장한다.
 */
function main() {
    $.writeln("[grading.jsx] 스크립트 시작 (패턴 선 복사 + 단색 배경 채우기)");

    var config = readConfig();
    var resultPath = config.resultJsonPath;
    var patternDoc = null;
    var designDoc = null;

    try {
        // ===== STEP 1: 기준 디자인에서 메인 색상 추출 =====
        // 디자인 PDF를 열어서 가장 큰 면적의 pathItem 색상을 가져온다.
        var designFile = new File(config.designPdfPath);
        if (!designFile.exists) {
            throw new Error("디자인 PDF를 찾을 수 없습니다: " + config.designPdfPath);
        }

        // PDF 열기 옵션 설정 — 다이얼로그 팝업 방지
        var pdfOpenOpts = new PDFFileOptions();
        pdfOpenOpts.pageToOpen = 1;                         // 첫 페이지만
        pdfOpenOpts.pDFCropToBox = PDFBoxType.PDFARTBOX;    // 아트보드 기준으로 크롭

        // CMYK 색상 공간으로 열기 (디자인이 CMYK일 것이므로)
        designDoc = app.open(designFile, DocumentColorSpace.CMYK, pdfOpenOpts);
        $.writeln("[grading.jsx] 디자인 PDF 열림: " + designDoc.name);

        // 배경 메인 색상 추출
        var rawMainColor = extractMainColor(designDoc);

        // 색상 값을 새 객체로 복제 — 문서 닫은 후에도 사용 가능하도록
        var mainColor = cloneColor(rawMainColor);

        // 추출한 색상 정보 로그
        if (mainColor.typename === "CMYKColor") {
            $.writeln("[grading.jsx] 메인 색상: C=" + mainColor.cyan.toFixed(1)
                + " M=" + mainColor.magenta.toFixed(1)
                + " Y=" + mainColor.yellow.toFixed(1)
                + " K=" + mainColor.black.toFixed(1));
        } else {
            $.writeln("[grading.jsx] 메인 색상 타입: " + mainColor.typename);
        }

        // 디자인 문서 닫기 (색상만 추출했으므로 더 이상 불필요)
        designDoc.close(SaveOptions.DONOTSAVECHANGES);
        designDoc = null;
        $.writeln("[grading.jsx] 디자인 문서 닫음 (색상 추출 완료)");

        // ===== STEP 2: 타겟 패턴 SVG 열기 =====
        // 패턴 SVG가 "틀"이 된다. polyline들이 이미 올바른 좌표에 있다.
        var patternFile = new File(config.patternSvgPath);
        if (!patternFile.exists) {
            throw new Error("패턴 SVG를 찾을 수 없습니다: " + config.patternSvgPath);
        }
        patternDoc = app.open(patternFile);
        $.writeln("[grading.jsx] 패턴 SVG 열림: " + patternDoc.name);

        // 아트보드 크기 확인
        var ab = patternDoc.artboards[0];
        var abRect = ab.artboardRect;  // [left, top, right, bottom] (pt 단위)
        var docWidth = abRect[2] - abRect[0];
        var docHeight = abRect[1] - abRect[3];
        $.writeln("[grading.jsx] 아트보드: " + docWidth.toFixed(1) + " x " + docHeight.toFixed(1) + " pt");

        // ===== STEP 3: 패턴 조각에 색상 채우기 =====
        // SVG를 열면 polyline이 pathItem으로 변환됨
        // 면적이 충분히 큰 경로만 패턴 조각으로 인정 (가이드선/마크 제외)
        var filledCount = 0;
        for (var i = 0; i < patternDoc.pathItems.length; i++) {
            var path = patternDoc.pathItems[i];

            // 가로/세로 모두 50pt 이상인 경로만 패턴 조각으로 인정
            // (50pt ≈ 17.6mm — 가이드선/마크보다 크고, 패턴 조각보다 작은 기준)
            if (Math.abs(path.width) > 50 && Math.abs(path.height) > 50) {
                // 열린 경로면 닫기 — fill은 닫힌 경로에서만 정상 작동
                if (!path.closed) {
                    path.closed = true;
                }

                // 메인 색상으로 채우기
                path.filled = true;
                path.fillColor = mainColor;

                // 선(stroke)은 제거 — 깔끔한 출력을 위해
                path.stroked = false;

                filledCount++;
            }
        }
        $.writeln("[grading.jsx] 패턴 " + filledCount + "개 조각에 색상 채움");

        if (filledCount === 0) {
            $.writeln("[grading.jsx] 경고: 50pt 이상 조각이 없음 — 패턴 SVG를 확인하세요");
        }

        // ===== STEP 4: PDF로 저장 =====
        var outputFile = new File(config.outputPdfPath);
        var pdfOpts = createPdfSaveOptions();
        patternDoc.saveAs(outputFile, pdfOpts);
        $.writeln("[grading.jsx] PDF 저장 완료: " + config.outputPdfPath);

        // ===== STEP 5: 정리 =====
        patternDoc.close(SaveOptions.DONOTSAVECHANGES);
        patternDoc = null;

        // 성공 결과 기록
        writeSuccessResult(resultPath, config.outputPdfPath,
            "그레이딩 완료 - " + filledCount + "개 조각 색상 채움");
        $.writeln("[grading.jsx] 완료!");

    } catch (err) {
        $.writeln("[grading.jsx] 오류: " + err.message);

        // 열린 문서 정리 (에러 시에도 문서를 닫아야 다음 실행에 문제 없음)
        try {
            if (designDoc) designDoc.close(SaveOptions.DONOTSAVECHANGES);
        } catch (e) { /* 무시 */ }
        try {
            if (patternDoc) patternDoc.close(SaveOptions.DONOTSAVECHANGES);
        } catch (e) { /* 무시 */ }

        // result.json에 에러 기록 (Rust 측에서 이 파일을 폴링함)
        writeErrorResult(resultPath, err.message);
    }
}

// ===== 실행 =====
main();
