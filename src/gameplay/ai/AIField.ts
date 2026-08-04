/**
 * M9 AI 필드의 실력·일관성·성향 프리셋을 생성한다.
 * 모든 프로필은 SingleOpponentAI의 입력 파라미터만 바꾸며 VehicleSimulation의
 * 위치·그립·출력 상태를 직접 바꾸지 않는다.
 */
import type { SingleOpponentAIConfig } from "./SingleOpponentAI";

/** AI 참가자를 replay·HUD에서 식별하는 읽기 전용 프로필이다. */
export interface AIFieldProfile {
  id: string;
  label: string;
  /** 코너 목표 속도와 실수 빈도를 정하는 입력 제어 파라미터다. */
  config: Partial<SingleOpponentAIConfig>;
}

/** 기본 필드에 순환 배치하는 네 가지 결정적 실력대다. */
const PROFILE_TEMPLATES: readonly AIFieldProfile[] = [
  {
    id: "academy",
    label: "ACADEMY",
    config: { cornerSpeedScale: 0.68, mistakeRatePerMinute: 3.2, mistakeThrottleScale: 0.74 },
  },
  {
    id: "club",
    label: "CLUB",
    config: { cornerSpeedScale: 0.72, mistakeRatePerMinute: 2.1, mistakeThrottleScale: 0.8 },
  },
  {
    id: "pro",
    label: "PRO",
    config: { cornerSpeedScale: 0.77, mistakeRatePerMinute: 1.1, mistakeThrottleScale: 0.87 },
  },
  {
    id: "elite",
    label: "ELITE",
    config: { cornerSpeedScale: 0.81, mistakeRatePerMinute: 0.45, mistakeThrottleScale: 0.92 },
  },
] as const;

/** 요청한 AI 수만큼 순환 프로필을 고유 ID·결정적 시드와 함께 생성한다. */
export function createAIFieldProfiles(count: number): readonly AIFieldProfile[] {
  const safeCount = Math.max(0, Math.floor(count));
  return Array.from({ length: safeCount }, (_, index) => {
    const template = PROFILE_TEMPLATES[index % PROFILE_TEMPLATES.length] ?? PROFILE_TEMPLATES[0];
    const slot = index + 1;
    return {
      id: template.id + "-" + String(slot),
      label: template.label + " " + String(slot),
      config: {
        ...template.config,
        // 시드는 AI별 제어 이벤트만 구분하며 같은 grid에서는 항상 같은 실수 시퀀스를 만든다.
        randomSeed: 10_003 + slot * 7_919,
      },
    };
  });
}
