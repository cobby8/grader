/**
 * StatusBar 컴포넌트
 * 하단 상태 표시줄. 현재 상태, 버전 정보 등 표시.
 * 추후 작업 진행률이나 에러 메시지를 표시할 예정.
 */

function StatusBar() {
  return (
    <footer className="statusbar">
      <div className="statusbar__left">
        {/* 초록 점 = 시스템 정상 */}
        <span className="statusbar__dot" />
        <span>준비됨</span>
      </div>
      <div className="statusbar__right">
        <span>v0.1.0</span>
      </div>
    </footer>
  );
}

export default StatusBar;
