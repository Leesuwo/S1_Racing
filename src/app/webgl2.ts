export interface WebGL2Support {
  supported: boolean;
  reason?: string;
}

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
