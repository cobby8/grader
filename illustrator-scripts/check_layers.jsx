// AI 파일의 레이어 구조를 확인하는 스크립트
var scriptFile = new File($.fileName);
var scriptFolder = scriptFile.parent;
var aiPath = scriptFolder.fsName + "\\test\\design_XL.ai";
var aiFile = new File(aiPath);

if (!aiFile.exists) {
    alert("AI 파일을 찾을 수 없습니다:\n" + aiPath);
} else {
    var doc = app.open(aiFile, DocumentColorSpace.CMYK);

    var info = "파일: " + doc.name + "\n";
    info += "색상 모드: " + (doc.documentColorSpace == DocumentColorSpace.CMYK ? "CMYK" : "RGB") + "\n";
    info += "크기: " + (doc.width * 0.3528).toFixed(0) + " x " + (doc.height * 0.3528).toFixed(0) + " mm\n";
    info += "레이어 수: " + doc.layers.length + "\n\n";

    for (var i = 0; i < doc.layers.length; i++) {
        var layer = doc.layers[i];
        info += "레이어 " + (i+1) + ": \"" + layer.name + "\"\n";
        info += "  아이템 수: " + layer.pageItems.length + "\n";
        info += "  잠금: " + layer.locked + ", 표시: " + layer.visible + "\n";
    }

    alert(info);
    doc.close(SaveOptions.DONOTSAVECHANGES);
}
