/**
 * 앱 진입점
 * BrowserRouter로 라우팅을 감싸고, 각 경로에 페이지 컴포넌트를 매핑.
 *
 * 재설계 후 라우팅 (3단계):
 *   /work     → WorkSetup      (1단계: 작업 선택)
 *   /pattern  → PatternManage  (2단계: 패턴)
 *   /generate → OrderGenerate  (3단계: 주문 생성)   ← Phase 4에서 통합됨
 *
 * 하위 호환:
 *   /design → /work 리다이렉트
 *   /size   → /generate 리다이렉트
 *   "/" 접속 시 /work로 진입하는 것이 자연스러운 신규 흐름.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import App from "./App";
import WorkSetup from "./pages/WorkSetup";
import PatternManage from "./pages/PatternManage";
// Phase 4: FileGenerate(구) → OrderGenerate(신) 로 교체.
// 구 FileGenerate/SizeSelect 파일은 Phase 5에서 삭제 예정.
import OrderGenerate from "./pages/OrderGenerate";
import Settings from "./pages/Settings";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* App 레이아웃 안에 페이지를 중첩(nested) 라우팅 */}
        <Route path="/" element={<App />}>
          {/* 루트 접속 시 작업 선택 페이지로 자동 이동 (신규 1단계) */}
          <Route index element={<Navigate to="/work" replace />} />
          <Route path="work" element={<WorkSetup />} />
          <Route path="pattern" element={<PatternManage />} />
          <Route path="generate" element={<OrderGenerate />} />

          {/* 하위 호환: 구 경로는 신규 경로로 리다이렉트 */}
          <Route path="design" element={<Navigate to="/work" replace />} />
          <Route path="size" element={<Navigate to="/generate" replace />} />

          {/* 설정 페이지 (워크플로우와 별개) */}
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
