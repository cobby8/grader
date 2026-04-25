/**
 * illustrator-scripts/ai_to_pdf.jsx
 *
 * AI→SVG Phase 2-A: PostScript AI를 PDF 호환 모드로 재저장
 *
 * 목적: 헤더가 %!PS-Adobe로 시작하는 AI 파일은 PyMuPDF로 직접 변환 불가
 *      (Adobe 전용 PostScript 확장 때문). Illustrator로 열어서 PDF 1.4 호환
 *      모드로 재저장하면 PyMuPDF가 정상 변환할 수 있다.
 *
 * 입력: 같은 폴더의 ai_to_pdf_input.json
 *   {
 *     "input_path": "C:/abs/path/XL.ai",         // PostScript AI 절대 경로
 *     "output_path": "C:/abs/path/XL.tmp.ai"     // PDF 호환 AI 저장 위치 (절대 경로)
 *   }
 *
 * 출력: 같은 폴더의 ai_to_pdf_result.json
 *   성공: { "success": true, "output_path": "...", "input_size": N, "output_size": M }
 *   실패: { "success": false, "error": "..." }
 *
 * 호출 측 (Phase 2-C):
 *   - 프론트(AiConvertModal) → run_illustrator_script Tauri 커맨드 호출
 *   - 호출 전 ai_to_pdf_input.json 작성, 실행 후 ai_to_pdf_result.json 읽기
 *
 * 관련:
 *   - lessons.md [2026-04-21] AI 헤더 분기 교훈 (외부 63개 실증)
 *   - PLAN-AI-TO-SVG.md 섹션 12 (Phase 2 개요)
 *   - grading-v1-backup.jsx L207~218 (PDFSaveOptions 사용 예제)
 *
 * 단독 검증 (사용자 수동):
 *   1. ai_to_pdf_input.json 임시 작성 (input_path = PostScript AI, output_path = .tmp.ai)
 *   2. Illustrator에서 File → Scripts → Other Script... → ai_to_pdf.jsx 선택
 *   3. ai_to_pdf_result.json 확인 (success: true, output_path 정상 생성)
 *   4. 생성된 .tmp.ai의 첫 5바이트가 "%PDF-"인지 확인 (헤더 검증)
 */

// 왜 IIFE(즉시 실행 함수)로 감싸는가:
//   ExtendScript 최상위 스크립트에서 `return`은 동작이 보장되지 않는다.
//   함수 안에 넣고 마지막 줄에서 호출하면 모든 실행 경로에서 return이 정상 동작.
(function main() {

    // (1) 스크립트가 위치한 폴더에서 입출력 JSON 경로 계산
    //     File($.fileName)은 현재 실행 중인 .jsx 파일의 절대 경로를 가진다.
    var scriptFile = new File($.fileName);
    var scriptDir = scriptFile.parent;
    var inputJsonPath = scriptDir + "/ai_to_pdf_input.json";
    var resultJsonPath = scriptDir + "/ai_to_pdf_result.json";

    // (2) 결과 JSON을 한 줄로 직렬화해서 같은 폴더에 쓰는 헬퍼
    //     호출 측(Tauri/프론트)이 이 파일을 읽어 성공/실패를 판정한다.
    function writeResult(obj) {
        var f = new File(resultJsonPath);
        f.encoding = "UTF-8";
        f.open("w");
        f.write(JSON.stringify(obj));
        f.close();
    }

    // (3) 메인 try/catch — 어떤 예외가 나도 result JSON은 반드시 작성한다.
    try {
        // (3-1) 입력 JSON 파일 존재 검증
        var inputFile = new File(inputJsonPath);
        if (!inputFile.exists) {
            writeResult({
                success: false,
                error: "ai_to_pdf_input.json 파일이 없습니다: " + inputJsonPath
            });
            return;
        }

        // (3-2) 입력 JSON 읽기 + 파싱
        //       ExtendScript는 CC 2014+에서 JSON.parse/stringify 기본 지원.
        inputFile.encoding = "UTF-8";
        inputFile.open("r");
        var jsonStr = inputFile.read();
        inputFile.close();

        var input;
        try {
            input = JSON.parse(jsonStr);
        } catch (parseErr) {
            writeResult({
                success: false,
                error: "ai_to_pdf_input.json 파싱 실패: " + (parseErr && parseErr.message ? parseErr.message : String(parseErr))
            });
            return;
        }

        // (3-3) 필수 필드 검증
        if (!input || !input.input_path || !input.output_path) {
            writeResult({
                success: false,
                error: "input_path 또는 output_path 필드가 누락되었습니다"
            });
            return;
        }

        // (3-4) 입력 AI 파일 존재 검증 + 크기 측정
        //       File 객체는 슬래시(/)와 백슬래시(\) 모두 자동 처리.
        var aiFile = new File(input.input_path);
        if (!aiFile.exists) {
            writeResult({
                success: false,
                error: "입력 AI 파일이 존재하지 않음: " + input.input_path
            });
            return;
        }
        var inputSize = aiFile.length;

        // (4) Illustrator로 열기
        //     app.open()은 실패 시 null 반환 또는 예외 throw — 둘 다 대응한다.
        var doc = app.open(aiFile);
        if (!doc) {
            writeResult({
                success: false,
                error: "Illustrator app.open 실패: " + input.input_path
            });
            return;
        }

        // (5) try/finally로 doc.close 보장
        //     예외가 나도 문서를 반드시 닫아야 다음 호출에서 Illustrator가 잠기지 않음.
        try {
            // (5-1) PDFSaveOptions 설정
            //       lessons.md [2026-04-21] 외부 63개 실증: ACROBAT5(PDF 1.4)가 PyMuPDF 호환 검증됨.
            //       grading-v1-backup.jsx는 ACROBAT7 사용했지만 우리는 임시 변환이라 가장 보수적 선택.
            var pdfOpts = new PDFSaveOptions();

            // PDF 1.4 호환 (Acrobat 5) — PyMuPDF가 가장 안정적으로 읽는 형식
            pdfOpts.compatibility = PDFCompatibility.ACROBAT5;

            // 편집 가능성 보존 안 함 → 파일 크기 절감 (임시 변환이므로 편집 불필요)
            pdfOpts.preserveEditability = false;

            // 썸네일 생성 안 함 → 변환 속도 향상
            pdfOpts.generateThumbnails = false;

            // 색상 변환 안 함 → 원본 CMYK/RGB 그대로 유지 (PyMuPDF가 그대로 SVG로 변환)
            pdfOpts.colorConversionID = ColorConversion.None;
            pdfOpts.colorDestinationID = ColorDestination.None;

            // 트림마크 없음 — 인쇄용이 아니라 SVG 변환 중간 산출물
            pdfOpts.trimMarks = false;

            // (5-2) 출력 파일 객체 + saveAs 실행
            var outFile = new File(input.output_path);
            doc.saveAs(outFile, pdfOpts);

            // (5-3) 출력 파일 크기 측정 (저장 직후 File.length 갱신됨)
            //       outFile 객체를 새로 생성해 length 캐싱 문제 회피.
            var outFileFresh = new File(input.output_path);
            var outputSize = outFileFresh.length;

            // (5-4) 성공 결과 작성
            writeResult({
                success: true,
                output_path: input.output_path,
                input_size: inputSize,
                output_size: outputSize
            });

        } finally {
            // (6) 문서 닫기 — 변경사항 저장하지 않음 (이미 saveAs로 별도 파일에 저장 완료)
            //     close 자체에서 예외가 나도 무시 (이미 결과 작성됨)
            try {
                doc.close(SaveOptions.DONOTSAVECHANGES);
            } catch (closeErr) {
                // 무시 — close 실패는 결과에 영향 없음
            }
        }

    } catch (e) {
        // (7) 최상위 예외 처리 — 어떤 단계에서 터졌든 result JSON 반드시 작성
        var errMsg = (e && e.message) ? e.message : String(e);
        var errLine = (e && e.line) ? " (line " + e.line + ")" : "";
        writeResult({
            success: false,
            error: "JSX 실행 중 오류: " + errMsg + errLine
        });
    }

})();
