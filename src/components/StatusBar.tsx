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
        {/* 왜 __APP_VERSION__: 하드코딩 대신 빌드 타임에 package.json version으로 자동 치환.
            예전엔 v0.1.0이 박혀있어 1.0.0 배포 후에도 화면엔 0.1.0이 떴음. */}
        <span>v{__APP_VERSION__}</span>
      </div>
    </footer>
  );
}

export default StatusBar;
