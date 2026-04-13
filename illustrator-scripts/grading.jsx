/**
 * grading.jsx -- Illustrator ExtendScript 그레이딩 스크립트
 *
 * 사용법:
 *   1. Grader 앱이 config.json을 생성한 후 이 스크립트를 실행
 *   2. Illustrator.exe /run "C:\path\to\grading.jsx"
 *   3. 또는 Illustrator > File > Scripts > Other Script... 으로 수동 실행
 *
 * 동작 흐름:
 *   1. config.json 읽기 (스크립트와 같은 폴더)
 *   2. 기준 디자인 PDF 열기
 *   3. 타겟 패턴 SVG 열기
 *   4. 패턴 윤곽선을 디자인 문서에 복사
 *   5. 디자인을 타겟 비율로 리사이즈
 *   6. 클리핑 마스크 적용 (패턴 모양으로 자르기)
 *   7. CMYK PDF로 저장
 *   8. result.json 작성 (완료 마커)
 *   9. 문서 닫기 (저장하지 않음)
 *
 * 주의: ExtendScript는 ES3 기반!
 *   - var만 사용 (let/const 불가)
 *   - arrow function 불가
 *   - JSON.parse/stringify 미지원 -> 수동 구현
 *   - try/catch의 catch에 조건식 불가
 */

// ===== JSON 파서/직렬화 (ES3 호환) =====
// ExtendScript에는 JSON 객체가 없으므로 직접 구현한다.

/**
 * 간단한 JSON 파서.
 * 보안 이슈 없음 (로컬 파일만 읽으므로 eval 사용 가능).
 * eval로 파싱하되, 키워드(true/false/null)가 JS와 동일하므로 그대로 동작한다.
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

// ===== 메인 로직 =====

/**
 * 그레이딩 메인 함수.
 * config.json을 읽고 디자인 PDF를 타겟 패턴 크기로 스케일링한다.
 */
function main() {
    // 1. config.json 경로 결정 (스크립트와 같은 폴더)
    var scriptFile = new File($.fileName);
    var scriptFolder = scriptFile.parent;
    var configPath = scriptFolder.fsName + "\\config.json";

    $.writeln("[grading.jsx] 스크립트 시작");
    $.writeln("[grading.jsx] config 경로: " + configPath);

    // config.json 읽기
    var configText = readTextFile(configPath);
    var config = jsonParse(configText);

    $.writeln("[grading.jsx] 디자인 PDF: " + config.designPdfPath);
    $.writeln("[grading.jsx] 패턴 SVG: " + config.patternSvgPath);
    $.writeln("[grading.jsx] 출력 경로: " + config.outputPdfPath);
    $.writeln("[grading.jsx] 스케일 X: " + config.scaleX + ", Y: " + config.scaleY);

    var resultPath = config.resultJsonPath;
    var designDoc = null;
    var patternDoc = null;

    try {
        // 2. 기준 디자인 PDF 열기
        var designFile = new File(config.designPdfPath);
        if (!designFile.exists) {
            throw new Error("디자인 PDF를 찾을 수 없습니다: " + config.designPdfPath);
        }
        designDoc = app.open(designFile);
        $.writeln("[grading.jsx] 디자인 문서 열림: " + designDoc.name);

        // 원본 크기 기록 (mm 단위, Illustrator 기본 단위가 pt일 수 있으므로 변환)
        var origWidthPt = designDoc.width;    // 포인트 단위
        var origHeightPt = designDoc.height;  // 포인트 단위
        $.writeln("[grading.jsx] 원본 크기: " + origWidthPt + "x" + origHeightPt + " pt");

        // 3. 타겟 패턴 SVG 열기 (클리핑 마스크용)
        var hasPatternSvg = config.patternSvgPath && config.patternSvgPath !== "";
        if (hasPatternSvg) {
            var patternFile = new File(config.patternSvgPath);
            if (patternFile.exists) {
                patternDoc = app.open(patternFile);
                $.writeln("[grading.jsx] 패턴 SVG 열림: " + patternDoc.name);
            } else {
                $.writeln("[grading.jsx] 경고: 패턴 SVG를 찾을 수 없어 클리핑 건너뜀");
                hasPatternSvg = false;
            }
        }

        // 4. 디자인 전체를 타겟 비율로 리사이즈
        // scaleX, scaleY는 0~1 사이 축소 또는 1 이상 확대 비율
        var scaleXPercent = config.scaleX * 100;  // Illustrator는 퍼센트 단위
        var scaleYPercent = config.scaleY * 100;

        // 문서의 모든 아이템을 선택하여 스케일링
        designDoc.selectObjectsOnActiveArtboard();
        var sel = designDoc.selection;
        if (sel && sel.length > 0) {
            // 그룹으로 묶어서 한 번에 스케일링 (변환 원점: 아트보드 중앙)
            for (var i = 0; i < sel.length; i++) {
                // 각 아이템을 개별 스케일링 (원점은 각 아이템의 중심)
                sel[i].resize(
                    scaleXPercent,   // 가로 비율 (%)
                    scaleYPercent,   // 세로 비율 (%)
                    true,            // 패턴 변환
                    true,            // 획(stroke) 변환
                    true             // 효과 변환
                );
            }
            $.writeln("[grading.jsx] 스케일링 완료: " + scaleXPercent + "% x " + scaleYPercent + "%");
        } else {
            $.writeln("[grading.jsx] 경고: 선택된 객체가 없음, 스케일링 건너뜀");
        }

        // 5. 아트보드 크기도 비율에 맞게 조정
        var ab = designDoc.artboards[0];
        var abRect = ab.artboardRect;  // [left, top, right, bottom]
        var newWidth = (abRect[2] - abRect[0]) * config.scaleX;
        var newHeight = (abRect[1] - abRect[3]) * config.scaleY;  // top - bottom (양수)
        // 아트보드를 좌상단 기준으로 리사이즈
        ab.artboardRect = [abRect[0], abRect[1], abRect[0] + newWidth, abRect[1] - newHeight];
        $.writeln("[grading.jsx] 아트보드 조정: " + newWidth + "x" + newHeight + " pt");

        // 6. 패턴 SVG로 클리핑 마스크 적용 (선택 사항)
        if (hasPatternSvg && patternDoc) {
            try {
                // 패턴 문서의 모든 pathItem을 디자인 문서에 복사
                patternDoc.selectObjectsOnActiveArtboard();
                var patternSel = patternDoc.selection;

                if (patternSel && patternSel.length > 0) {
                    // 패턴 아이템들을 클립보드에 복사
                    app.executeMenuCommand("copy");

                    // 디자인 문서를 활성화하고 붙여넣기
                    app.activeDocument = designDoc;
                    app.executeMenuCommand("paste");

                    // 붙여넣은 패턴 아이템으로 클리핑 마스크 생성
                    // 1) 모든 객체 선택
                    designDoc.selectObjectsOnActiveArtboard();

                    // 2) 클리핑 마스크 만들기 (Object > Clipping Mask > Make)
                    app.executeMenuCommand("makeMask");

                    $.writeln("[grading.jsx] 클리핑 마스크 적용 완료");
                } else {
                    $.writeln("[grading.jsx] 패턴에 선택 가능한 객체 없음, 클리핑 건너뜀");
                }
            } catch (clipErr) {
                // 클리핑 실패해도 스케일링된 결과는 유지
                $.writeln("[grading.jsx] 클리핑 마스크 실패 (무시): " + clipErr.message);
            }

            // 패턴 문서 닫기 (저장하지 않음)
            patternDoc.close(SaveOptions.DONOTSAVECHANGES);
            patternDoc = null;
        }

        // 7. CMYK PDF로 저장
        var outputFile = new File(config.outputPdfPath);
        var pdfOpts = createPdfSaveOptions();
        designDoc.saveAs(outputFile, pdfOpts);
        $.writeln("[grading.jsx] PDF 저장 완료: " + config.outputPdfPath);

        // 8. 문서 닫기 (저장하지 않음 — 이미 saveAs로 별도 저장함)
        designDoc.close(SaveOptions.DONOTSAVECHANGES);
        designDoc = null;

        // 9. result.json 작성 (성공)
        writeSuccessResult(
            resultPath,
            config.outputPdfPath,
            "그레이딩 완료 (" + scaleXPercent.toFixed(1) + "% x " + scaleYPercent.toFixed(1) + "%)"
        );
        $.writeln("[grading.jsx] 완료!");

    } catch (err) {
        $.writeln("[grading.jsx] 오류: " + err.message);

        // 열린 문서 정리
        try {
            if (patternDoc) patternDoc.close(SaveOptions.DONOTSAVECHANGES);
        } catch (e) { /* 무시 */ }
        try {
            if (designDoc) designDoc.close(SaveOptions.DONOTSAVECHANGES);
        } catch (e) { /* 무시 */ }

        // result.json에 에러 기록
        writeErrorResult(resultPath, err.message);
    }
}

// ===== 실행 =====
main();
