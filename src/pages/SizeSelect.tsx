/**
 * SizeSelect 페이지
 * 3단계: 생성할 사이즈를 선택하는 페이지 (5XS ~ 5XL, 13단계).
 * 현재는 placeholder만 표시. 추후 체크박스 그리드 UI 구현 예정.
 */

function SizeSelect() {
  return (
    <div className="page">
      <h1 className="page__title">사이즈 선택</h1>
      <p className="page__description">
        생성할 사이즈를 선택합니다. 5XS부터 5XL까지 13단계 중 필요한 사이즈를 체크하세요.
      </p>
      <div className="page__placeholder">
        <div className="page__placeholder-icon">📏</div>
        <p className="page__placeholder-text">
          사이즈 선택 기능이 여기에 구현될 예정입니다
        </p>
      </div>
    </div>
  );
}

export default SizeSelect;
