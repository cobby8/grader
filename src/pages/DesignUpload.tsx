/**
 * DesignUpload 페이지
 * 2단계: PDF 형식의 기준 사이즈 디자인 파일을 등록하는 페이지.
 * 현재는 placeholder만 표시. 추후 PDF 업로드/미리보기 기능 구현 예정.
 */

function DesignUpload() {
  return (
    <div className="page">
      <h1 className="page__title">디자인 등록</h1>
      <p className="page__description">
        PDF 형식의 기준 사이즈 디자인 파일을 등록합니다.
        CMYK 색상이 유지된 PDF 파일을 업로드해 주세요.
      </p>
      <div className="page__placeholder">
        <div className="page__placeholder-icon">🎨</div>
        <p className="page__placeholder-text">
          디자인 등록 기능이 여기에 구현될 예정입니다
        </p>
      </div>
    </div>
  );
}

export default DesignUpload;
