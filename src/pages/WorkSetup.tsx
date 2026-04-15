/**
 * WorkSetup 페이지 (1단계: 작업 선택)
 *
 * 왜 이 페이지가 필요한가:
 *   - 기존 "디자인 등록" 흐름은 AI/PDF 파일을 앱 저장소(AppData)에 복사해 재고처럼 쌓는 구조였다.
 *   - 바이브 코더 사용자는 "1회성 작업"을 원한다 → 기준 AI 파일만 고르면 바로 그레이딩 시작.
 *   - 이 페이지는 세션(sessionStorage)만 생성하고, 파일 복사/등록 없이 경로만 기억한다.
 *
 * UX 단순화 (2026-04-15):
 *   - 기존엔 폴더 + AI 파일을 따로 선택 → 번거로움
 *   - 이제는 **AI 파일 하나만 선택** → 파일의 부모 폴더가 자동으로 작업 폴더가 됨
 *   - 사용자는 파일만 고르면 되고, 작업 폴더는 확인용으로만 표시
 *
 * 역할:
 *   1. 기준 AI 파일 선택 (부모 폴더가 자동으로 작업 폴더가 됨)
 *   2. "다음: 패턴 선택" 버튼 활성화 → /pattern 이동
 *
 * 주의:
 *   - stat(파일 크기 조회)는 tauri fs 권한이 없으면 실패할 수 있다. 표시용일 뿐이므로 조용히 무시.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { loadWorkSession, saveWorkSession } from "../stores/sessionStore";
import { extractSizeFromFilename } from "../types/pattern";

/**
 * 파일 경로에서 부모 폴더 경로를 추출한다.
 * Windows(\)와 Unix(/) 구분자 모두 지원.
 * 비유: "서울시 강남구 역삼동 123번지" 에서 "123번지"를 떼면 "서울시 강남구 역삼동"이 남는 것과 같다.
 */
function getParentFolder(filePath: string): string {
  const lastBackslash = filePath.lastIndexOf("\\");
  const lastSlash = filePath.lastIndexOf("/");
  const lastSep = Math.max(lastBackslash, lastSlash);
  return lastSep > 0 ? filePath.substring(0, lastSep) : filePath;
}

function WorkSetup() {
  const navigate = useNavigate();

  // 선택된 작업 폴더 절대경로 (AI 파일 선택 시 자동으로 부모 폴더로 설정)
  const [workFolder, setWorkFolder] = useState<string>("");
  // 선택된 기준 AI 파일 절대경로
  const [baseAiPath, setBaseAiPath] = useState<string>("");
  // AI 파일 크기 (바이트). 0이면 표시하지 않는다.
  const [baseAiSize, setBaseAiSize] = useState<number>(0);
  // 사용자 에러 메시지
  const [error, setError] = useState<string>("");

  // 페이지 진입 시 기존 세션 복원 (중간에 돌아왔을 때 선택값 유지)
  // 왜 필요한가: 사용자가 /pattern에서 "뒤로" 오면 빈 폼이 뜨면 불편. 기존 선택을 보여준다.
  useEffect(() => {
    const s = loadWorkSession();
    if (s) {
      setWorkFolder(s.workFolder || "");
      setBaseAiPath(s.baseAiPath || "");
    }
  }, []);

  /**
   * 기준 AI 파일 선택 — .ai 확장자만 필터.
   * 선택된 파일의 부모 폴더가 자동으로 작업 폴더가 된다.
   */
  async function handlePickAi() {
    setError("");
    try {
      const file = await open({
        multiple: false,
        title: "기준 AI 파일 선택",
        filters: [{ name: "Adobe Illustrator", extensions: ["ai"] }],
        // 이전 세션의 작업 폴더가 있으면 그 위치에서 탐색 시작
        defaultPath: workFolder || undefined,
      });
      if (!file) return;
      const filePath = file as string;
      setBaseAiPath(filePath);

      // 핵심: 선택된 파일의 부모 폴더를 자동으로 작업 폴더로 설정
      const parentFolder = getParentFolder(filePath);
      setWorkFolder(parentFolder);

      // 파일 크기 조회 — 실패해도 UI 크기 표시만 안 나올 뿐이므로 조용히 무시
      try {
        const info = await stat(filePath);
        setBaseAiSize(info.size);
      } catch {
        /* fs 권한 없음 등. 표시용이라 무시 */
      }
    } catch (e) {
      setError(`파일 선택 오류: ${e}`);
    }
  }

  /** "다음" 버튼 — 세션 저장 후 /pattern 이동 */
  function handleNext() {
    if (!baseAiPath || !workFolder) {
      setError("기준 AI 파일을 선택해주세요.");
      return;
    }
    // 파일명에서 사이즈 자동 추출 (예: "농구_V넥_XL.ai" → "XL")
    // 추출 실패 시 undefined로 저장 → OrderGenerate가 기본값 "L"로 보정
    const detectedSize = extractSizeFromFilename(baseAiPath);
    saveWorkSession({
      workFolder,
      baseAiPath,
      baseSize: detectedSize || undefined,
      createdAt: Date.now(),
    });
    navigate("/pattern");
  }

  return (
    <div className="page">
      <h1 className="page__title">작업 선택</h1>
      <p className="page__description">
        그레이딩할 기준 AI 파일을 선택하세요. 파일이 있는 폴더가 자동으로 작업 폴더로 지정되며,
        결과물은 해당 폴더에 자동 저장됩니다.
      </p>

      {/* 기준 AI 파일 선택 — 사용자가 실제로 조작하는 유일한 입력 */}
      <section className="work-section">
        <label className="work-label">🎨 기준 AI 파일</label>
        <div className="work-input-row">
          <input
            className="work-input"
            value={baseAiPath}
            readOnly
            placeholder="AI 파일을 선택하세요"
          />
          <button className="btn" onClick={handlePickAi}>찾기</button>
        </div>
        {baseAiSize > 0 && (
          <div className="work-hint">
            크기: {(baseAiSize / (1024 * 1024)).toFixed(1)} MB
          </div>
        )}
      </section>

      {/* 작업 폴더 자동 표시 — 사용자 확인용 (AI 파일 선택 시 자동 채워짐) */}
      <section className="work-section">
        <label className="work-label">📁 작업 폴더 (자동)</label>
        <div className="work-input-row">
          <input
            className="work-input"
            value={workFolder}
            readOnly
            placeholder="AI 파일을 먼저 선택하세요"
            style={{ backgroundColor: workFolder ? undefined : "var(--color-bg-content, #f5f5f5)" }}
          />
        </div>
        {workFolder && (
          <div className="work-hint">
            결과물이 이 폴더에 저장됩니다.
          </div>
        )}
      </section>

      {error && <div className="design-error">{error}</div>}

      {/* 하단 다음 버튼 — size-footer 클래스는 기존 SizeSelect와 동일한 고정 푸터 스타일 재활용 */}
      <div className="size-footer">
        <button
          className="btn btn--primary btn--large"
          onClick={handleNext}
          disabled={!baseAiPath || !workFolder}
        >
          다음: 패턴 선택 →
        </button>
      </div>
    </div>
  );
}

export default WorkSetup;
