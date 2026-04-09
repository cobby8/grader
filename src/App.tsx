/**
 * App 컴포넌트 (루트)
 * 전체 레이아웃 구조: Header + Sidebar + Content(라우팅) + StatusBar
 * Outlet으로 메인 영역에 각 페이지를 렌더링한다.
 */
import { Outlet } from "react-router-dom";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import "./App.css";

function App() {
  return (
    <div className="app-layout">
      <Header />
      <Sidebar />
      {/* Outlet = react-router가 현재 경로에 맞는 페이지를 여기에 렌더링 */}
      <main className="content">
        <Outlet />
      </main>
      <StatusBar />
    </div>
  );
}

export default App;
