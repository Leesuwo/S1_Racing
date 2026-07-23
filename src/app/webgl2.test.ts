/**
 * WebGL2 기능 감지의 브라우저 비지원 경로를 검증하는 단위 테스트다.
 */
import { describe, expect, it } from "vitest";
import { detectWebGL2 } from "./webgl2";

describe("detectWebGL2", () => {
  // 브라우저 컨텍스트를 만들 수 없는 환경에서도 UI 계약이 구조화되어야 한다.
  it("returns a structured result when the browser context is unavailable", () => {
    // 실제 DOM 대신 null 컨텍스트만 반환하는 최소 문서 픽스처를 사용한다.
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
