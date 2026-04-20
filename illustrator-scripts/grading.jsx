// grading-v2.jsx
// 사용자 초기 7단계 흐름 그대로 재작성 (Beta 재구축, 2026-04-16)
// 참조 커밋: dd51cc5
// Q2=b 몸판 중심 1회 정렬, Q3 duplicate 유지
//
// 7단계 흐름 (사용자 원문):
//   1. 원본 AI 파일 열기 → CMYK와 요소 확인
//   2. 새 파일 생성
//   3. 패턴선 복사 후 패치
//   4. 원본 파일 베인 색상 패턴선 안 채우기
//   5. 원본 파일 요소 분석 → 각 사이즈별 면적비에 맞게 스케일링
//   6. 새 파일의 각 패턴 조각 위에 위치 찾아서 배치
//   7. EPS 저장
//
// ExtendScript ES3 제약:
//   - var만 (let/const 없음)
//   - 화살표 함수 없음
//   - JSON.parse/stringify 없음 → 수동 구현

// ============================================================
// JSON 헬퍼 (ES3)
// ============================================================

// 왜 eval: ExtendScript에 JSON 없음. 로컬 파일만 읽으므로 보안 위험 없음.
function jsonParse(str) {
    return eval("(" + str + ")");
}

function jsonStringify(obj) {
    if (obj === null || obj === undefined) return "null";
    if (typeof obj === "string") {
        return '"' + obj.replace(/\\/g, "\\\\")
                       .replace(/"/g, '\\"')
                       .replace(/\n/g, "\\n")
                       .replace(/\r/g, "\\r")
                       .replace(/\t/g, "\\t") + '"';
    }
    if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
    if (obj instanceof Array) {
        var items = [];
        for (var i = 0; i < obj.length; i++) items.push(jsonStringify(obj[i]));
        return "[" + items.join(",") + "]";
    }
    if (typeof obj === "object") {
        var pairs = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) pairs.push(jsonStringify(k) + ":" + jsonStringify(obj[k]));
        }
        return "{" + pairs.join(",") + "}";
    }
    return "null";
}

// ============================================================
// 파일 I/O
// ============================================================

function readTextFile(filePath) {
    var f = new File(filePath);
    if (!f.exists) throw new Error("파일을 찾을 수 없습니다: " + filePath);
    f.encoding = "UTF-8";
    f.open("r");
    var content = f.read();
    f.close();
    return content;
}

function writeTextFile(filePath, content) {
    var f = new File(filePath);
    f.encoding = "UTF-8";
    f.open("w");
    f.write(content);
    f.close();
}

// ============================================================
// 로그 (파일 출력 + $.writeln 병행)
// ============================================================

// 왜 파일 출력: ExtendScript Toolkit 없으면 $.writeln 결과 안 보임.
// config.outputPath 옆에 grading-debug.log 저장 → 사용자가 노트패드로 확인.
var _logFile = null;
var _logFileInitialized = false;

function initLogFile(outputPath) {
    try {
        // outputPath 부모 폴더 계산
        var parent = outputPath.replace(/[\\\/][^\\\/]+$/, "");
        if (!parent || parent === outputPath) parent = outputPath;
        var logPath = parent + "\\grading-debug.log";
        _logFile = new File(logPath);
        _logFile.encoding = "UTF-8";
        // 매 실행마다 덮어쓰기 (append 아님)
        _logFile.open("w");
        _logFile.write("=== grading-v2 실행 로그 (" + new Date().toString() + ") ===\n");
        _logFile.close();
        _logFileInitialized = true;
    } catch (e) {
        _logFileInitialized = false;
    }
}

function logWrite(msg) {
    // $.writeln도 유지 (ExtendScript Toolkit 연결 시 도움)
    try { $.writeln(msg); } catch (e1) {}
    // 파일 append
    if (_logFileInitialized && _logFile) {
        try {
            _logFile.open("a");
            _logFile.write(msg + "\n");
            _logFile.close();
        } catch (e2) {}
    }
}

// ============================================================
// 결과 기록
// ============================================================

function writeSuccessResult(resultPath, outputPath, message) {
    writeTextFile(resultPath, jsonStringify({
        success: true,
        outputPath: outputPath,
        message: message || "그레이딩 완료"
    }));
}

function writeErrorResult(resultPath, errorMessage) {
    writeTextFile(resultPath, jsonStringify({
        success: false,
        outputPath: "",
        message: errorMessage || "알 수 없는 오류"
    }));
}

// cm → pt 변환 (1cm = 28.3465pt, Illustrator/PostScript 표준)
var CM_TO_PT = 28.3465;

// ============================================================
// 색상 유틸
// ============================================================

// 왜 복제: fillColor는 참조일 수 있어, 원본 문서 닫히면 무효화. 값만 복사해 안전 확보.
function cloneCMYK(color) {
    var c = new CMYKColor();
    c.cyan = color.cyan;
    c.magenta = color.magenta;
    c.yellow = color.yellow;
    c.black = color.black;
    return c;
}

// RGB → CMYK 수식 변환. 다른 타입은 CMYK로 변환해 반환.
function toCMYK(color) {
    if (!color) return null;
    if (color.typename === "CMYKColor") return cloneCMYK(color);

    if (color.typename === "RGBColor") {
        var r = color.red / 255;
        var g = color.green / 255;
        var b = color.blue / 255;
        var k = 1 - Math.max(r, Math.max(g, b));
        var out = new CMYKColor();
        if (k >= 1) {
            out.cyan = 0; out.magenta = 0; out.yellow = 0; out.black = 100;
        } else {
            out.cyan = ((1 - r - k) / (1 - k)) * 100;
            out.magenta = ((1 - g - k) / (1 - k)) * 100;
            out.yellow = ((1 - b - k) / (1 - k)) * 100;
            out.black = k * 100;
        }
        return out;
    }

    if (color.typename === "GrayColor") {
        var g2 = new GrayColor();
        g2.gray = color.gray;
        return g2;
    }

    // 미지원 타입은 기본 색상 반환
    var fallback = new CMYKColor();
    fallback.cyan = 0; fallback.magenta = 0; fallback.yellow = 0; fallback.black = 100;
    return fallback;
}

// ============================================================
// EPS 저장 옵션
// ============================================================

function createEpsOptions() {
    var opts = new EPSSaveOptions();
    opts.compatibility = Compatibility.ILLUSTRATOR16;  // CS6 호환
    opts.preview = EPSPreview.COLORTIFF;                // 범용 미리보기
    opts.embedLinkedFiles = true;                       // 단독 파일로 전달 가능
    opts.cmykPostScript = true;                         // CMYK PostScript
    opts.postScript = EPSPostScriptLevelEnum.LEVEL2;    // Level 2 호환성
    return opts;
}

// ============================================================
// 몸판 색상 추출 (디자인 AI의 "몸판" 레이어)
// ============================================================

// 왜 "몸판" 레이어: AI 파일은 레이어 분리 명확. 첫 filled 조각의 색 = 배경 메인 색.
function extractBodyColor(designDoc) {
    var bodyLayer;
    try {
        bodyLayer = designDoc.layers.getByName("몸판");
    } catch (e) {
        logWrite("[grading-v2] '몸판' 레이어 없음");
        return null;
    }

    // pathItems에서 첫 filled 우선
    for (var i = 0; i < bodyLayer.pathItems.length; i++) {
        var p = bodyLayer.pathItems[i];
        if (p.filled && p.fillColor && p.fillColor.typename !== "NoColor") {
            logWrite("[grading-v2] 몸판 색 발견 (pathItems[" + i + "])");
            return toCMYK(p.fillColor);
        }
    }

    // pageItems fallback (그룹 안에 있을 수 있음)
    for (var j = 0; j < bodyLayer.pageItems.length; j++) {
        var it = bodyLayer.pageItems[j];
        if (it.typename === "PathItem" && it.filled && it.fillColor) {
            return toCMYK(it.fillColor);
        }
        if (it.typename === "GroupItem") {
            for (var gi = 0; gi < it.pathItems.length; gi++) {
                var gp = it.pathItems[gi];
                if (gp.filled && gp.fillColor && gp.fillColor.typename !== "NoColor") {
                    logWrite("[grading-v2] 몸판 색 발견 (그룹 내부)");
                    return toCMYK(gp.fillColor);
                }
            }
        }
    }

    logWrite("[grading-v2] 몸판에서 채워진 path 못 찾음");
    return null;
}

// ============================================================
// 몸판 개별 색상 추출 (양면 유니폼 대응)
// ============================================================

// 왜 필요: 양면 유니폼은 표면=흰색, 이면=남색처럼 각 몸판 조각이 다른 색.
//          extractBodyColor는 첫 path 색만 반환 → 모든 조각을 같은 색으로 채워 안 보임.
//          이 함수는 각 조각(pathItem)마다 개별 색상+중심좌표를 반환한다.
// 반환: [{cx, cy, color: CMYKColor}, ...] (x중심 오름차순 정렬)
//   단면: [{cx,cy,color:파랑}, {cx,cy,color:파랑}] (2개, 동일 색)
//   양면: [{cx,cy,color:흰색}, {cx,cy,color:남색}, ...] (4개, 교차 색)
function extractBodyColors(designDoc) {
    var colors = [];
    try {
        var bodyLayer = designDoc.layers.getByName("몸판");
        // 직속 pathItems 탐색
        for (var i = 0; i < bodyLayer.pathItems.length; i++) {
            var p = bodyLayer.pathItems[i];
            // 50pt 이상 + filled 있는 path만 (색상 없는 유령 path 제외)
            if (Math.abs(p.width) > 50 && Math.abs(p.height) > 50
                && p.filled && p.fillColor && p.fillColor.typename !== "NoColor") {
                var gb = p.geometricBounds;
                var cx = (gb[0] + gb[2]) / 2;
                var cy = (gb[1] + gb[3]) / 2;
                var color = null;
                if (p.filled && p.fillColor && p.fillColor.typename !== "NoColor") {
                    color = toCMYK(p.fillColor);
                }
                colors.push({ cx: cx, cy: cy, color: color });
            }
        }
        // GroupItem 내부도 탐색 (양면에서 일부가 그룹일 때)
        for (var gi = 0; gi < bodyLayer.groupItems.length; gi++) {
            var grp = bodyLayer.groupItems[gi];
            for (var gpi = 0; gpi < grp.pathItems.length; gpi++) {
                var gp = grp.pathItems[gpi];
                if (Math.abs(gp.width) > 50 && Math.abs(gp.height) > 50
                    && gp.filled && gp.fillColor && gp.fillColor.typename !== "NoColor") {
                    var ggb = gp.geometricBounds;
                    var gcx = (ggb[0] + ggb[2]) / 2;
                    var gcy = (ggb[1] + ggb[3]) / 2;
                    var gcolor = null;
                    if (gp.filled && gp.fillColor && gp.fillColor.typename !== "NoColor") {
                        gcolor = toCMYK(gp.fillColor);
                    }
                    colors.push({ cx: gcx, cy: gcy, color: gcolor });
                }
            }
        }
        // x+y 2D 정렬 (classifyBodyPieces와 동일 순서)
        // x 차이 10pt 이상이면 x 기준, 같은 열이면 y 내림차순 (위쪽=큰y 먼저)
        colors.sort(function(a, b) {
            if (Math.abs(a.cx - b.cx) > 10) return a.cx - b.cx;
            return b.cy - a.cy;
        });
    } catch (e) {
        logWrite("[grading-v2] extractBodyColors 실패: " + e.message);
    }
    return colors;
}

// ============================================================
// 면적 계산
// ============================================================

// 50pt 이상인 closed path만 면적 합산 (너치/가이드 제외).
// path.area는 반시계면 음수 → 절대값.
function calcLayerArea(layer) {
    var total = 0;
    var count = 0;
    // 직속 pathItems
    for (var i = 0; i < layer.pathItems.length; i++) {
        var p = layer.pathItems[i];
        if (Math.abs(p.width) > 50 && Math.abs(p.height) > 50) {
            if (!p.closed) p.closed = true;
            total += Math.abs(p.area);
            count++;
        }
    }
    // GroupItem 내부 pathItems (재귀 1단계)
    // 왜: ungroup이 패턴선 레이어에는 적용 안 될 수 있어서 방어적 처리
    for (var gi = 0; gi < layer.groupItems.length; gi++) {
        var grp = layer.groupItems[gi];
        for (var gpi = 0; gpi < grp.pathItems.length; gpi++) {
            var gp = grp.pathItems[gpi];
            if (Math.abs(gp.width) > 50 && Math.abs(gp.height) > 50) {
                if (!gp.closed) gp.closed = true;
                total += Math.abs(gp.area);
                count++;
            }
        }
    }
    return { area: total, count: count };
}

// ============================================================
// CMYK 베이스 문서 생성
// ============================================================

// 왜 새 문서를 만드나: SVG를 app.open하면 RGB 경로를 타서 색이 양자화됨.
// 처음부터 CMYK 전용 문서를 만들고 path만 duplicate로 옮기면 색은 우리가 계산한 CMYK만 사용.
function createCmykDoc(widthPt, heightPt) {
    var preset = new DocumentPreset();
    preset.colorMode = DocumentColorSpace.CMYK;
    preset.width = widthPt;
    preset.height = heightPt;
    preset.units = RulerUnits.Millimeters;
    preset.title = "grading-v2-base";
    var doc = app.documents.addDocument("Print", preset);
    // artboardRect = [left, top, right, bottom] (Y축 위가 큰 값)
    doc.artboards[0].artboardRect = [0, heightPt, widthPt, 0];
    return doc;
}

// ============================================================
// 패턴 SVG path 임포트 (STEP 4~5 통합)
// ============================================================

// Q3 duplicate 패턴 유지 (버그 B 재발 방지).
// 규칙:
//   - 50pt 이상 path = 몸판 조각
//       - 원본이 이미 filled면 "베인 색상 안 채우기" → 원본 fill 유지한 채로 fillLayer에 복제
//       - fill 없으면 mainColor로 채움
//     + 원본 stroke는 patternLayer에 별도 복제 (선만, fill 제거)
//   - 50pt 미만 path = 너치/가이드 → patternLayer로만 복제
//   - 그룹 아이템 → patternLayer로 복제
// 반환: { filledCount, targetArea }
function importPatternPaths(svgDoc, baseDoc, mainColor, fillLayer, patternLayer) {
    var filledCount = 0;
    var targetArea = 0;

    for (var li = 0; li < svgDoc.layers.length; li++) {
        var src = svgDoc.layers[li];

        // [진단] 레이어 전체 통계: 어떤 종류의 아이템이 몇 개 있는지 파악
        logWrite("[진단] SVG 레이어[" + li + "] 이름=" + src.name
            + " pathItems=" + src.pathItems.length
            + " compoundPathItems=" + src.compoundPathItems.length
            + " groupItems=" + src.groupItems.length
            + " pageItems=" + src.pageItems.length);

        // [진단] 각 pageItem 타입 스캔 (PathItem/CompoundPathItem/GroupItem 구분용)
        for (var di = 0; di < src.pageItems.length; di++) {
            var it = src.pageItems[di];
            var w = 0, h = 0;
            try { w = it.width; h = it.height; } catch (eWH) {}
            var fl = false, cl = false;
            try { fl = it.filled; } catch (eF) {}
            try { cl = it.closed; } catch (eC) {}
            logWrite("[진단]   [" + di + "] typename=" + it.typename
                + " w=" + w.toFixed(1) + " h=" + h.toFixed(1)
                + " filled=" + fl + " closed=" + cl);
        }

        // 역순: duplicate/move가 인덱스 변경해도 안전
        var pathN = src.pathItems.length;
        for (var pi = pathN - 1; pi >= 0; pi--) {
            var path = src.pathItems[pi];

            // [진단] 각 path의 크기/채움여부/50pt 통과 여부
            logWrite("[진단]   path[" + pi + "] w=" + Math.abs(path.width).toFixed(1)
                + " h=" + Math.abs(path.height).toFixed(1)
                + " filled=" + path.filled
                + " 50pt통과=" + (Math.abs(path.width) > 50 && Math.abs(path.height) > 50));

            if (Math.abs(path.width) > 50 && Math.abs(path.height) > 50) {
                if (!path.closed) path.closed = true;
                targetArea += Math.abs(path.area);

                // 1) fill용 복제 - 몸판은 항상 mainColor(디자인 AI 몸판 색)로 통일
                // 왜 통일: SVG export 시 사이즈별로 fillColor가 들쭉날쭉(흰색으로 찍히기도 함)이라
                //          원본 색을 따라가면 4XL 같은 사이즈에서 색 누락 발생.
                //          단일 mainColor로 고정하면 모든 사이즈에서 일관된 결과.
                var fillCopy = path.duplicate(fillLayer, ElementPlacement.PLACEATEND);
                fillCopy.filled = true;
                fillCopy.fillColor = cloneCMYK(mainColor);
                fillCopy.stroked = false;

                // 2) stroke용 복제 (패턴 선)
                var lineCopy = path.duplicate(patternLayer, ElementPlacement.PLACEATEND);
                lineCopy.filled = false;
                if (lineCopy.stroked && lineCopy.strokeColor) {
                    lineCopy.strokeColor = toCMYK(lineCopy.strokeColor);
                }

                filledCount++;
            } else {
                // 작은 조각 → 패턴선 레이어로만
                var small = path.duplicate(patternLayer, ElementPlacement.PLACEATEND);
                if (small.filled && small.fillColor) {
                    small.fillColor = toCMYK(small.fillColor);
                }
                if (small.stroked && small.strokeColor) {
                    small.strokeColor = toCMYK(small.strokeColor);
                }
            }
        }

        // 그룹 아이템도 패턴선 레이어로 복제
        var groupN = src.groupItems.length;
        for (var gi = groupN - 1; gi >= 0; gi--) {
            src.groupItems[gi].duplicate(patternLayer, ElementPlacement.PLACEATEND);
        }
    }

    // [진단] 함수 종료 직전 최종 결과 (몸판 색상 채움 count + 누적 면적)
    logWrite("[진단] importPatternPaths 결과: filledCount=" + filledCount
        + " targetArea=" + targetArea.toFixed(1));

    return { filledCount: filledCount, targetArea: targetArea };
}

// ============================================================
// 요소 배치 (B안: 디자인 AI 상대 위치 보존)
// ============================================================

// 왜 상대 위치 보존: 디자인 AI에서 요소가 몸판의 어느 부위(가슴/배꼽 등)에 있었는지를
// 상대 벡터로 측정해두고, SVG 몸판 중심에 linearScale만큼 확대한 벡터를 더해 최종 위치를
// 만든다. 디자인 AI와 SVG 둘 다 "몸판 전체 bbox"를 기준점으로 쓰므로 띠 편향이 상쇄됨.

// 여러 pageItem의 합집합 bbox 중심. 빈 배열/null이면 null 반환.
function getItemsCenter(items) {
    if (!items || items.length === 0) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < items.length; i++) {
        var b = items[i].geometricBounds; // [L, T, R, B] (Y위가 큼)
        if (b[0] < minX) minX = b[0];
        if (b[1] > maxY) maxY = b[1];
        if (b[2] > maxX) maxX = b[2];
        if (b[3] < minY) minY = b[3];
    }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

// 레이어 전체 pageItems 합집합 중심
function getLayerCenter(layer) {
    if (!layer) return null;
    return getItemsCenter(layer.pageItems);
}

// ============================================================
// B-2안: 몸판 조각별 개별 요소 배치
// ============================================================

// 왜 band/bodies 분리: 디자인 AI "몸판" 레이어에는 몸판 본체 조각(body) 외에도
// 소매단/밑단 같은 띠(band)가 함께 들어있을 수 있다. 띠는 중심이 치우쳐 있어
// 요소 소속 판정의 기준으로 쓰면 왜곡이 생긴다. 높이 < 500pt 조각은 띠로 분류해 제외하고,
// 남은 큰 조각만 x중심 오름차순으로 정렬해 idx를 부여한다.
// 이렇게 하면 디자인 AI와 SVG 양쪽에서 "좌→우 순서"가 레이어 내 path 순서와 무관하게
// 고정되므로 designBodies[i] ↔ svgBodies[i] 인덱스 매칭이 안정적이다.
var BODY_BAND_HEIGHT_THRESHOLD = 500; // 높이 < 500pt 는 band(띠)로 분류

// 몸판 레이어의 pathItems를 band/bodies로 분류 + x중심 오름차순 정렬 + idx 부여
function classifyBodyPieces(layer) {
    var result = { bands: [], bodies: [], source: "", pieceCount: 0 };
    if (!layer) return result;

    for (var i = 0; i < layer.pathItems.length; i++) {
        var p = layer.pathItems[i];
        // geometricBounds = [L, T, R, B] (일러스트 좌표: Y 위가 큼)
        var b = p.geometricBounds;
        var w = Math.abs(b[2] - b[0]);
        var h = Math.abs(b[1] - b[3]);
        var cx = (b[0] + b[2]) / 2;
        var cy = (b[1] + b[3]) / 2;
        var areaSize = w * h;

        // 왜 pathRef 추가: B-3안에서 SVG band를 실제로 translate하려면 원본 PathItem 참조가 필요.
        //                  디자인 AI에서는 pathRef를 사용하지 않고 cx/cy만 쓰므로 무해.
        var piece = { cx: cx, cy: cy, bbox: b, areaSize: areaSize, pathRef: p };

        if (h < BODY_BAND_HEIGHT_THRESHOLD) {
            // 띠(band): 낮고 긴 조각
            result.bands.push(piece);
        } else {
            // body: 본체 조각 후보
            result.bodies.push(piece);
        }
    }

    // 왜 2D 정렬: 양면 유니폼처럼 같은 x에 위/아래 body가 있을 때
    //             x만으로 정렬하면 순서가 불안정. x+y로 결정적 순서 보장.
    //             10pt 임계값: 같은 열(column)의 미세 좌표 차이 무시.
    result.bodies.sort(function(a, b) {
        if (Math.abs(a.cx - b.cx) > 10) return a.cx - b.cx;
        return b.cy - a.cy;  // x 비슷하면 y 내림차순 (위=큰y 먼저)
    });
    // 왜 bands도 동일 정렬: design bands[i] ↔ svg bands[i] idx 1:1 대응.
    result.bands.sort(function(a, b) {
        if (Math.abs(a.cx - b.cx) > 10) return a.cx - b.cx;
        return b.cy - a.cy;
    });

    // idx 부여 (0..N-1)
    for (var j = 0; j < result.bodies.length; j++) {
        result.bodies[j].idx = j;
    }
    // bands에도 동일하게 idx 부여 (정렬 후 좌→우 순서)
    for (var k = 0; k < result.bands.length; k++) {
        result.bands[k].idx = k;
    }

    result.pieceCount = result.bodies.length;
    return result;
}

// 요소 1개의 소속 body 조각 인덱스 판별 (유클리드 거리 최단)
// 반환: bodies의 idx (0..N-1) 또는 -1 (bodies 비었을 때 = fallback 트리거)
function assignElementToPiece(elemItem, bodies) {
    if (!bodies || bodies.length === 0) return -1;

    var elemCenter = getItemsCenter([elemItem]);
    if (!elemCenter) return -1;

    var bestIdx = -1;
    var bestDist = -1;
    for (var i = 0; i < bodies.length; i++) {
        var dx = elemCenter.cx - bodies[i].cx;
        var dy = elemCenter.cy - bodies[i].cy;
        // 왜 Math.sqrt: Math.hypot 은 ES3에 없음
        var dist = Math.sqrt(dx * dx + dy * dy);
        // 동률 시 더 작은 idx 우선 (결정적 동작) → 부등호 strict
        if (bestIdx === -1 || dist < bestDist) {
            bestIdx = bodies[i].idx; // 정렬 후 부여된 idx 그대로 사용
            bestDist = dist;
        }
    }
    return bestIdx;
}

// 요소별 메타(pieceType, pieceIdx, relVec)에 따라 각 요소를 SVG body/band 기준 위치로 개별 translate
// pastedItems[i] 와 elemMeta[i] 는 인덱스 1:1 대응
// svgPieces: { bodies: [...], bands: [...] } — body와 band 모두 참조 가능
function placeElementGroupPerPiece(pastedItems, elemMeta, svgPieces, fallbackCenter, linearScale, bandPositions) {
    if (!pastedItems || pastedItems.length === 0) return;
    var scale = (typeof linearScale === "number" && linearScale > 0) ? linearScale : 1.0;
    // svgPieces에서 bodies/bands 꺼내기 (하위호환: 배열이 직접 들어오면 bodies로 간주)
    var svgBodies = (svgPieces && svgPieces.bodies) ? svgPieces.bodies : (svgPieces || []);
    var svgBands = (svgPieces && svgPieces.bands) ? svgPieces.bands : [];

    for (var i = 0; i < pastedItems.length; i++) {
        var item = pastedItems[i];
        if (!item) continue;

        var meta = (elemMeta && elemMeta[i]) ? elemMeta[i] : null;
        var pieceType = (meta && meta.pieceType) ? meta.pieceType : "body";
        var pieceIdx = meta ? meta.pieceIdx : -1;
        var relVec = (meta && meta.relVec) ? meta.relVec : { dx: 0, dy: 0 };

        // 왜 분기: pieceType에 따라 body 또는 band 배열에서 기준 조각을 선택
        var baseCenter = null;
        var mode = "";
        if (pieceType === "band" && pieceIdx >= 0 && pieceIdx < svgBands.length) {
            // band 소속 요소 → svgBands 기준
            baseCenter = svgBands[pieceIdx];
            mode = "band";
        } else if (pieceIdx >= 0 && pieceIdx < svgBodies.length) {
            // body 소속 요소 → svgBodies 기준
            baseCenter = svgBodies[pieceIdx];
            mode = "piece";
        } else {
            baseCenter = fallbackCenter;
            mode = "fallback";
        }

        if (!baseCenter) {
            logWrite("[진단] 요소[" + i + "] 배치 생략: baseCenter 없음 (type=" + pieceType + " pieceIdx=" + pieceIdx + ")");
            continue;
        }

        // X축: 중심 기준 (기존 유지)
        var targetCx = baseCenter.cx + relVec.dx * scale;

        var gb = item.geometricBounds;
        var curCx = (gb[0] + gb[2]) / 2;

        if (mode === "band") {
            // band 기준: 상대좌표(relVec.dy) 복원 + bandPositions에서 좌표 직접 읽기
            // 왜 bandPositions: geometricBounds는 translate 후 캐시되어 ~17pt 오차 발생.
            //   placeBandsPerPiece가 계산한 정확한 이동 후 좌표를 사용한다.
            // 왜 relVec.dy 복원: 사이즈별로 band 내 요소의 상대 위치가 보존되어야 한다.
            if (bandPositions && pieceIdx < bandPositions.length && bandPositions[pieceIdx]) {
                var bandPos = bandPositions[pieceIdx];
                var svgBandBottom = bandPos.bottom;  // 이동 후 실제 하단 (캐시 문제 없음)
                var svgBandCx = bandPos.cx;          // 이동 후 실제 중심

                var targetCxBd = svgBandCx + relVec.dx * scale;   // X: 상대 오프셋
                var targetBottomBd = svgBandBottom + relVec.dy * scale; // Y: 상대 오프셋 복원

                var curCxBd = (gb[0] + gb[2]) / 2;
                var curBottomBd = gb[3];
                item.translate(targetCxBd - curCxBd, targetBottomBd - curBottomBd);
            } else {
                // bandPositions 없는 fallback: 기존 geometricBounds 방식 (안전장치)
                var currentBandBounds = svgBands[pieceIdx].pathRef.geometricBounds;
                var svgBandBottom = currentBandBounds[3];
                var svgBandCx = (currentBandBounds[0] + currentBandBounds[2]) / 2;
                var targetCxBd = svgBandCx + relVec.dx * scale;
                var targetBottomBd = svgBandBottom + relVec.dy * scale;
                var curCxBd = (gb[0] + gb[2]) / 2;
                var curBottomBd = gb[3];
                item.translate(targetCxBd - curCxBd, targetBottomBd - curBottomBd);
            }

            logWrite("[진단] 요소[" + i + "] 배치(band,상대좌표): pieceIdx=" + pieceIdx
                + " bandBottom=" + svgBandBottom.toFixed(1)
                + " relVec.dy=" + relVec.dy.toFixed(1)
                + " scale=" + scale.toFixed(4)
                + " 타겟Bottom=" + targetBottomBd.toFixed(1));
        } else if (mode === "piece") {
            // Y축: 하단 기준 (body 하단 + relVec.dy * scale = 요소 하단 타겟)
            var svgBodyBottom = svgBodies[pieceIdx].bbox[3]; // SVG body 하단
            var targetBottom = svgBodyBottom + relVec.dy * scale;
            var curBottom = gb[3]; // 현재 요소 하단
            item.translate(targetCx - curCx, targetBottom - curBottom);

            logWrite("[진단] 요소[" + i + "] 배치(piece,하단기준): pieceIdx=" + pieceIdx
                + " bodyBottom=" + svgBodyBottom.toFixed(1)
                + " relVec=(" + relVec.dx.toFixed(1) + "," + relVec.dy.toFixed(1) + ")"
                + " scale=" + scale.toFixed(4)
                + " 타겟Bottom=" + targetBottom.toFixed(1));
        } else {
            // fallback: 중심 기준 유지 (기존 동작)
            var targetCy = baseCenter.cy + relVec.dy * scale;
            var curCy = (gb[1] + gb[3]) / 2;
            item.translate(targetCx - curCx, targetCy - curCy);

            logWrite("[진단] 요소[" + i + "] 배치(fallback): pieceIdx=" + pieceIdx
                + " center=(" + baseCenter.cx.toFixed(1) + "," + baseCenter.cy.toFixed(1) + ")"
                + " relVec=(" + relVec.dx.toFixed(1) + "," + relVec.dy.toFixed(1) + ")"
                + " scale=" + scale.toFixed(4)
                + " 타겟=(" + targetCx.toFixed(1) + "," + targetCy.toFixed(1) + ")");
        }
    }
}

// SVG bands[i]를 대응 svgBody + scale된 relVec 위치로 개별 translate
// bandMeta[i] 와 svgBands[i] 는 인덱스 1:1 대응 (둘 다 x중심 오름차순 정렬)
// 왜 별도 함수: band는 그룹화/스케일 단계를 거치지 않고 fillLayer에 이미 존재하는
//              pathRef를 그대로 translate하므로 placeElementGroupPerPiece와 API가 다르다.
function placeBandsPerPiece(svgBands, bandMeta, svgBodies, fallbackCenter, linearScale) {
    // 이동 후 각 band의 실제 좌표를 반환 (geometricBounds 캐시 문제 회피용)
    var bandPositions = [];
    if (!svgBands || svgBands.length === 0) return bandPositions;
    var scale = (typeof linearScale === "number" && linearScale > 0) ? linearScale : 1.0;
    // 왜 matchCount: design bands 와 svg bands 개수가 다를 수 있어 안전하게 min까지만 매칭.
    var matchCount = Math.min(svgBands.length, bandMeta ? bandMeta.length : 0);

    for (var i = 0; i < svgBands.length; i++) {
        var svgBand = svgBands[i];
        if (!svgBand || !svgBand.pathRef) continue;

        // 메타 범위 초과 → 이 band는 디자인 AI에 대응이 없음 (그대로 두고 경고)
        var meta = (i < matchCount) ? bandMeta[i] : null;
        if (!meta) {
            logWrite("[진단] SVG band[" + i + "] 메타 없음 - 이동 생략 (원본 좌표 유지)");
            continue;
        }

        var pieceIdx = meta.pieceIdx;
        var relVec = (meta.relVec) ? meta.relVec : { dx: 0, dy: 0 };

        // 왜 분기: svgBodies 범위 내 idx면 조각 기준 배치, 아니면 fallbackCenter 사용
        var baseCenter = null;
        var mode = "";
        if (pieceIdx >= 0 && svgBodies && pieceIdx < svgBodies.length) {
            baseCenter = svgBodies[pieceIdx];
            mode = "piece";
        } else {
            baseCenter = fallbackCenter; // bodies.length===0 케이스
            mode = "fallback";
        }
        if (!baseCenter) {
            logWrite("[진단] SVG band[" + i + "] baseCenter 없음 - 생략");
            continue;
        }

        // X축: 중심 기준 (기존 유지)
        var targetCx = baseCenter.cx + relVec.dx * scale;

        // 왜 geometricBounds 재조회: 스케일/변형 이후의 현재 좌표를 반영해야
        //                            올바른 이동 벡터가 계산된다.
        var gb = svgBand.pathRef.geometricBounds;
        var curCx = (gb[0] + gb[2]) / 2;

        if (mode === "piece" && svgBodies && pieceIdx >= 0 && pieceIdx < svgBodies.length) {
            // Y축: body 상단 기준 (band는 body 위에 위치하므로)
            var svgBodyTop = svgBodies[pieceIdx].bbox[1]; // SVG body 상단 (bbox[1] = top)
            var targetBottom = svgBodyTop + relVec.dy * scale;
            var curBottom = gb[3]; // 현재 band 하단
            svgBand.pathRef.translate(targetCx - curCx, targetBottom - curBottom);

            // 이동 후 실제 좌표 저장 (geometricBounds 캐시 회피)
            bandPositions[i] = { cx: targetCx, bottom: targetBottom };

            logWrite("[진단] SVG band[" + i + "] 이동(piece,상단기준): pieceIdx=" + pieceIdx
                + " bodyTop=" + svgBodyTop.toFixed(1)
                + " relVec=(" + relVec.dx.toFixed(1) + "," + relVec.dy.toFixed(1) + ")"
                + " scale=" + scale.toFixed(4)
                + " 타겟Bottom=" + targetBottom.toFixed(1));
        } else {
            // fallback: 중심 기준 유지 (기존 동작)
            var targetCy = baseCenter.cy + relVec.dy * scale;
            var curCy = (gb[1] + gb[3]) / 2;
            svgBand.pathRef.translate(targetCx - curCx, targetCy - curCy);

            // fallback도 이동 후 좌표 저장
            var movedBottom = gb[3] + (targetCy - curCy);
            bandPositions[i] = { cx: targetCx, bottom: movedBottom };

            logWrite("[진단] SVG band[" + i + "] 이동(fallback): pieceIdx=" + pieceIdx
                + " center=(" + baseCenter.cx.toFixed(1) + "," + baseCenter.cy.toFixed(1) + ")"
                + " relVec=(" + relVec.dx.toFixed(1) + "," + relVec.dy.toFixed(1) + ")"
                + " scale=" + scale.toFixed(4)
                + " 타겟=(" + targetCx.toFixed(1) + "," + targetCy.toFixed(1) + ")");
        }
    }
    return bandPositions;
}

// ============================================================
// config 읽기
// ============================================================

function readConfig() {
    var scriptFile = new File($.fileName);
    var folder = scriptFile.parent;
    var configPath = folder.fsName + "\\config.json";
    logWrite("[grading-v2] config: " + configPath);

    var config = jsonParse(readTextFile(configPath));

    // 필수 필드 체크
    if (!config.designAiPath) throw new Error("config.designAiPath 필요");
    if (!config.patternSvgPath) throw new Error("config.patternSvgPath 필요");
    if (!config.outputPath) throw new Error("config.outputPath 필요");
    if (!config.resultJsonPath) throw new Error("config.resultJsonPath 필요");

    logWrite("[grading-v2] 디자인 AI: " + config.designAiPath);
    logWrite("[grading-v2] 패턴 SVG: " + config.patternSvgPath);
    logWrite("[grading-v2] 출력: " + config.outputPath);

    // 로그 파일 초기화 (outputPath 부모 폴더에 grading-debug.log)
    initLogFile(config.outputPath);

    return config;
}

// ============================================================
// 메인 (7단계 흐름)
// ============================================================

function main() {
    logWrite("[grading-v2] 시작 (사용자 초기 7단계 흐름)");

    // 상위 스코프 문서 핸들 (catch에서 정리용)
    var designDoc = null;
    var svgDoc = null;
    var baseDoc = null;

    try {
        // B-3안: band 메타는 디자인 AI 측정 블록에서 채워지고, STEP 7에서 참조됨.
        //        hasElements=false 또는 디자인 bands 없음 → 빈 배열 유지 → STEP 7에서 자연스럽게 스킵.
        var bandMeta = [];

        // ===== STEP 0: config 읽기 =====
        var config = readConfig();
        var resultPath = config.resultJsonPath;

        // ===== STEP 1: 원본 AI 파일 열기 + CMYK/레이어 확인 =====
        var designFile = new File(config.designAiPath);
        if (!designFile.exists) throw new Error("디자인 AI 파일 없음: " + config.designAiPath);

        designDoc = app.open(designFile);
        logWrite("[grading-v2] STEP 1: 디자인 열림 - " + designDoc.name);

        // CMYK 체크 (경고만, 계속 진행)
        if (designDoc.documentColorSpace !== DocumentColorSpace.CMYK) {
            logWrite("[grading-v2] 경고: 디자인이 CMYK 모드 아님");
        }

        // 레이어 존재 확인
        var hasBody = false;
        var hasPatternLine = false;
        var hasElements = false;
        for (var li = 0; li < designDoc.layers.length; li++) {
            var ln = designDoc.layers[li].name;
            if (ln === "몸판") hasBody = true;
            if (ln === "패턴선") hasPatternLine = true;
            if (ln === "요소") hasElements = true;
        }
        if (!hasBody) logWrite("[grading-v2] 경고: '몸판' 레이어 없음");
        if (!hasPatternLine) logWrite("[grading-v2] 경고: '패턴선' 레이어 없음");
        if (!hasElements) logWrite("[grading-v2] 경고: '요소' 레이어 없음");

        // 몸판 색상 추출
        var mainColor = extractBodyColor(designDoc);
        if (!mainColor) {
            // 폴백: 검정
            mainColor = new CMYKColor();
            mainColor.cyan = 0; mainColor.magenta = 0; mainColor.yellow = 0; mainColor.black = 100;
            logWrite("[grading-v2] 경고: 몸판 색 추출 실패, 기본 검정 사용");
        } else {
            logWrite("[grading-v2] 몸판 색 CMYK: C" + mainColor.cyan.toFixed(1)
                + " M" + mainColor.magenta.toFixed(1)
                + " Y" + mainColor.yellow.toFixed(1)
                + " K" + mainColor.black.toFixed(1));
        }

        // body별 개별 색상 추출 (양면 유니폼: 각 몸판 조각의 색이 다름)
        var bodyColors = extractBodyColors(designDoc);
        logWrite("[grading-v2] body별 색상: " + bodyColors.length + "개");
        for (var bci = 0; bci < bodyColors.length; bci++) {
            var bc = bodyColors[bci];
            if (bc.color) {
                logWrite("[진단] bodyColor[" + bci + "] cx=" + bc.cx.toFixed(1)
                    + " CMYK: C" + bc.color.cyan.toFixed(1)
                    + " M" + bc.color.magenta.toFixed(1)
                    + " Y" + bc.color.yellow.toFixed(1)
                    + " K" + bc.color.black.toFixed(1));
            } else {
                logWrite("[진단] bodyColor[" + bci + "] cx=" + bc.cx.toFixed(1) + " 색상 없음");
            }
        }

        // ===== STEP 2: 기준 면적 계산 (baseArea) =====
        // 왜 패턴선 레이어: 디자이너가 작업한 원본 패턴 크기. 타겟 SVG와 비율 계산용.
        var baseArea = 0;
        if (hasPatternLine) {
            try {
                var patternLineLayer = designDoc.layers.getByName("패턴선");
                var baseResult = calcLayerArea(patternLineLayer);
                baseArea = baseResult.area;
                logWrite("[grading-v2] STEP 2: 기준 면적=" + baseArea.toFixed(0)
                    + "pt² (" + baseResult.count + "개 조각)");
            } catch (e) {
                logWrite("[grading-v2] 기준 면적 계산 실패: " + e.message);
            }
        }

        // "요소" 레이어 아이템 레퍼런스 미리 수집 (duplicate용)
        // 왜 미리: STEP 6에서 designDoc이 아직 열려있을 때 duplicate 소스로 쓰기 위함.
        var elemItems = [];
        if (hasElements) {
            var elemLayer = designDoc.layers.getByName("요소");
            for (var ei = 0; ei < elemLayer.pageItems.length; ei++) {
                elemItems.push(elemLayer.pageItems[ei]);
            }
            logWrite("[grading-v2] 요소 레퍼런스 수집: " + elemItems.length + "개");
        }

        // B-2안: 몸판 조각 분류 + 요소별 소속/상대벡터 계산
        // 왜 지금: designDoc이 아직 열려있어야 geometricBounds 접근 가능.
        // 각 요소마다 "소속 body 조각"을 판별하고, 그 조각 중심을 기준으로 개별 상대벡터를 측정.
        // SVG 쪽에서 동일하게 조각 분류 후 각 요소를 자기 조각 기준으로 배치한다.
        var designPieces = null;
        var elemMeta = []; // [{ pieceType, pieceIdx, relVec }, ...] 인덱스 = elemItems와 1:1
        var designFallbackCenter = null; // bodies.length===0 또는 매칭 실패 시 폴백 (B안 동작)

        // 디자인 AI 몸판 레이어 GroupItem 해제
        // 왜: 양면 유니폼 등에서 몸판 4개 중 일부가 그룹 안에 있으면
        //      classifyBodyPieces가 2개만 인식
        if (hasBody) {
            var bodyLayer = designDoc.layers.getByName("몸판");
            app.activeDocument = designDoc;
            for (var ubgi = 0; ubgi < 3; ubgi++) {
                if (bodyLayer.groupItems.length === 0) break;
                // 레이어 내 아이템만 선택하여 ungroup
                designDoc.selection = null;
                for (var sli = 0; sli < bodyLayer.pageItems.length; sli++) {
                    bodyLayer.pageItems[sli].selected = true;
                }
                app.executeMenuCommand("ungroup");
            }
            designDoc.selection = null;
            logWrite("[grading-v2] 디자인AI 몸판 ungroup: " + bodyLayer.pathItems.length + "개 path");

            // 유령 path 제거 (filled=false인 대형 path)
            // 왜: 양면 유니폼에서 패턴선만 있는 path가 몸판 레이어에 섞여 있으면
            //      classifyBodyPieces가 5개로 인식 → SVG 4개와 불일치 → 매칭 깨짐
            // 안전: designDoc은 SaveOptions.DONOTSAVECHANGES로 닫히므로 원본 무영향
            var removedCount = 0;
            for (var rpi = bodyLayer.pathItems.length - 1; rpi >= 0; rpi--) {
                var rp = bodyLayer.pathItems[rpi];
                if (Math.abs(rp.width) > 50 && Math.abs(rp.height) > 50) {
                    if (!rp.filled || !rp.fillColor || rp.fillColor.typename === "NoColor") {
                        rp.remove();
                        removedCount++;
                    }
                }
            }
            if (removedCount > 0) {
                logWrite("[grading-v2] 디자인AI 몸판 유령 path 제거: " + removedCount + "개 (filled 없는 대형 path)");
            }
            logWrite("[grading-v2] 디자인AI 몸판 최종: " + bodyLayer.pathItems.length + "개 path");
        }

        if (hasBody && hasElements) {
            var designBodyLayer = designDoc.layers.getByName("몸판");
            designPieces = classifyBodyPieces(designBodyLayer);
            designPieces.source = "design";
            designFallbackCenter = getLayerCenter(designBodyLayer);

            // 좌→우 cx 리스트 로그 (사용자 육안 검증용)
            var designCxList = "";
            for (var di = 0; di < designPieces.bodies.length; di++) {
                designCxList += (di > 0 ? ", " : "") + "body" + di + "=" + designPieces.bodies[di].cx.toFixed(1);
            }
            logWrite("[진단] 디자인AI 몸판 분류: bands=" + designPieces.bands.length
                + "개 bodies=" + designPieces.bodies.length + "개 (좌→우: " + designCxList + ")");

            for (var mi = 0; mi < elemItems.length; mi++) {
                var elem = elemItems[mi];
                var elemCenter = getItemsCenter([elem]);

                // bodies + bands 모두 후보로 유클리드 거리 계산하여 가장 가까운 조각에 소속
                // 왜: 사이즈택 등이 band에 더 가까울 수 있는데 body만 보면 잘못 소속됨
                var bestDist = -1;
                var bestType = "body";
                var bestIdx = -1;
                var bestCenter = null;

                if (elemCenter) {
                    // bodies 후보
                    for (var bi2 = 0; bi2 < designPieces.bodies.length; bi2++) {
                        var bodyCandidate = designPieces.bodies[bi2];
                        var dxB = elemCenter.cx - bodyCandidate.cx;
                        var dyB = elemCenter.cy - bodyCandidate.cy;
                        var distB = Math.sqrt(dxB * dxB + dyB * dyB);
                        if (bestDist < 0 || distB < bestDist) {
                            bestDist = distB;
                            bestType = "body";
                            bestIdx = bodyCandidate.idx;
                            bestCenter = bodyCandidate;
                        }
                    }

                    // bands 후보
                    for (var bdi = 0; bdi < designPieces.bands.length; bdi++) {
                        var bandCandidate = designPieces.bands[bdi];
                        var dxBd = elemCenter.cx - bandCandidate.cx;
                        var dyBd = elemCenter.cy - bandCandidate.cy;
                        var distBd = Math.sqrt(dxBd * dxBd + dyBd * dyBd);
                        if (bestDist < 0 || distBd < bestDist) {
                            bestDist = distBd;
                            bestType = "band";
                            bestIdx = bdi; // band는 순서 인덱스 그대로
                            bestCenter = bandCandidate;
                        }
                    }
                }

                // 소속 조각 중심 (없으면 fallback 중심)
                var pieceCenter = bestCenter ? bestCenter : designFallbackCenter;

                var rv = { dx: 0, dy: 0 };
                if (elemCenter && pieceCenter) {
                    // X축: 중심 기준 유지
                    rv.dx = elemCenter.cx - pieceCenter.cx;
                    // Y축: 하단 기준으로 변경 (요소 하단 - 조각 하단)
                    var elemBottom = elem.geometricBounds[3];
                    var pieceBottom = (bestCenter && bestCenter.bbox)
                                     ? bestCenter.bbox[3]
                                     : pieceCenter.cy; // fallback: 중심 기준 유지
                    rv.dy = elemBottom - pieceBottom;
                }
                elemMeta.push({ pieceType: bestType, pieceIdx: bestIdx, relVec: rv });

                logWrite("[진단] 요소[" + mi + "] 소속: type=" + bestType + " idx=" + bestIdx
                    + " (거리=" + (bestDist >= 0 ? bestDist.toFixed(1) : "?") + ")"
                    + " relVec=(" + rv.dx.toFixed(1) + "," + rv.dy.toFixed(1) + ")");
            }

            // --- B-3안 신규: band 상대벡터 측정 ---
            // 왜 지금: designDoc이 닫히기 전, designPieces.bands cx/cy 가 확정된 시점.
            // 각 band를 "요소처럼" 취급해 가장 가까운 body idx와 상대벡터를 기록.
            if (designPieces && designPieces.bands.length > 0) {
                for (var bi = 0; bi < designPieces.bands.length; bi++) {
                    var bandPiece = designPieces.bands[bi];
                    // 왜 인라인 계산: assignElementToPiece는 PageItem 기반인데 band는 {cx,cy} 스냅샷이라
                    //                PageItem 생성 없이 직접 거리 계산하는 쪽이 명확.
                    var bPieceIdx = -1;
                    if (designPieces.bodies.length > 0) {
                        var bestIdxB = 0;
                        var bestDistB = -1;
                        for (var bj = 0; bj < designPieces.bodies.length; bj++) {
                            var dxB = bandPiece.cx - designPieces.bodies[bj].cx;
                            var dyB = bandPiece.cy - designPieces.bodies[bj].cy;
                            // 왜 Math.sqrt: Math.hypot 은 ES3에 없음
                            var dB = Math.sqrt(dxB * dxB + dyB * dyB);
                            if (bestDistB < 0 || dB < bestDistB) {
                                bestDistB = dB;
                                bestIdxB = bj;
                            }
                        }
                        bPieceIdx = bestIdxB;
                    }
                    // bodies.length===0 케이스 → pieceIdx=-1 유지 → SVG 쪽에서 fallbackCenter 사용
                    var bBase = (bPieceIdx >= 0 && bPieceIdx < designPieces.bodies.length)
                                ? designPieces.bodies[bPieceIdx]
                                : designFallbackCenter;
                    var bRv = { dx: 0, dy: 0 };
                    if (bBase) {
                        // X축: 중심 기준 유지
                        bRv.dx = bandPiece.cx - bBase.cx;
                        // Y축: body 상단 기준 (band는 body 위에 위치하므로)
                        var bandBottom = bandPiece.bbox[3]; // band의 하단 y
                        var bBodyTop = (bPieceIdx >= 0 && bPieceIdx < designPieces.bodies.length)
                                       ? designPieces.bodies[bPieceIdx].bbox[1] // body 상단 (bbox[1] = top)
                                       : bBase.cy; // fallback: 중심 기준 유지
                        bRv.dy = bandBottom - bBodyTop;
                    }
                    bandMeta.push({ index: bi, pieceIdx: bPieceIdx, relVec: bRv });

                    var bDistLog = (bestDistB !== undefined && bestDistB >= 0) ? bestDistB : -1;
                    logWrite("[진단] 디자인AI band[" + bi + "] 소속 body 인덱스=" + bPieceIdx
                        + " 거리=" + (bDistLog >= 0 ? bDistLog.toFixed(1) : "?")
                        + " relVec=(" + bRv.dx.toFixed(1) + "," + bRv.dy.toFixed(1) + ")");
                }
            } else {
                logWrite("[진단] 디자인AI bands 없음 - band 이동 스킵 예정");
            }
        }

        // ===== STEP 3: 새 CMYK 문서 생성 (아트보드 = 패턴 SVG 크기) =====
        // SVG를 먼저 열어 아트보드 크기를 읽어야 새 문서 크기 결정 가능
        var patternFile = new File(config.patternSvgPath);
        if (!patternFile.exists) throw new Error("패턴 SVG 없음: " + config.patternSvgPath);

        svgDoc = app.open(patternFile);
        var svgAb = svgDoc.artboards[0].artboardRect;
        var svgWidth = svgAb[2] - svgAb[0];
        var svgHeight = svgAb[1] - svgAb[3];
        logWrite("[grading-v2] STEP 3: SVG 아트보드 " + svgWidth.toFixed(1)
            + "x" + svgHeight.toFixed(1) + "pt");

        // SVG GroupItem 해제 (양면 유니폼 등 그룹으로 묶인 SVG 대응)
        // 왜: SVG export 시 path가 GroupItem으로 묶여있으면
        //      importPatternPaths가 pathItems를 못 잡음 (filledCount=0)
        // 해결: 모든 그룹을 풀어 path를 레이어 직속으로 올림
        app.activeDocument = svgDoc;
        for (var ugi = 0; ugi < 3; ugi++) {  // 중첩 그룹 대비 최대 3회
            if (svgDoc.layers[0].groupItems.length === 0) break;
            app.executeMenuCommand("selectall");
            app.executeMenuCommand("ungroup");
        }
        app.selection = null;
        logWrite("[grading-v2] SVG ungroup 완료: " + svgDoc.layers[0].pathItems.length + "개 path 노출");

        // 대지 사이즈 고정: 158cm × 200cm (사내 작업 기준)
        var ARTBOARD_W_CM = 158;
        var ARTBOARD_H_CM = 200;
        baseDoc = createCmykDoc(ARTBOARD_W_CM * CM_TO_PT, ARTBOARD_H_CM * CM_TO_PT);
        logWrite("[grading-v2] STEP 3: 대지 고정 " + ARTBOARD_W_CM + "x" + ARTBOARD_H_CM + "cm ("
            + (ARTBOARD_W_CM * CM_TO_PT).toFixed(1) + "x" + (ARTBOARD_H_CM * CM_TO_PT).toFixed(1) + "pt)");
        app.activeDocument = baseDoc;

        // 베이스 문서 레이어 3개 (z-order 순서: 배경fill < 디자인 < 패턴선)
        var defaultLayer = baseDoc.layers[0];
        var fillLayer = baseDoc.layers.add();
        fillLayer.name = "배경 fill";
        var designLayer = baseDoc.layers.add();
        designLayer.name = "디자인 요소";
        var patternLayer = baseDoc.layers.add();
        patternLayer.name = "패턴 선";

        // ===== STEP 4~5: 패턴선 duplicate + 몸판 색상 적용 =====
        // Q3 duplicate 유지, "베인 색상 안 채우기" 로직 포함
        var importResult = importPatternPaths(svgDoc, baseDoc, mainColor, fillLayer, patternLayer);
        var filledCount = importResult.filledCount;
        var targetArea = importResult.targetArea;
        logWrite("[grading-v2] STEP 4-5: " + filledCount + "개 조각 임포트, 타겟 면적="
            + targetArea.toFixed(0) + "pt²");

        if (filledCount === 0) logWrite("[grading-v2] 경고: 50pt 이상 조각 없음");

        // SVG 원본 닫기 (path는 이미 duplicate 완료)
        try { svgDoc.close(SaveOptions.DONOTSAVECHANGES); svgDoc = null; }
        catch (eSvg) { logWrite("[grading-v2] SVG close 실패: " + eSvg.message); }

        // 빈 기본 레이어 제거
        try { if (defaultLayer.pageItems.length === 0) defaultLayer.remove(); } catch (eDef) {}

        app.activeDocument = baseDoc;

        // ===== STEP 6: 요소 duplicate (designDoc → baseDoc.designLayer) =====
        // Q3: app.copy/paste 금지. duplicate(targetLayer, PLACEATEND) 사용.
        var pastedItems = [];
        for (var di = 0; di < elemItems.length; di++) {
            var dup = elemItems[di].duplicate(designLayer, ElementPlacement.PLACEATEND);
            pastedItems.push(dup);
        }
        logWrite("[grading-v2] STEP 6: " + pastedItems.length + "개 요소 복제");

        // 이제 designDoc 닫아도 안전
        try { designDoc.close(SaveOptions.DONOTSAVECHANGES); designDoc = null; }
        catch (eD) { logWrite("[grading-v2] 디자인 close 실패: " + eD.message); }

        // ===== STEP 7: 스케일(그룹) + 조각별 개별 배치 (B-2안) =====
        if (pastedItems.length > 0) {
            // 복제된 아이템을 selection에 재등록
            baseDoc.selection = null;
            for (var si = 0; si < pastedItems.length; si++) {
                pastedItems[si].selected = true;
            }

            // 그룹화 (요소 간 내부 비율 보존 목적으로 resize만 그룹 기준에서 1회)
            app.executeMenuCommand("group");
            var pastedGroup = baseDoc.selection[0];

            // 면적 비율 스케일 (linearScale = sqrt(areaRatio))
            // 왜 if 밖에 선언: 아래 배치 호출부에서도 linearScale 참조 필요.
            var linearScale = 1.0;
            // 요소 스케일 지수 보정 (K < 1이면 변화 완화, K = 1.0이면 보정 없음)
            // 사용자 관찰: 작은 사이즈에서 요소가 몸판 대비 과소, 큰 사이즈에서 과대
            // K=0.78 스케일 변화 22% 완화
            var ELEMENT_SCALE_EXPONENT = 0.78;
            if (baseArea > 0 && targetArea > 0) {
                var areaRatio = targetArea / baseArea;
                linearScale = Math.sqrt(areaRatio);
                logWrite("[grading-v2] STEP 7: 면적비=" + areaRatio.toFixed(4)
                    + " 선형스케일=" + linearScale.toFixed(4)
                    + " (" + (linearScale * 100).toFixed(1) + "%)");

                // 지수 보정 적용: linearScale^K (K<1이면 축소/확대 완화)
                var adjustedScale = Math.pow(linearScale, ELEMENT_SCALE_EXPONENT);
                logWrite("[grading-v2] STEP 7: 보정스케일=" + adjustedScale.toFixed(4)
                    + " (" + (adjustedScale * 100).toFixed(1) + "%) K=" + ELEMENT_SCALE_EXPONENT);

                // 0.5% 이상 차이 있을 때만 적용
                if (Math.abs(adjustedScale - 1.0) > 0.005) {
                    var pct = adjustedScale * 100;
                    // Transformation.CENTER: 그룹 중심 기준 resize (요소 간 비율 유지)
                    pastedGroup.resize(pct, pct, true, true, true, true, pct, Transformation.CENTER);
                }
            } else {
                logWrite("[grading-v2] 면적 계산 불가 - 스케일 생략");
            }

            // --- 그룹 해제 (표준 ungroup 명령) ---
            // 왜 ungroup: 이제부터 각 요소를 pieceIdx에 따라 개별 translate해야 하므로
            //             그룹 단위 이동을 해제한다. pastedItems 배열은 duplicate 시점의
            //             최상위 1레벨 참조만 담고 있어 1회 ungroup 으로 우리가 만든 그룹만 해제됨.
            app.executeMenuCommand("ungroup");

            // --- SVG fillLayer 조각 분류 (디자인 AI와 동일 알고리즘) ---
            var svgPieces = classifyBodyPieces(fillLayer);
            svgPieces.source = "svg";
            var svgFallback = getLayerCenter(fillLayer);

            // SVG bodies cx 리스트 로그
            var svgCxList = "";
            for (var sci = 0; sci < svgPieces.bodies.length; sci++) {
                svgCxList += (sci > 0 ? ", " : "") + "body" + sci + "=" + svgPieces.bodies[sci].cx.toFixed(1);
            }
            logWrite("[진단] SVG 몸판 분류: bands=" + svgPieces.bands.length
                + "개 bodies=" + svgPieces.bodies.length + "개 (좌→우: " + svgCxList + ")");

            // --- body별 색상 적용 (양면 유니폼 대응) ---
            // 왜 여기서: importPatternPaths가 mainColor(단일)로 전부 채운 상태.
            //           양면 유니폼은 각 조각이 다른 색이므로 여기서 개별 색상으로 덮어쓴다.
            // bodyColors(디자인 측)와 svgPieces.bodies(SVG 측)를 인덱스 매칭
            // (둘 다 x중심 오름차순 정렬이므로 순서가 일치한다)
            if (bodyColors.length > 0 && svgPieces && svgPieces.bodies.length > 0) {
                var colorMatchCount = Math.min(bodyColors.length, svgPieces.bodies.length);
                for (var cmi = 0; cmi < colorMatchCount; cmi++) {
                    var svgBody = svgPieces.bodies[cmi];
                    var designColor = bodyColors[cmi].color;
                    if (svgBody.pathRef && designColor) {
                        svgBody.pathRef.filled = true;
                        svgBody.pathRef.fillColor = cloneCMYK(designColor);
                        logWrite("[진단] body[" + cmi + "] 색상 적용: C" + designColor.cyan.toFixed(1)
                            + " M" + designColor.magenta.toFixed(1)
                            + " Y" + designColor.yellow.toFixed(1)
                            + " K" + designColor.black.toFixed(1));
                    }
                }
                // 매칭 안 된 나머지 body는 mainColor 유지 (importPatternPaths에서 이미 적용)
            }

            // 매칭 일치/불일치 판정
            var designBodyCount = designPieces ? designPieces.bodies.length : 0;
            var svgBodyCount = svgPieces.bodies.length;
            var matchCount = Math.min(designBodyCount, svgBodyCount);
            var matchStatus = (designBodyCount === svgBodyCount) ? "일치" : "불일치";
            logWrite("[진단] 매칭 결과: designBodies=" + designBodyCount
                + "개 svgBodies=" + svgBodyCount
                + "개 (" + matchStatus + ", 유효 매칭=" + matchCount + "개)");
            if (matchStatus === "불일치") {
                logWrite("[진단] 경고: 몸판 조각 개수 불일치 (design="
                    + designBodyCount + ", svg=" + svgBodyCount
                    + ") → min 까지 매칭, 초과분 fallback");
            }

            // --- 요소별 개별 배치 (pieceIdx 기반) ---
            // 요소용: 보정된 스케일 적용 (band는 몸판 조각이라 면적 비례 그대로 유지)
            var adjustedForPlace = Math.pow(linearScale, ELEMENT_SCALE_EXPONENT);
            var scaleForPlace = (typeof adjustedForPlace === "number" && adjustedForPlace > 0) ? adjustedForPlace : 1.0;
            var bandScaleForPlace = (typeof linearScale === "number" && linearScale > 0) ? linearScale : 1.0;

            // --- band 개별 이동 (요소 배치보다 먼저 실행) ---
            // 왜 먼저: band 소속 요소가 bandPositions(이동 후 실제 좌표)를 참조해야 하므로
            //          band를 먼저 이동하고 그 결과를 placeElementGroupPerPiece에 전달한다.
            var bandPositions = [];
            if (svgPieces.bands.length > 0 && bandMeta.length > 0) {
                var bandMatchStatus = (bandMeta.length === svgPieces.bands.length) ? "일치" : "불일치";
                logWrite("[진단] band 매칭 결과: designBands=" + bandMeta.length
                    + "개 svgBands=" + svgPieces.bands.length + "개 (" + bandMatchStatus + ")");
                bandPositions = placeBandsPerPiece(svgPieces.bands, bandMeta, svgPieces.bodies, svgFallback, bandScaleForPlace);

                // --- patternLayer band도 동일 이동 ---
                // 왜 필요: fillLayer band(채움)만 이동하면 patternLayer band(선)은 원래 위치에 남아
                //          채움과 선이 분리된다. 같은 이동량을 적용해야 겹침이 유지된다.
                var ptPieces = classifyBodyPieces(patternLayer);
                ptPieces.source = "svg-pattern";
                var ptMatchCount = Math.min(bandMeta.length, ptPieces.bands.length);

                if (ptMatchCount > 0) {
                    logWrite("[진단] patternLayer band 이동 시작: ptBands=" + ptPieces.bands.length
                        + "개 매칭=" + ptMatchCount + "개");

                    for (var pbi = 0; pbi < ptMatchCount; pbi++) {
                        var ptBand = ptPieces.bands[pbi];
                        var ptMeta = bandMeta[pbi];
                        if (!ptBand || !ptBand.pathRef || !ptMeta) continue;

                        // 왜 svgPieces.bodies 기준: patternLayer bodies가 아닌 fillLayer bodies 기준으로
                        //   이동해야 fillLayer band와 동일한 위치로 정렬된다.
                        var ptPieceIdx = ptMeta.pieceIdx;
                        var ptRelVec = (ptMeta.relVec) ? ptMeta.relVec : { dx: 0, dy: 0 };

                        var ptBaseCenter = null;
                        if (ptPieceIdx >= 0 && svgPieces.bodies && ptPieceIdx < svgPieces.bodies.length) {
                            ptBaseCenter = svgPieces.bodies[ptPieceIdx];
                        } else {
                            ptBaseCenter = svgFallback;
                        }
                        if (!ptBaseCenter) continue;

                        // X축: 중심 기준 (기존 유지)
                        var ptTargetCx = ptBaseCenter.cx + ptRelVec.dx * bandScaleForPlace;

                        var ptBounds = ptBand.pathRef.geometricBounds;
                        var ptCurCx = (ptBounds[0] + ptBounds[2]) / 2;

                        if (ptPieceIdx >= 0 && svgPieces.bodies && ptPieceIdx < svgPieces.bodies.length) {
                            // Y축: body 상단 기준 (band는 body 위에 위치하므로)
                            var ptSvgBodyTop = svgPieces.bodies[ptPieceIdx].bbox[1]; // body 상단
                            var ptTargetBottom = ptSvgBodyTop + ptRelVec.dy * bandScaleForPlace;
                            var ptCurBottom = ptBounds[3]; // 현재 pattern band 하단
                            ptBand.pathRef.translate(ptTargetCx - ptCurCx, ptTargetBottom - ptCurBottom);

                            logWrite("[진단] patternLayer band[" + pbi + "] 이동(상단기준):"
                                + " bodyTop=" + ptSvgBodyTop.toFixed(1)
                                + " 타겟Bottom=" + ptTargetBottom.toFixed(1));
                        } else {
                            // fallback: 중심 기준 유지
                            var ptTargetCy = ptBaseCenter.cy + ptRelVec.dy * bandScaleForPlace;
                            var ptCurCy = (ptBounds[1] + ptBounds[3]) / 2;
                            ptBand.pathRef.translate(ptTargetCx - ptCurCx, ptTargetCy - ptCurCy);

                            logWrite("[진단] patternLayer band[" + pbi + "] 이동(fallback): 타겟=("
                                + ptTargetCx.toFixed(1) + "," + ptTargetCy.toFixed(1) + ")");
                        }
                    }
                } else {
                    logWrite("[진단] patternLayer band 이동 스킵: ptBands=" + ptPieces.bands.length);
                }
            } else {
                logWrite("[진단] band 이동 스킵: design bands=" + bandMeta.length
                    + ", svg bands=" + svgPieces.bands.length);
            }

            // --- 요소 배치 (band 이동 후 실행) ---
            // 왜 band 뒤: band 소속 요소가 bandPositions(이동 후 좌표)를 참조하므로
            //              band 이동이 완료된 뒤에 실행해야 정확한 좌표를 얻는다.
            app.redraw(); // geometricBounds 갱신 (band 외 요소용)
            placeElementGroupPerPiece(pastedItems, elemMeta, svgPieces, svgFallback, scaleForPlace, bandPositions);
        } else {
            logWrite("[grading-v2] 요소 없음 - 스케일/정렬 생략");
        }

        baseDoc.selection = null;

        // ===== 패턴 중앙 정렬 (대지 > 패턴이면 중앙 배치) =====
        // 왜: 대지 고정(158x200cm)이 SVG 패턴보다 클 수 있어 한쪽 치우침 방지
        var abRect = baseDoc.artboards[0].artboardRect; // [L, T, R, B]
        var abCx = (abRect[0] + abRect[2]) / 2;
        var abCy = (abRect[1] + abRect[3]) / 2;

        // 모든 레이어 아이템 합집합 bbox 구하기
        var allItems = [];
        var layersToCenter = [fillLayer, patternLayer, designLayer];
        for (var lci = 0; lci < layersToCenter.length; lci++) {
            var ly = layersToCenter[lci];
            if (!ly) continue;
            for (var aci = 0; aci < ly.pageItems.length; aci++) {
                allItems.push(ly.pageItems[aci]);
            }
        }

        if (allItems.length > 0) {
            var allCenter = getItemsCenter(allItems);
            if (allCenter) {
                var shiftX = abCx - allCenter.cx;
                var shiftY = abCy - allCenter.cy;
                // 모든 아이템 일괄 이동
                for (var shi = 0; shi < allItems.length; shi++) {
                    allItems[shi].translate(shiftX, shiftY);
                }
                logWrite("[grading-v2] 중앙 정렬: 이동 dx=" + shiftX.toFixed(1) + " dy=" + shiftY.toFixed(1));
            }
        }

        // ===== 레이어 z-order 통합 =====
        // 의도: 패턴선/너치(위) > 디자인 요소(중) > 배경 fill(아래)
        // PLACEATEND = 뒤쪽 = z-order 아래. 위에 놓일 것부터 먼저 이동.
        var finalLayer = baseDoc.layers.add();
        finalLayer.name = "그레이딩 출력";

        // 1) 패턴선/너치 먼저 (최상단)
        while (patternLayer.pageItems.length > 0) {
            patternLayer.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }
        // 2) 디자인 요소 (중간)
        while (designLayer.pageItems.length > 0) {
            designLayer.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }
        // 3) 배경 fill (최하단)
        while (fillLayer.pageItems.length > 0) {
            fillLayer.pageItems[0].move(finalLayer, ElementPlacement.PLACEATEND);
        }
        try { fillLayer.remove(); } catch (e1) {}
        try { designLayer.remove(); } catch (e2) {}
        try { patternLayer.remove(); } catch (e3) {}

        logWrite("[grading-v2] 레이어 통합 완료");

        // ===== STEP 8: EPS 저장 =====
        var outputFile = new File(config.outputPath);
        baseDoc.saveAs(outputFile, createEpsOptions());
        logWrite("[grading-v2] STEP 8: EPS 저장 완료 - " + config.outputPath);

        // ===== STEP 9: result.json =====
        baseDoc.close(SaveOptions.DONOTSAVECHANGES);
        baseDoc = null;

        writeSuccessResult(resultPath, config.outputPath,
            "그레이딩 완료 (v2, " + filledCount + "개 조각 + " + pastedItems.length + "개 요소)");
        logWrite("[grading-v2] 완료!");

    } catch (err) {
        logWrite("[grading-v2] 오류: " + err.message);

        // 열린 문서 정리 (역순)
        try { if (designDoc) designDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eD) {}
        try { if (svgDoc) svgDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eS) {}
        try { if (baseDoc) baseDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eB) {}

        // resultPath는 config 읽기 전 실패할 수 있음 → 방어
        try {
            var scriptFolder = (new File($.fileName)).parent;
            var defaultResultPath = scriptFolder.fsName + "\\result.json";
            var rp = (typeof resultPath !== "undefined" && resultPath) ? resultPath : defaultResultPath;
            writeErrorResult(rp, err.message);
        } catch (eR) { /* 기록 실패는 조용히 */ }
    }
}

// ===== 실행 =====
main();
