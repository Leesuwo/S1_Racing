import { describe, expect, it } from "vitest";
import { detectWebGL2 } from "./webgl2";

describe("detectWebGL2", () => {
  it("returns a structured result when the browser context is unavailable", () => {
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
