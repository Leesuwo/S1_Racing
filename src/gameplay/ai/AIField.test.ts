/** M9 필드 프로필이 재생 가능한 고유 ID와 AI별 시드를 만드는지 검증한다. */
import { describe, expect, it } from "vitest";
import { createAIFieldProfiles } from "./AIField";

describe("AIField", () => {
  /** 같은 그리드 크기는 언제나 같은 실력대·시드 배치를 만들어야 한다. */
  it("creates deterministic unique field profiles", () => {
    const first = createAIFieldProfiles(6);
    const second = createAIFieldProfiles(6);

    expect(first).toEqual(second);
    expect(new Set(first.map((profile) => profile.id)).size).toBe(6);
    expect(new Set(first.map((profile) => profile.config.randomSeed)).size).toBe(6);
  });
});
