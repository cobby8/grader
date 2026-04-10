/**
 * 생성 요청 저장소 (generationStore)
 *
 * SizeSelect → FileGenerate 페이지로 넘어갈 때 사용자가 선택한 내용
 * (프리셋/디자인/기준사이즈/타겟사이즈)을 전달하기 위한 간단한 상태 저장소.
 *
 * 구현 방식:
 *   - sessionStorage 사용 (브라우저 세션 동안만 유지, 앱 종료 시 소멸)
 *   - 별도 라이브러리(Zustand/Recoil 등) 미사용
 *   - 페이지 새로고침에도 데이터 유지됨
 *
 * 실제 디자인 PDF와 프리셋 데이터 자체는 별도 스토어(designStore/presetStore)에서
 * 매번 로드하므로 여기에는 "선택 식별자"만 저장한다.
 */

import type { GenerationRequest } from "../types/generation";

/** sessionStorage 키 */
const STORAGE_KEY = "grader.generation.request";

/**
 * 현재 저장된 생성 요청을 불러온다.
 * 저장된 데이터가 없거나 파싱 실패 시 null 반환.
 */
export function loadGenerationRequest(): GenerationRequest | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GenerationRequest;
  } catch (err) {
    console.error("생성 요청 로드 실패:", err);
    return null;
  }
}

/**
 * 생성 요청을 sessionStorage에 저장한다.
 * 페이지 이동 후에도 FileGenerate 페이지에서 동일 데이터를 읽을 수 있다.
 */
export function saveGenerationRequest(req: GenerationRequest): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(req));
  } catch (err) {
    // sessionStorage가 꽉 찬 경우 등: 콘솔만 찍고 throw하지 않음
    console.error("생성 요청 저장 실패:", err);
  }
}

/** 저장된 생성 요청을 삭제한다. */
export function clearGenerationRequest(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
