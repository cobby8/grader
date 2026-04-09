/**
 * Sidebar 컴포넌트
 * 좌측 네비게이션 바. 워크플로우 4단계를 순서대로 표시.
 * NavLink를 사용하여 현재 페이지 하이라이트 처리.
 */
import { NavLink } from "react-router-dom";

// 네비게이션 항목 정의 - 워크플로우 순서와 동일
const navItems = [
  { path: "/pattern",  step: "1", label: "패턴 관리",    icon: "✂" },
  { path: "/design",   step: "2", label: "디자인 등록",  icon: "🎨" },
  { path: "/size",     step: "3", label: "사이즈 선택",  icon: "📏" },
  { path: "/generate", step: "4", label: "파일 생성",    icon: "📄" },
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__section-title">작업 단계</div>
      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            // NavLink는 현재 경로와 일치하면 isActive=true를 전달
            className={({ isActive }) =>
              `sidebar__link${isActive ? " sidebar__link--active" : ""}`
            }
          >
            <span className="sidebar__link-step">{item.step}</span>
            <span className="sidebar__link-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
