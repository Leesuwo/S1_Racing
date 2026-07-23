/**
 * 브라우저 WebGL2 지원 여부를 UI가 표시할 수 있는 구조화된 결과로
 * 판정하는 애플리케이션 경계 모듈이다.
 */
/** WebGL2 초기화 가능 여부와 실패 시 사용자 안내 사유다. */
export interface WebGL2Support {
  supported: boolean;
  reason?: string;
}

/**
 * 주어진 문서에서 캔버스 WebGL2 컨텍스트를 생성해 지원 여부를 판정한다.
 * @param documentRef 브라우저 문서 또는 테스트용 문서 대역
 */
export function detectWebGL2(
  documentRef: Document = document,
): WebGL2Support {
  // 실제 GPU 컨텍스트 생성까지 확인해야 단순 API 존재 여부를 넘는 검사가 된다.
  const canvas = documentRef.createElement("canvas");

  try {
    // 컨텍스트가 null이면 브라우저·GPU 정책상 WebGL2를 사용할 수 없다.
    const context = canvas.getContext("webgl2");

    if (context) {
      return { supported: true };
    }

    return {
      supported: false,
      reason: "WebGL2 context를 생성할 수 없습니다.",
    };
  } catch {
    return {
      supported: false,
      reason: "브라우저가 WebGL2 초기화를 거부했습니다.",
    };
  }
}
