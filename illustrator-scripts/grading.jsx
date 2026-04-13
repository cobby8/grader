/**
 * grading.jsx -- Illustrator ExtendScript 그레이딩 스크립트 (패턴 기반 채워넣기 방식)
 *
 * 동작 흐름:
 *   1. config.json 읽기 (스크립트와 같은 폴더)
 *   2. 타겟 패턴 SVG 열기 (이것이 "틀"이 됨)
 *   3. 패턴 경로(polyline → pathItem) 수집 + 열린 경로 닫기
 *   4. 디자인 PDF를 Place로 배치 (벡터 데이터 + CMYK 보존)
 *   5. 디자인을 아트보드 크기에 맞게 리사이즈 + 좌상단 정렬
 *   6. 디자인을 뒤로 보내기 (패턴이 앞에 와야 클리핑 마스크 작동)
 *   7. 패턴 경로들을 복합 경로로 합치기
 *   8. 클리핑 마스크 적용 (패턴 모양으로 자르기)
 *   9. CMYK PDF로 저장
 *  10. result.json 작성 + 문서 닫기
 *
 * 핵심 변경점 (이전 버전 대비):
 *   - 이전: 디자인 열기 → 스케일링 → 패턴 복사/붙여넣기 → 클리핑
 *   - 현재: 패턴 SVG 열기 → 디자인 Place → 크기 맞추기 → 복합경로 → 클리핑
 *   - scaleX/scaleY 불필요 — 디자인과 패턴 SVG의 아트보드가 같은 크기(1580x2000mm)
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
 * (scaleX/scaleY는 이제 불필요 — 아트보드 크기 비교로 자동 계산)
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

// ===== 메인 로직 =====

/**
 * 그레이딩 메인 함수.
 * 패턴 SVG를 틀로 사용하여 디자인을 배치하고 클리핑 마스크로 잘라낸다.
 *
 * 왜 이 방식인가:
 *   - 패턴 SVG의 polyline들이 이미 올바른 좌표에 있으므로
 *     패턴을 "틀"로 열고 디자인을 "채워넣는" 방식이 가장 정확하다.
 *   - 디자인과 패턴의 아트보드가 같은 크기이므로 별도 스케일 계산이 불필요하다.
 */
function main() {
    $.writeln("[grading.jsx] 스크립트 시작 (패턴 기반 채워넣기 방식)");

    var config = readConfig();
    var resultPath = config.resultJsonPath;
    var patternDoc = null;

    try {
        // ---- STEP 1: 타겟 패턴 SVG 열기 ----
        // 패턴 SVG가 "틀"이 된다. polyline들이 이미 올바른 좌표에 있다.
        var patternFile = new File(config.patternSvgPath);
        if (!patternFile.exists) {
            throw new Error("패턴 SVG를 찾을 수 없습니다: " + config.patternSvgPath);
        }
        patternDoc = app.open(patternFile);
        $.writeln("[grading.jsx] 패턴 SVG 열림: " + patternDoc.name);

        // 아트보드 크기 확인 (패턴과 디자인이 같은 크기여야 함)
        var ab = patternDoc.artboards[0];
        var abRect = ab.artboardRect;  // [left, top, right, bottom] (pt 단위)
        var docWidth = abRect[2] - abRect[0];    // 아트보드 폭
        var docHeight = abRect[1] - abRect[3];   // 아트보드 높이 (top - bottom)
        $.writeln("[grading.jsx] 아트보드: " + docWidth + " x " + docHeight + " pt");

        // ---- STEP 2: 패턴 경로들 수집 ----
        // SVG를 열면 polyline이 pathItem으로 변환됨
        // 면적이 너무 작은 경로는 가이드선 등이므로 제외
        var patternPaths = [];
        for (var i = 0; i < patternDoc.pathItems.length; i++) {
            var p = patternDoc.pathItems[i];
            // 가로/세로 모두 10pt 이상인 경로만 패턴 조각으로 인정
            if (Math.abs(p.width) > 10 && Math.abs(p.height) > 10) {
                patternPaths.push(p);
                // 열린 경로면 닫기 — 클리핑 마스크는 닫힌 경로만 가능
                if (!p.closed) {
                    p.closed = true;
                }
            }
        }
        $.writeln("[grading.jsx] 패턴 조각 수: " + patternPaths.length);

        if (patternPaths.length === 0) {
            throw new Error("패턴 SVG에 유효한 경로가 없습니다 (10pt 이상 크기 필요)");
        }

        // ---- STEP 3: 디자인 PDF를 Place ----
        // groupItems.createFromFile()은 벡터 데이터 그대로 가져옴 (CMYK 보존)
        // 이것이 app.open()과 복사/붙여넣기보다 안정적인 이유:
        //   - 문서 전환 없이 현재 문서(패턴)에 바로 배치
        //   - 클립보드 의존성 없음
        var designFile = new File(config.designPdfPath);
        if (!designFile.exists) {
            throw new Error("디자인 PDF를 찾을 수 없습니다: " + config.designPdfPath);
        }

        var designGroup = patternDoc.groupItems.createFromFile(designFile);
        $.writeln("[grading.jsx] 디자인 배치 완료: " + designGroup.width + " x " + designGroup.height + " pt");

        // ---- STEP 4: 디자인을 아트보드에 맞게 크기/위치 조정 ----
        // 디자인 PDF와 패턴 SVG의 아트보드가 같은 크기(1580x2000mm)이므로
        // 이론적으로 1:1이지만, PDF→Illustrator 변환 과정에서
        // 미세한 pt 변환 차이가 있을 수 있으므로 비율 계산
        var scaleXPct = (docWidth / designGroup.width) * 100;
        var scaleYPct = (docHeight / designGroup.height) * 100;

        // 0.1% 이상 차이가 있을 때만 리사이즈 (불필요한 변환 방지)
        if (Math.abs(scaleXPct - 100) > 0.1 || Math.abs(scaleYPct - 100) > 0.1) {
            designGroup.resize(
                scaleXPct,   // 가로 비율 (%)
                scaleYPct,   // 세로 비율 (%)
                true,        // 패턴 변환
                true,        // 획(stroke) 변환
                true         // 효과 변환
            );
            $.writeln("[grading.jsx] 디자인 리사이즈: " + scaleXPct.toFixed(1) + "% x " + scaleYPct.toFixed(1) + "%");
        } else {
            $.writeln("[grading.jsx] 디자인 크기 일치 — 리사이즈 불필요");
        }

        // 아트보드 좌상단에 정렬 (패턴 좌표와 정확히 일치시키기 위해)
        designGroup.position = [abRect[0], abRect[1]];
        $.writeln("[grading.jsx] 디자인 위치 정렬: [" + abRect[0] + ", " + abRect[1] + "]");

        // ---- STEP 5: 디자인을 패턴 뒤로 보내기 ----
        // 클리핑 마스크에서 "최상위 객체"가 마스크 경로가 된다.
        // 따라서 디자인을 뒤로 보내고 패턴 경로가 앞에 있어야 한다.
        designGroup.zOrder(ZOrderMethod.SENDTOBACK);
        $.writeln("[grading.jsx] 디자인을 뒤로 보냄 (패턴이 앞으로)");

        // ---- STEP 6: 패턴 경로들을 복합 경로로 합치기 ----
        // 여러 조각(앞판+뒷판+칼라 등)을 하나의 복합 경로(compound path)로 합쳐야
        // 클리핑 마스크가 모든 조각을 한 번에 적용할 수 있다.
        if (patternPaths.length > 1) {
            // 기존 선택 해제
            patternDoc.selection = null;
            // 패턴 경로들만 선택
            for (var j = 0; j < patternPaths.length; j++) {
                patternPaths[j].selected = true;
            }
            // 메뉴 명령으로 복합 경로 생성 (Object > Compound Path > Make)
            app.executeMenuCommand("compoundPath");
            $.writeln("[grading.jsx] 복합 경로 생성 완료 (" + patternPaths.length + "개 조각 합침)");
        } else {
            $.writeln("[grading.jsx] 패턴 조각 1개 — 복합 경로 불필요");
        }

        // ---- STEP 7: 클리핑 마스크 생성 ----
        // 전체 선택 (복합 경로/패턴 + 디자인 그룹)
        patternDoc.selectObjectsOnActiveArtboard();
        // 클리핑 마스크 적용 (Object > Clipping Mask > Make)
        // 최상위 객체(패턴 복합 경로)가 마스크가 되고, 아래 객체(디자인)가 잘린다.
        app.executeMenuCommand("makeMask");
        $.writeln("[grading.jsx] 클리핑 마스크 적용 완료");

        // ---- STEP 8: PDF로 저장 ----
        var outputFile = new File(config.outputPdfPath);
        var pdfOpts = createPdfSaveOptions();
        patternDoc.saveAs(outputFile, pdfOpts);
        $.writeln("[grading.jsx] PDF 저장 완료: " + config.outputPdfPath);

        // ---- STEP 9: 정리 ----
        patternDoc.close(SaveOptions.DONOTSAVECHANGES);
        patternDoc = null;

        // 성공 결과 기록
        writeSuccessResult(resultPath, config.outputPdfPath, "그레이딩 완료 (패턴 기반)");
        $.writeln("[grading.jsx] 완료!");

    } catch (err) {
        $.writeln("[grading.jsx] 오류: " + err.message);

        // 열린 문서 정리 (에러 시에도 문서를 닫아야 다음 실행에 문제 없음)
        try {
            if (patternDoc) patternDoc.close(SaveOptions.DONOTSAVECHANGES);
        } catch (e) { /* 무시 */ }

        // result.json에 에러 기록 (Rust 측에서 이 파일을 폴링함)
        writeErrorResult(resultPath, err.message);
    }
}

// ===== 실행 =====
main();
