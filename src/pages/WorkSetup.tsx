/**
 * WorkSetup 페이지 (1단계: 작업 선택)
 *
 * 왜 이 페이지가 필요한가:
 *   - 기존 "디자인 등록" 흐름은 AI/PDF 파일을 앱 저장소(AppData)에 복사해 재고처럼 쌓는 구조였다.
 *   - 바이브 코더 사용자는 "1회성 작업"을 원한다 → 작업 폴더와 기준 AI만 고르면 바로 그레이딩 시작.
 *   - 이 페이지는 세션(sessionStorage)만 생성하고, 파일 복사/등록 없이 경로만 기억한다.
 *
 * 역할:
 *   1. 작업 폴더(결과물 저장 위치) 선택
 *   2. 기준 AI 파일(그레이딩 원본) 선택
 *   3. 두 값이 모두 채워지면 "다음: 패턴 선택" 버튼 활성화 → /pattern 이동
 *
 * 주의:
 *   - stat(파일 크기 조회)는 tauri fs 권한이 없으면 실패할 수 있다. 표시용일 뿐이므로 조용히 무시.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { loadWorkSession, saveWorkSession } from "../stores/sessionStore";

function WorkSetup() {
  const navigate = useNavigate();

  // 선택된 작업 폴더 절대경로
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

  /** 폴더 선택 다이얼로그 — Tauri dialog 플러그인 사용 */
  async function handlePickFolder() {
    setError("");
    try {
      const dir = await open({
        directory: true,
        multiple: false,
        title: "작업 폴더 선택",
      });
      if (dir) setWorkFolder(dir as string);
    } catch (e) {
      setError(`폴더 선택 오류: ${e}`);
    }
  }

  /** 기준 AI 파일 선택 — .ai 확장자만 필터 */
  async function handlePickAi() {
    setError("");
    try {
      const file = await open({
        multiple: false,
        title: "기준 AI 파일 선택",
        filters: [{ name: "Adobe Illustrator", extensions: ["ai"] }],
      });
      if (!file) return;
      setBaseAiPath(file as string);

      // 파일 크기 조회 — 실패해도 UI 크기 표시만 안 나올 뿐이므로 조용히 무시
      try {
        const info = await stat(file as string);
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
    if (!workFolder || !baseAiPath) {
      setError("작업 폴더와 기준 AI 파일을 모두 선택해주세요.");
      return;
    }
    saveWorkSession({
      workFolder,
      baseAiPath,
      createdAt: Date.now(),
    });
    navigate("/pattern");
  }

  return (
    <div className="page">
      <h1 className="page__title">작업 선택</h1>
      <p className="page__description">
        그레이딩할 작업의 폴더와 기준 디자인 AI 파일을 선택하세요.
        결과물은 작업 폴더에 자동 저장됩니다.
      </p>

      {/* 작업 폴더 선택 */}
      <section className="work-section">
        <label className="work-label">📁 작업 폴더</label>
        <div className="work-input-row">
          <input
            className="work-input"
            value={workFolder}
            readOnly
            placeholder="폴더를 선택하세요"
          />
          <button className="btn" onClick={handlePickFolder}>찾기</button>
        </div>
      </section>

      {/* 기준 AI 파일 선택 */}
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

      {error && <div className="design-error">{error}</div>}

      {/* 하단 다음 버튼 — size-footer 클래스는 기존 SizeSelect와 동일한 고정 푸터 스타일 재활용 */}
      <div className="size-footer">
        <button
          className="btn btn--primary btn--large"
          onClick={handleNext}
          disabled={!workFolder || !baseAiPath}
        >
          다음: 패턴 선택 →
        </button>
      </div>
    </div>
  );
}

export default WorkSetup;
