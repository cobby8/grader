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
// 로그 (파일 출력)
// ============================================================

// 왜 파일 출력: Illustrator 콘솔 없으므로 파일로 남겨야 디버깅 가능.
// config.outputPath 옆에 grading-debug.log 저장 → 사용자가 노트패드로 확인.
var _logFile = null;
var _logFileInitialized = false;
var DEBUG_LOG = false; // 2026-04-21 검증 완료, 성능 원복

function initLogFile(outputPath) {
    try {
        var parent = outputPath.replace(/[\\\/][^\\\/]+$/, "");
        if (!parent || parent === outputPath) parent = outputPath;
        var logPath = parent + "\\grading-debug.log";
        _logFile = new File(logPath);
        _logFile.encoding = "UTF-8";
        _logFile.open("w");
        _logFile.write("=== grading-v2 실행 로그 (" + new Date().toString() + ") ===\n");
        // 파일을 열어둔 채 유지 (매번 open/close 하지 않음 → 성능 대폭 향상)
        _logFileInitialized = true;
    } catch (e) {
        _logFileInitialized = false;
    }
}

function logWrite(msg) {
    // $.writeln 제거 — ExtendScript Toolkit 미사용 시 불필요한 오버헤드
    if (_logFileInitialized && _logFile) {
        try {
            _logFile.write(msg + "\n");
        } catch (e2) {}
    }
}

function flushLogFile() {
    if (_logFileInitialized && _logFile) {
        try { _logFile.close(); } catch (e) {}
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
        if (DEBUG_LOG) logWrite("[grading-v2] '몸판' 레이어 없음");
        return null;
    }

    // pathItems에서 첫 filled 우선
    for (var i = 0; i < bodyLayer.pathItems.length; i++) {
        var p = bodyLayer.pathItems[i];
        if (p.filled && p.fillColor && p.fillColor.typename !== "NoColor") {
            if (DEBUG_LOG) logWrite("[grading-v2] 몸판 색 발견 (pathItems[" + i + "])");
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
                    if (DEBUG_LOG) logWrite("[grading-v2] 몸판 색 발견 (그룹 내부)");
                    return toCMYK(gp.fillColor);
                }
            }
        }
    }

    if (DEBUG_LOG) logWrite("[grading-v2] 몸판에서 채워진 path 못 찾음");
    return null;
}

// 디자인 AI "몸판" 레이어의 각 body별 개별 색상 추출
// 반환: [{cx, cy, color: CMYKColor}, ...] (x+y 2D 정렬)
// 왜 필요: 양면 유니폼(표면=흰색, 이면=남색)에서 body마다 색이 다를 수 있음
function extractBodyColors(designDoc) {
    var colors = [];
    try {
        var bodyLayer = designDoc.layers.getByName("몸판");
        // 직속 pathItems 탐색 (50pt 이상 = 몸판 조각)
        for (var i = 0; i < bodyLayer.pathItems.length; i++) {
            var p = bodyLayer.pathItems[i];
            if (Math.abs(p.width) > 50 && Math.abs(p.height) > 50
                && p.filled && p.fillColor && p.fillColor.typename !== "NoColor") {
                var gb = p.geometricBounds;
                var cx = (gb[0] + gb[2]) / 2;
                var cy = (gb[1] + gb[3]) / 2;
                colors.push({ cx: cx, cy: cy, color: toCMYK(p.fillColor) });
            }
        }
        // GroupItem 내부도 탐색
        for (var gi = 0; gi < bodyLayer.groupItems.length; gi++) {
            var grp = bodyLayer.groupItems[gi];
            for (var gpi = 0; gpi < grp.pathItems.length; gpi++) {
                var gp = grp.pathItems[gpi];
                if (Math.abs(gp.width) > 50 && Math.abs(gp.height) > 50
                    && gp.filled && gp.fillColor && gp.fillColor.typename !== "NoColor") {
                    var ggb = gp.geometricBounds;
                    colors.push({ cx: (ggb[0]+ggb[2])/2, cy: (ggb[1]+ggb[3])/2, color: toCMYK(gp.fillColor) });
                }
            }
        }
        // x+y 2D 정렬 (classifyBodyPieces와 동일 규칙)
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
        if (DEBUG_LOG) logWrite("[진단] SVG 레이어[" + li + "] 이름=" + src.name
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
            if (DEBUG_LOG) logWrite("[진단]   [" + di + "] typename=" + it.typename
                + " w=" + w.toFixed(1) + " h=" + h.toFixed(1)
                + " filled=" + fl + " closed=" + cl);
        }

        // 역순: duplicate/move가 인덱스 변경해도 안전
        var pathN = src.pathItems.length;
        for (var pi = pathN - 1; pi >= 0; pi--) {
            var path = src.pathItems[pi];

            // [진단] 각 path의 크기/채움여부/50pt 통과 여부
            if (DEBUG_LOG) logWrite("[진단]   path[" + pi + "] w=" + Math.abs(path.width).toFixed(1)
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
    if (DEBUG_LOG) logWrite("[진단] importPatternPaths 결과: filledCount=" + filledCount
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

    // 왜 정렬: 디자인 AI와 SVG의 레이어 내 path 순서가 다를 수 있으므로
    //          x중심 오름차순으로 통일해 "좌→우 idx" 대응을 보장한다.
    result.bodies.sort(function(a, b) {
        return a.cx - b.cx;
    });
    // 왜 bands도 정렬: B-3안에서 design bands[i] ↔ svg bands[i] 를 idx로 직접 매칭.
    //                  양쪽 모두 x중심 오름차순 정렬해야 의미 있는 1:1 대응이 된다.
    result.bands.sort(function(a, b) {
        return a.cx - b.cx;
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

// 레이어 이름(면+조각)으로 4분면 body 찾기
// 왜: 양면 유니폼에서 유클리드 거리 매칭은 요소-body가 꼬임.
//      레이어 이름("요소_표_앞" 등)에서 면(표/이)+조각(앞/뒤)을 파싱해
//      4분면 위치를 고정하면 매칭이 확정적.
// bodies: classifyBodyPieces로 정렬된 배열
// 반환: body 인덱스 또는 -1
function findBodyForLayer(piece, side, bodies) {
    if (!piece || bodies.length === 0) return -1;

    // bodies 중심점 계산 (4분면 분할 기준)
    var midX = 0, midY = 0;
    for (var i = 0; i < bodies.length; i++) {
        midX += bodies[i].cx;
        midY += bodies[i].cy;
    }
    midX /= bodies.length;
    midY /= bodies.length;

    // 사분면 결정: 앞판=좌측, 뒷판=우측 / 표면(or 단면)=상단, 이면=하단
    var wantLeft = (piece === "앞");
    var wantTop = (!side || side === "표"); // 표면 or 단면(side===null) = 상단

    var bestIdx = -1;
    var bestDist = Infinity;
    for (var bi = 0; bi < bodies.length; bi++) {
        var isLeft = (bodies[bi].cx < midX);
        var isTop = (bodies[bi].cy > midY); // Y 클수록 위 (Illustrator geometricBounds 기준)

        if (bodies.length <= 2) {
            // 단면(2body): y축 무시, x축만 체크
            if (wantLeft === isLeft || bodies.length === 1) {
                var dist = Math.abs(bodies[bi].cx - midX);
                if (dist < bestDist || bestIdx === -1) {
                    bestDist = dist;
                    bestIdx = bi;
                }
            }
        } else {
            // 양면(4body): x+y 모두 체크
            if (wantLeft === isLeft && wantTop === isTop) {
                bestIdx = bi;
                break; // 정확히 1개 매칭
            }
        }
    }

    return bestIdx;
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
            if (DEBUG_LOG) logWrite("[진단] 요소[" + i + "] 배치 생략: baseCenter 없음 (type=" + pieceType + " pieceIdx=" + pieceIdx + ")");
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

            if (DEBUG_LOG) logWrite("[진단] 요소[" + i + "] 배치(band,상대좌표): pieceIdx=" + pieceIdx
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

            if (DEBUG_LOG) logWrite("[진단] 요소[" + i + "] 배치(piece,하단기준): pieceIdx=" + pieceIdx
                + " bodyBottom=" + svgBodyBottom.toFixed(1)
                + " relVec=(" + relVec.dx.toFixed(1) + "," + relVec.dy.toFixed(1) + ")"
                + " scale=" + scale.toFixed(4)
                + " 타겟Bottom=" + targetBottom.toFixed(1));
        } else {
            // fallback: 중심 기준 유지 (기존 동작)
            var targetCy = baseCenter.cy + relVec.dy * scale;
            var curCy = (gb[1] + gb[3]) / 2;
            item.translate(targetCx - curCx, targetCy - curCy);

            if (DEBUG_LOG) logWrite("[진단] 요소[" + i + "] 배치(fallback): pieceIdx=" + pieceIdx
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
            if (DEBUG_LOG) logWrite("[진단] SVG band[" + i + "] 메타 없음 - 이동 생략 (원본 좌표 유지)");
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
            if (DEBUG_LOG) logWrite("[진단] SVG band[" + i + "] baseCenter 없음 - 생략");
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

            if (DEBUG_LOG) logWrite("[진단] SVG band[" + i + "] 이동(piece,상단기준): pieceIdx=" + pieceIdx
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

            if (DEBUG_LOG) logWrite("[진단] SVG band[" + i + "] 이동(fallback): pieceIdx=" + pieceIdx
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

        // 대화 상자 억제 (속도 향상 — SVG/AI 열 때 옵션 창 방지)
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

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
            if (ln === "요소" || ln.indexOf("요소_") === 0) hasElements = true;
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
            if (DEBUG_LOG) logWrite("[grading-v2] 몸판 색 CMYK: C" + mainColor.cyan.toFixed(1)
                + " M" + mainColor.magenta.toFixed(1)
                + " Y" + mainColor.yellow.toFixed(1)
                + " K" + mainColor.black.toFixed(1));
        }

        // body별 개별 색상 추출 (양면 유니폼 대응, STEP 7에서 참조)
        var bodyColors = extractBodyColors(designDoc);
        logWrite("[grading-v2] body별 색상: " + bodyColors.length + "개");

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

        // 요소 레이어를 그룹별로 수집 (이름 기반 매칭용)
        // "요소" (기존) 또는 "요소_표_앞", "요소_이_뒤" 등 (이름 규약) 모두 수집
        // 왜 그룹별: 양면 유니폼에서 레이어 이름으로 어느 body(4분면)에 배치할지 확정하기 위함.
        //           기존처럼 전부 합치면 유클리드 매칭이 꼬여 색상/위치가 뒤바뀜.
        var elemLayerGroups = []; // [{name, side, piece, items}, ...]
        if (hasElements) {
            for (var eli = 0; eli < designDoc.layers.length; eli++) {
                var elName = designDoc.layers[eli].name;
                if (elName === "요소" || elName.indexOf("요소_") === 0) {
                    // 레이어 이름 파싱: "요소" / "요소_앞" / "요소_표_앞"
                    var tokens = elName.split("_");
                    var elSide = null;  // null=단면/폴백, "표"=표면, "이"=이면
                    var elPiece = null; // "앞", "뒤" 등
                    if (tokens.length === 2) { elPiece = tokens[1]; }        // "요소_앞"
                    else if (tokens.length === 3) { elSide = tokens[1]; elPiece = tokens[2]; } // "요소_표_앞"

                    var layerItems = [];
                    var elLayer = designDoc.layers[eli];
                    for (var eii = 0; eii < elLayer.pageItems.length; eii++) {
                        layerItems.push(elLayer.pageItems[eii]);
                    }
                    if (layerItems.length > 0) {
                        elemLayerGroups.push({ name: elName, side: elSide, piece: elPiece, items: layerItems });
                    }
                }
            }
            logWrite("[grading-v2] 요소 레이어 " + elemLayerGroups.length + "개 수집");
        }
        // 호환성: elemItems도 유지 (기존 유클리드 폴백 + 아래 코드 참조용)
        var elemItems = [];
        for (var egi = 0; egi < elemLayerGroups.length; egi++) {
            for (var eii2 = 0; eii2 < elemLayerGroups[egi].items.length; eii2++) {
                elemItems.push(elemLayerGroups[egi].items[eii2]);
            }
        }
        if (hasElements) {
            logWrite("[grading-v2] 요소 총: " + elemItems.length + "개 (레이어 스캔)");
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
            if (DEBUG_LOG) logWrite("[grading-v2] 디자인AI 몸판 ungroup: " + bodyLayer.pathItems.length + "개 path");
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
            if (DEBUG_LOG) logWrite("[진단] 디자인AI 몸판 분류: bands=" + designPieces.bands.length
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

                if (DEBUG_LOG) logWrite("[진단] 요소[" + mi + "] 소속: type=" + bestType + " idx=" + bestIdx
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
                    if (DEBUG_LOG) logWrite("[진단] 디자인AI band[" + bi + "] 소속 body 인덱스=" + bPieceIdx
                        + " 거리=" + (bDistLog >= 0 ? bDistLog.toFixed(1) : "?")
                        + " relVec=(" + bRv.dx.toFixed(1) + "," + bRv.dy.toFixed(1) + ")");
                }
            } else {
                if (DEBUG_LOG) logWrite("[진단] 디자인AI bands 없음 - band 이동 스킵 예정");
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
        if (DEBUG_LOG) logWrite("[grading-v2] SVG ungroup 완료: " + svgDoc.layers[0].pathItems.length + "개 path 노출");

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

        // ===== STEP 6~7: 요소 duplicate + 스케일 + 배치 =====
        // 이름 기반 레이어(piece !== null)가 있으면 레이어별 독립 처리,
        // 폴백("요소" 레이어만)이면 기존 유클리드 매칭 코드 실행.

        // 이름 기반 레이어 존재 여부 판별
        var hasNamedLayers = false;
        for (var nli = 0; nli < elemLayerGroups.length; nli++) {
            if (elemLayerGroups[nli].piece !== null) { hasNamedLayers = true; break; }
        }

        // 공통: 면적 비율 스케일 계산 (두 모드 모두 사용)
        var linearScale = 1.0;
        // 2026-04-21: 0.78 → 1.0. 2XS에서 축소 부족 이슈 완화용. 선형 스케일 그대로 적용 (완화 제거).
        // 단, SVG 자체가 XL의 86% 크기인 근본 문제는 SVG 생성 쪽에서 해결 필요.
        var ELEMENT_SCALE_EXPONENT = 1.0;
        var adjustedScale = 1.0;
        if (baseArea > 0 && targetArea > 0) {
            var areaRatio = targetArea / baseArea;
            linearScale = Math.sqrt(areaRatio);
            adjustedScale = Math.pow(linearScale, ELEMENT_SCALE_EXPONENT);
            logWrite("[grading-v2] STEP 7: 면적비=" + areaRatio.toFixed(4)
                + " 선형스케일=" + linearScale.toFixed(4)
                + " 보정스케일=" + adjustedScale.toFixed(4));
        } else {
            logWrite("[grading-v2] 면적 계산 불가 - 스케일 생략");
        }

        // 공통: SVG fillLayer 조각 분류 (두 모드 모두 필요)
        var svgPieces = classifyBodyPieces(fillLayer);
        svgPieces.source = "svg";
        var svgFallback = getLayerCenter(fillLayer);

        // SVG bodies cx 리스트 로그
        var svgCxList = "";
        for (var sci = 0; sci < svgPieces.bodies.length; sci++) {
            svgCxList += (sci > 0 ? ", " : "") + "body" + sci + "=" + svgPieces.bodies[sci].cx.toFixed(1);
        }
        if (DEBUG_LOG) logWrite("[진단] SVG 몸판 분류: bands=" + svgPieces.bands.length
            + "개 bodies=" + svgPieces.bodies.length + "개 (좌→우: " + svgCxList + ")");

        // 공통: body별 색상 적용 (양면 유니폼 대응)
        // 왜: 인덱스 순차 매칭은 디자인AI와 SVG의 body 순서가 다르면 색이 반대로 들어감
        // 해결: 4분면(좌/우, 상/하) 위치 기반으로 같은 위치의 body끼리 매칭
        if (bodyColors.length > 0 && svgPieces && svgPieces.bodies.length > 0) {
            // 디자인 AI body 중심 계산 (모든 body의 평균 좌표 = 전체 중심점)
            var midXd = 0, midYd = 0;
            for (var mdi = 0; mdi < bodyColors.length; mdi++) {
                midXd += bodyColors[mdi].cx; midYd += bodyColors[mdi].cy;
            }
            midXd /= bodyColors.length; midYd /= bodyColors.length;

            // SVG body 중심 계산
            var midXs = 0, midYs = 0;
            for (var msi = 0; msi < svgPieces.bodies.length; msi++) {
                midXs += svgPieces.bodies[msi].cx; midYs += svgPieces.bodies[msi].cy;
            }
            midXs /= svgPieces.bodies.length; midYs /= svgPieces.bodies.length;

            // 4분면 매칭: 디자인body와 SVG body가 같은 사분면에 있으면 색상 적용
            var colorApplied = 0;
            for (var ci = 0; ci < bodyColors.length; ci++) {
                var dLeft = (bodyColors[ci].cx < midXd);   // 디자인 body가 좌측인지
                var dTop = (bodyColors[ci].cy > midYd);     // 디자인 body가 상단인지

                for (var si = 0; si < svgPieces.bodies.length; si++) {
                    var sLeft = (svgPieces.bodies[si].cx < midXs);  // SVG body가 좌측인지
                    var sTop = (svgPieces.bodies[si].cy > midYs);   // SVG body가 상단인지

                    if (dLeft === sLeft && dTop === sTop) {
                        var svgBody = svgPieces.bodies[si];
                        if (svgBody.pathRef && bodyColors[ci].color) {
                            svgBody.pathRef.filled = true;
                            svgBody.pathRef.fillColor = cloneCMYK(bodyColors[ci].color);
                            colorApplied++;
                        }
                        break;
                    }
                }
            }
            logWrite("[grading-v2] body별 색상 적용: " + colorApplied + "/" + bodyColors.length + "개 (4분면 매칭)");

            // 2body 단면 폴백: 4분면 매칭 실패 시 기존 순차 매칭으로 대체
            if (colorApplied === 0 && bodyColors.length <= 2) {
                var fallbackCount = Math.min(bodyColors.length, svgPieces.bodies.length);
                for (var fi = 0; fi < fallbackCount; fi++) {
                    var fb = svgPieces.bodies[fi];
                    if (fb.pathRef && bodyColors[fi].color) {
                        fb.pathRef.filled = true;
                        fb.pathRef.fillColor = cloneCMYK(bodyColors[fi].color);
                    }
                }
                logWrite("[grading-v2] body별 색상 폴백: " + fallbackCount + "개 (순차 매칭)");
            }
        }

        if (hasNamedLayers && svgPieces && svgPieces.bodies.length > 0) {
            // ===== 이름 기반 매칭 모드 =====
            // 왜: 레이어 이름("요소_표_앞" 등)으로 4분면 body를 확정적으로 매칭.
            //      유클리드 거리 의존 제거 → 양면에서 요소-body 꼬임 해결.
            logWrite("[grading-v2] STEP 6-7: 이름 기반 요소 배치 모드 (" + elemLayerGroups.length + "개 그룹)");

            // ==============================================================
            // [2026-04-21 재수정] 폴백 모드와 100% 동일한 "1회 group/ungroup + placeElementGroupPerPiece 재사용" 구조
            // 왜 이 구조: 이전 버전은 그룹별로 4회 group/ungroup을 반복했는데,
            //   executeMenuCommand("ungroup")이 PageItem 참조를 무효화할 가능성(가설 D)이 있어
            //   요소가 XL 원 위치에 남는 문제 발생. 폴백 모드는 1회만 group/ungroup하므로 안전.
            // ==============================================================

            // Phase 1: 모든 그룹의 요소를 단일 배열로 duplicate + 요소별 relVec 수집
            // (designDoc 열려있을 때만 가능 — geometricBounds 접근 필요)
            var allDups = [];        // baseDoc 요소 평탄 배열 (폴백의 pastedItems 대응)
            var allElemMeta = [];    // [{pieceType, pieceIdx, relVec}, ...] — 폴백과 동일 스키마
            var phase1Summary = [];  // 로그용: 그룹별 {name, count, svgBodyIdx}

            for (var elgi = 0; elgi < elemLayerGroups.length; elgi++) {
                var eg = elemLayerGroups[elgi];
                if (eg.items.length === 0) continue;

                // SVG body 인덱스: Phase 2에서 placeElementGroupPerPiece가 svgPieces.bodies[svgBodyIdx]를 참조
                var svgBodyIdx = findBodyForLayer(eg.piece, eg.side, svgPieces.bodies);
                if (svgBodyIdx < 0) {
                    logWrite("[grading-v2] 경고: '" + eg.name + "' SVG body 매칭 실패 - 건너뜀");
                    continue;
                }

                // designDoc body: relVec 측정용 (XL 디자인 기준)
                // designPieces는 L972에서 생성됨. 이름 기반 모드 진입 시 살아있어야 하나,
                // hasBody/hasElements 둘 다 true일 때만 생성되므로 null 체크 필수.
                var designBody = null;
                if (designPieces && designPieces.bodies && designPieces.bodies.length > 0) {
                    var designBodyIdx = findBodyForLayer(eg.piece, eg.side, designPieces.bodies);
                    if (designBodyIdx >= 0) {
                        designBody = designPieces.bodies[designBodyIdx];
                    }
                }

                for (var dii = 0; dii < eg.items.length; dii++) {
                    var srcElem = eg.items[dii];

                    // relVec: 요소 중심 - designBody 중심 (X), 요소 하단 - designBody 하단 (Y)
                    // 폴백 모드 L1031~1037과 완전히 동일한 공식
                    var rv = { dx: 0, dy: 0 };
                    if (designBody) {
                        var elCenter = getItemsCenter([srcElem]);
                        if (elCenter) {
                            rv.dx = elCenter.cx - designBody.cx;
                            var elBottom = srcElem.geometricBounds[3]; // bbox[3] = bottom (Y 하단)
                            rv.dy = elBottom - designBody.bbox[3];
                        }
                    }

                    // duplicate (designDoc → baseDoc의 designLayer)
                    var dup = srcElem.duplicate(designLayer, ElementPlacement.PLACEATEND);
                    allDups.push(dup);
                    // pieceType = "body" 고정 (이름 기반 레이어는 body 전용. band는 별도 경로)
                    allElemMeta.push({ pieceType: "body", pieceIdx: svgBodyIdx, relVec: rv });
                }

                phase1Summary.push({ name: eg.name, count: eg.items.length, svgBodyIdx: svgBodyIdx });
            }
            logWrite("[grading-v2] Phase 1: " + allDups.length + "개 요소 duplicate + relVec 수집 완료 ("
                + phase1Summary.length + "개 그룹)");
            if (DEBUG_LOG) {
                for (var psi = 0; psi < phase1Summary.length; psi++) {
                    var ps = phase1Summary[psi];
                    logWrite("[진단] 그룹 '" + ps.name + "': " + ps.count + "개 요소 → svgBody[" + ps.svgBodyIdx + "]");
                }
            }

            // designDoc 닫기 (duplicate 완료 후 안전)
            try { designDoc.close(SaveOptions.DONOTSAVECHANGES); designDoc = null; }
            catch (eD) { logWrite("[grading-v2] 디자인 close 실패: " + eD.message); }

            app.activeDocument = baseDoc;

            // ==============================================================
            // band 처리 (요소 배치보다 먼저 — 폴백 L1404~1436과 동일 순서)
            // 왜 먼저: placeElementGroupPerPiece의 band 모드가 bandPositions를 참조하기 때문.
            //   (단, 이름 기반 모드에서는 요소가 모두 pieceType="body"라 bandPositions는 실제 사용 안 됨.
            //    그래도 인자 시그니처 호환을 위해 같은 순서로 처리)
            // ==============================================================
            var bandScaleForPlace = (typeof linearScale === "number" && linearScale > 0) ? linearScale : 1.0;
            var bandPositions = [];
            if (svgPieces.bands.length > 0 && bandMeta.length > 0) {
                bandPositions = placeBandsPerPiece(svgPieces.bands, bandMeta, svgPieces.bodies, svgFallback, bandScaleForPlace);

                // patternLayer band도 동일 이동 (폴백 L1408~1436과 동일)
                var ptPieces = classifyBodyPieces(patternLayer);
                var ptMatchCount = Math.min(bandMeta.length, ptPieces.bands.length);
                for (var pbi = 0; pbi < ptMatchCount; pbi++) {
                    var ptBand = ptPieces.bands[pbi];
                    var ptMeta = bandMeta[pbi];
                    if (!ptBand || !ptBand.pathRef || !ptMeta) continue;
                    var ptPieceIdx = ptMeta.pieceIdx;
                    var ptRelVec = (ptMeta.relVec) ? ptMeta.relVec : { dx: 0, dy: 0 };
                    var ptBaseCenter = null;
                    if (ptPieceIdx >= 0 && svgPieces.bodies && ptPieceIdx < svgPieces.bodies.length) {
                        ptBaseCenter = svgPieces.bodies[ptPieceIdx];
                    } else {
                        ptBaseCenter = svgFallback;
                    }
                    if (!ptBaseCenter) continue;
                    var ptTargetCx = ptBaseCenter.cx + ptRelVec.dx * bandScaleForPlace;
                    var ptBounds = ptBand.pathRef.geometricBounds;
                    var ptCurCx = (ptBounds[0] + ptBounds[2]) / 2;
                    if (ptPieceIdx >= 0 && svgPieces.bodies && ptPieceIdx < svgPieces.bodies.length) {
                        var ptSvgBodyTop = svgPieces.bodies[ptPieceIdx].bbox[1];
                        var ptTargetBottom = ptSvgBodyTop + ptRelVec.dy * bandScaleForPlace;
                        ptBand.pathRef.translate(ptTargetCx - ptCurCx, ptTargetBottom - ptBounds[3]);
                    } else {
                        var ptTargetCy = ptBaseCenter.cy + ptRelVec.dy * bandScaleForPlace;
                        var ptCurCy = (ptBounds[1] + ptBounds[3]) / 2;
                        ptBand.pathRef.translate(ptTargetCx - ptCurCx, ptTargetCy - ptCurCy);
                    }
                }
            }

            // ==============================================================
            // Phase 2: 전체 1그룹 → CENTER resize → ungroup (1회만) → placeElementGroupPerPiece
            // 폴백 모드 L1376~1389 + L1439와 완전히 동일한 구조
            // ==============================================================
            if (allDups.length > 0) {
                // 전체를 단일 그룹으로 묶어 1회만 CENTER resize
                baseDoc.selection = null;
                for (var si = 0; si < allDups.length; si++) {
                    allDups[si].selected = true;
                }
                app.executeMenuCommand("group");
                var pastedGroup = baseDoc.selection[0];

                if (Math.abs(adjustedScale - 1.0) > 0.005) {
                    var pct2 = adjustedScale * 100;
                    pastedGroup.resize(pct2, pct2, true, true, true, true, pct2, Transformation.CENTER);
                }

                // ungroup: 1회만 실행 — 가설 D(PageItem 참조 파괴) 회피
                app.executeMenuCommand("ungroup");
                baseDoc.selection = null;

                logWrite("[grading-v2] Phase 2: 1회 group/resize/ungroup 완료 (요소 " + allDups.length + "개)");

                // 폴백과 동일한 함수 호출: 각 요소를 자기 svgBody 기준으로 relVec*scale 만큼 개별 translate
                // 스케일 인자: adjustedScale (폴백 L1399 scaleForPlace와 일치)
                var scaleForPlace = adjustedScale;
                placeElementGroupPerPiece(allDups, allElemMeta, svgPieces, svgFallback, scaleForPlace, bandPositions);

                logWrite("[grading-v2] 이름 기반 배치 완료: " + allDups.length + "개 요소 (폴백 함수 재사용)");
            } else {
                logWrite("[grading-v2] 이름 기반 모드: 처리할 요소 없음");
            }

        } else {
            // ===== 폴백: 기존 유클리드 매칭 (STEP 6~7 원본 코드) =====
            logWrite("[grading-v2] STEP 6-7: 거리 기반 폴백 모드");

            // STEP 6: 요소 duplicate
            var pastedItems = [];
            for (var di = 0; di < elemItems.length; di++) {
                var dup = elemItems[di].duplicate(designLayer, ElementPlacement.PLACEATEND);
                pastedItems.push(dup);
            }
            logWrite("[grading-v2] STEP 6: " + pastedItems.length + "개 요소 복제");

            // designDoc 닫기
            try { designDoc.close(SaveOptions.DONOTSAVECHANGES); designDoc = null; }
            catch (eD) { logWrite("[grading-v2] 디자인 close 실패: " + eD.message); }

            // STEP 7: 스케일(그룹) + 조각별 개별 배치 (B-2안)
            if (pastedItems.length > 0) {
                baseDoc.selection = null;
                for (var si = 0; si < pastedItems.length; si++) {
                    pastedItems[si].selected = true;
                }
                app.executeMenuCommand("group");
                var pastedGroup = baseDoc.selection[0];

                if (Math.abs(adjustedScale - 1.0) > 0.005) {
                    var pct = adjustedScale * 100;
                    pastedGroup.resize(pct, pct, true, true, true, true, pct, Transformation.CENTER);
                }

                app.executeMenuCommand("ungroup");

                // 매칭 일치/불일치 판정
                var designBodyCount = designPieces ? designPieces.bodies.length : 0;
                var svgBodyCount = svgPieces.bodies.length;
                var matchCount = Math.min(designBodyCount, svgBodyCount);
                if (DEBUG_LOG) logWrite("[진단] 매칭 결과: designBodies=" + designBodyCount
                    + "개 svgBodies=" + svgBodyCount + "개");

                // 요소별 개별 배치 (pieceIdx 기반)
                var adjustedForPlace = Math.pow(linearScale, ELEMENT_SCALE_EXPONENT);
                var scaleForPlace = (typeof adjustedForPlace === "number" && adjustedForPlace > 0) ? adjustedForPlace : 1.0;
                var bandScaleForPlace = (typeof linearScale === "number" && linearScale > 0) ? linearScale : 1.0;

                // band 개별 이동 (요소 배치보다 먼저)
                var bandPositions = [];
                if (svgPieces.bands.length > 0 && bandMeta.length > 0) {
                    bandPositions = placeBandsPerPiece(svgPieces.bands, bandMeta, svgPieces.bodies, svgFallback, bandScaleForPlace);

                    var ptPieces = classifyBodyPieces(patternLayer);
                    var ptMatchCount = Math.min(bandMeta.length, ptPieces.bands.length);
                    for (var pbi = 0; pbi < ptMatchCount; pbi++) {
                        var ptBand = ptPieces.bands[pbi];
                        var ptMeta = bandMeta[pbi];
                        if (!ptBand || !ptBand.pathRef || !ptMeta) continue;
                        var ptPieceIdx = ptMeta.pieceIdx;
                        var ptRelVec = (ptMeta.relVec) ? ptMeta.relVec : { dx: 0, dy: 0 };
                        var ptBaseCenter = null;
                        if (ptPieceIdx >= 0 && svgPieces.bodies && ptPieceIdx < svgPieces.bodies.length) {
                            ptBaseCenter = svgPieces.bodies[ptPieceIdx];
                        } else {
                            ptBaseCenter = svgFallback;
                        }
                        if (!ptBaseCenter) continue;
                        var ptTargetCx = ptBaseCenter.cx + ptRelVec.dx * bandScaleForPlace;
                        var ptBounds = ptBand.pathRef.geometricBounds;
                        var ptCurCx = (ptBounds[0] + ptBounds[2]) / 2;
                        if (ptPieceIdx >= 0 && svgPieces.bodies && ptPieceIdx < svgPieces.bodies.length) {
                            var ptSvgBodyTop = svgPieces.bodies[ptPieceIdx].bbox[1];
                            var ptTargetBottom = ptSvgBodyTop + ptRelVec.dy * bandScaleForPlace;
                            ptBand.pathRef.translate(ptTargetCx - ptCurCx, ptTargetBottom - ptBounds[3]);
                        } else {
                            var ptTargetCy = ptBaseCenter.cy + ptRelVec.dy * bandScaleForPlace;
                            var ptCurCy = (ptBounds[1] + ptBounds[3]) / 2;
                            ptBand.pathRef.translate(ptTargetCx - ptCurCx, ptTargetCy - ptCurCy);
                        }
                    }
                }

                // 요소 배치 (band 이동 후)
                placeElementGroupPerPiece(pastedItems, elemMeta, svgPieces, svgFallback, scaleForPlace, bandPositions);
            } else {
                logWrite("[grading-v2] 요소 없음 - 스케일/정렬 생략");
            }
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
                if (DEBUG_LOG) logWrite("[grading-v2] 중앙 정렬: 이동 dx=" + shiftX.toFixed(1) + " dy=" + shiftY.toFixed(1));
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

        if (DEBUG_LOG) logWrite("[grading-v2] 레이어 통합 완료");

        // ===== STEP 8: EPS 저장 =====
        var outputFile = new File(config.outputPath);
        baseDoc.saveAs(outputFile, createEpsOptions());
        logWrite("[grading-v2] STEP 8: EPS 저장 완료 - " + config.outputPath);

        // ===== STEP 9: result.json =====
        baseDoc.close(SaveOptions.DONOTSAVECHANGES);
        baseDoc = null;

        writeSuccessResult(resultPath, config.outputPath,
            "그레이딩 완료 (v2, " + filledCount + "개 조각 + " + elemItems.length + "개 요소)");
        logWrite("[grading-v2] 완료!");
        flushLogFile();

    } catch (err) {
        logWrite("[grading-v2] 오류: " + err.message);
        flushLogFile();

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
