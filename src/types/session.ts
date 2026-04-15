/**
 * WorkSession 타입 정의
 *
 * 왜 sessionStorage를 쓰는가:
 *   - 기존 designs.json 방식(AppData에 영구 저장)은 누적되는 재고가 된다.
 *   - 작업은 "한 번의 그레이딩 시연 단위"이므로 앱 재시작 시 초기화되는 것이 오히려 자연스럽다.
 *   - sessionStorage는 탭(창)이 닫히면 사라진다 → 1회성 세션과 의미가 맞는다.
 *
 * 어떤 값을 담는가:
 *   - workFolder:      사용자가 선택한 작업 폴더 절대경로 (결과물이 저장될 위치)
 *   - baseAiPath:      기준 AI 파일(Illustrator) 절대경로 (그레이딩 원본)
 *   - selectedPresetId?: 2단계에서 선택한 패턴 프리셋 ID (Phase 2에서 채움)
 *   - baseSize?:       파일명에서 자동 추출한 기준 사이즈 (예: "XL"). OrderGenerate의 초기값으로 사용.
 *                       사용자가 OrderGenerate에서 수동으로 바꿀 수 있으며, 세션엔 파일명 기반 힌트만 저장.
 *   - createdAt:       세션 생성 시각 (ms). 디버깅/표시용.
 */
export interface WorkSession {
  workFolder: string;
  baseAiPath: string;
  selectedPresetId?: string;
  baseSize?: string;
  createdAt: number;
}
