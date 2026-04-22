/**
 * App 컴포넌트 (루트)
 * 전체 레이아웃 구조: Header + Sidebar + Content(라우팅) + StatusBar
 * Outlet으로 메인 영역에 각 페이지를 렌더링한다.
 *
 * 추가 책임 (Phase C — 자동 업데이트):
 *   - 앱 마운트 시 1회 업데이트 체크 (useAutoUpdateCheck에 autoCheck=true)
 *   - status === 'available'일 때 UpdateModal 표시
 *   - 로그인 흐름 없으므로 App.tsx가 곧 "앱 시작점"
 */
import { Outlet } from "react-router-dom";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import UpdateModal from "./components/UpdateModal";
import { useAutoUpdateCheck } from "./hooks/useAutoUpdateCheck";
import "./App.css";

function App() {
  // 앱 시작 시 자동 체크. autoCheck=true는 **App.tsx 한 곳에서만** 사용.
  // Settings의 UpdateSection은 autoCheck=false로 구독만 한다.
  const updateState = useAutoUpdateCheck(true);

  // 새 버전 발견됐고 아직 사용자가 "나중에" 안 눌렀을 때만 모달 렌더.
  // dismissed 상태가 되면 조건 false가 되어 자동으로 사라진다.
  const showUpdateModal =
    updateState.status === "available" &&
    updateState.result !== null &&
    updateState.result.kind === "available";

  return (
    <div className="app-layout">
      <Header />
      <Sidebar />
      {/* Outlet = react-router가 현재 경로에 맞는 페이지를 여기에 렌더링 */}
      <main className="content">
        <Outlet />
      </main>
      <StatusBar />

      {/* 업데이트 팝업 — 새 버전 있을 때만 표시. ESC/백드롭으로 닫힘 */}
      {showUpdateModal && updateState.result?.kind === "available" && (
        <UpdateModal update={updateState.result.update} />
      )}
    </div>
  );
}

export default App;
