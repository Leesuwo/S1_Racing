import { describe, expect, it } from "vitest";
import { detectWebGL2 } from "./webgl2";

// 실제 GPU를 요구하지 않고 컨텍스트 생성 실패를 구조화된 사용자 오류로 보존하는 계약 테스트다.
describe("detectWebGL2", () => {
  it("returns a structured result when the browser context is unavailable", () => {
    // Vitest 환경에서는 WebGL2를 직접 만들지 않고 브라우저 API의 null 경로만 재현한다.
    const documentRef = {
      createElement: () => ({
        getContext: () => null,
      }),
    } as unknown as Document;

    expect(detectWebGL2(documentRef)).toEqual({
      supported: false,
      reason: "WebGL2 context를 생성할 수 없습니다.",
    });
  });
});
