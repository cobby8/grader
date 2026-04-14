// AI "패턴선" 레이어와 SVG 패턴의 면적 비교
var scriptFile = new File($.fileName);
var scriptFolder = scriptFile.parent;

// 1. AI 파일 열기
var aiDoc = app.open(new File(scriptFolder.fullName + "/test/design_XL.ai"), DocumentColorSpace.CMYK);
var baseArea = 0;
var baseCount = 0;
try {
    var ptLayer = aiDoc.layers.getByName("패턴선");
    for (var i = 0; i < ptLayer.pathItems.length; i++) {
        var p = ptLayer.pathItems[i];
        if (Math.abs(p.width) > 50 && Math.abs(p.height) > 50) {
            if (!p.closed) p.closed = true;
            baseArea += Math.abs(p.area);
            baseCount++;
        }
    }
} catch(e) {}
aiDoc.close(SaveOptions.DONOTSAVECHANGES);

// 2. SVG 파일 열기
var svgDoc = app.open(new File(scriptFolder.fullName + "/test/pattern_XS.svg"), DocumentColorSpace.CMYK);
var targetArea = 0;
var targetCount = 0;
for (var j = 0; j < svgDoc.pathItems.length; j++) {
    var q = svgDoc.pathItems[j];
    if (Math.abs(q.width) > 50 && Math.abs(q.height) > 50) {
        if (!q.closed) q.closed = true;
        targetArea += Math.abs(q.area);
        targetCount++;
    }
}
svgDoc.close(SaveOptions.DONOTSAVECHANGES);

// 3. 결과
var areaRatio = targetArea / baseArea;
var linearScale = Math.sqrt(areaRatio);

var info = "=== 면적 비교 ===\n";
info += "기준(XL) 패턴선: " + baseArea.toFixed(0) + " pt² (" + baseCount + "개)\n";
info += "타겟(XS) SVG: " + targetArea.toFixed(0) + " pt² (" + targetCount + "개)\n";
info += "면적 비율: " + areaRatio.toFixed(4) + "\n";
info += "선형 스케일(√): " + linearScale.toFixed(4) + " (" + (linearScale*100).toFixed(1) + "%)\n";
info += "\n=== 가로폭 비교 (대안) ===\n";

// AI 패턴선 bbox 폭
var aiDoc2 = app.open(new File(scriptFolder.fullName + "/test/design_XL.ai"), DocumentColorSpace.CMYK);
var baseW = 0;
try {
    var ptL2 = aiDoc2.layers.getByName("패턴선");
    for (var k = 0; k < ptL2.pathItems.length; k++) {
        var r = ptL2.pathItems[k];
        if (Math.abs(r.width) > 50 && Math.abs(r.height) > 50) {
            baseW = Math.max(baseW, Math.abs(r.width));
        }
    }
} catch(e2) {}
aiDoc2.close(SaveOptions.DONOTSAVECHANGES);

var svgDoc2 = app.open(new File(scriptFolder.fullName + "/test/pattern_XS.svg"), DocumentColorSpace.CMYK);
var targetW = 0;
for (var m = 0; m < svgDoc2.pathItems.length; m++) {
    var s = svgDoc2.pathItems[m];
    if (Math.abs(s.width) > 50 && Math.abs(s.height) > 50) {
        targetW = Math.max(targetW, Math.abs(s.width));
    }
}
svgDoc2.close(SaveOptions.DONOTSAVECHANGES);

var wRatio = targetW / baseW;
info += "기준(XL) 최대폭: " + baseW.toFixed(1) + " pt\n";
info += "타겟(XS) 최대폭: " + targetW.toFixed(1) + " pt\n";
info += "폭 비율: " + wRatio.toFixed(4) + " (" + (wRatio*100).toFixed(1) + "%)\n";

alert(info);
