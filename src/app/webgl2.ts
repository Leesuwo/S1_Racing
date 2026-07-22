export interface WebGL2Support {
  supported: boolean;
  reason?: string;
}

/**
 * 렌더링을 시작하기 전에 WebGL2 컨텍스트 생성 가능 여부를 확인한다.
 * 컨텍스트 생성 실패는 브라우저·GPU 상태에 따라 예외 또는 null로 나타날 수 있어
 * 두 경로를 모두 사용자에게 설명 가능한 실패 상태로 변환한다.
 */
export function detectWebGL2(
  documentRef: Document = document,
): WebGL2Support {
  const canvas = documentRef.createElement("canvas");

  try {
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
