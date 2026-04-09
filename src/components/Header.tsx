/**
 * Header 컴포넌트
 * 앱 최상단에 표시되는 헤더 바.
 * Tauri 윈도우 드래그 영역 역할도 겸함 (CSS의 -webkit-app-region: drag)
 */

function Header() {
  return (
    <header className="header">
      {/* 앱 아이콘 - 승화전사/패턴을 상징 */}
      <span className="header__icon">◆</span>
      <span className="header__title">Grader</span>
      <span className="header__subtitle">유니폼 패턴 자동 생성</span>
    </header>
  );
}

export default Header;
