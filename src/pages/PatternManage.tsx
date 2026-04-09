/**
 * PatternManage 페이지
 * 1단계: SVG 패턴(옷 조각) 프리셋을 등록하고 관리하는 페이지.
 * 현재는 placeholder만 표시. 추후 SVG 파일 업로드/미리보기 기능 구현 예정.
 */

function PatternManage() {
  return (
    <div className="page">
      <h1 className="page__title">패턴 관리</h1>
      <p className="page__description">
        SVG 형식의 옷 패턴(조각) 파일을 등록하고 관리합니다.
        등록된 패턴은 프리셋으로 저장되어 반복 사용할 수 있습니다.
      </p>
      <div className="page__placeholder">
        <div className="page__placeholder-icon">✂</div>
        <p className="page__placeholder-text">
          패턴 관리 기능이 여기에 구현될 예정입니다
        </p>
      </div>
    </div>
  );
}

export default PatternManage;
