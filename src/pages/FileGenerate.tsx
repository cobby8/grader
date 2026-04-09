/**
 * FileGenerate 페이지
 * 4단계: 선택한 사이즈별로 그레이딩된 PDF 파일을 생성하는 페이지.
 * 현재는 placeholder만 표시. 추후 생성 버튼 + 진행바 + 결과 목록 구현 예정.
 */

function FileGenerate() {
  return (
    <div className="page">
      <h1 className="page__title">파일 생성</h1>
      <p className="page__description">
        등록된 패턴과 디자인을 기반으로 사이즈별 그레이딩 PDF 파일을 자동 생성합니다.
        CMYK 색상이 유지됩니다.
      </p>
      <div className="page__placeholder">
        <div className="page__placeholder-icon">📄</div>
        <p className="page__placeholder-text">
          파일 생성 기능이 여기에 구현될 예정입니다
        </p>
      </div>
    </div>
  );
}

export default FileGenerate;
