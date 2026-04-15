/**
 * 앱 진입점
 * BrowserRouter로 라우팅을 감싸고, 각 경로에 페이지 컴포넌트를 매핑.
 * "/" 접속 시 자동으로 "/pattern" (1단계)으로 리다이렉트.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import App from "./App";
import PatternManage from "./pages/PatternManage";
import DesignUpload from "./pages/DesignUpload";
import SizeSelect from "./pages/SizeSelect";
import FileGenerate from "./pages/FileGenerate";
import Settings from "./pages/Settings";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* App 레이아웃 안에 페이지를 중첩(nested) 라우팅 */}
        <Route path="/" element={<App />}>
          {/* 루트 접속 시 패턴 관리 페이지로 자동 이동 */}
          <Route index element={<Navigate to="/pattern" replace />} />
          <Route path="pattern" element={<PatternManage />} />
          <Route path="design" element={<DesignUpload />} />
          <Route path="size" element={<SizeSelect />} />
          <Route path="generate" element={<FileGenerate />} />
          {/* 설정 페이지 (워크플로우와 별개) */}
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
