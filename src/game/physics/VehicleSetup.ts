/**
 * 레이스 전 제한형 차량 셋업을 순수 물리 입력 배율로 번역한다.
 * 실제 차량 셋업의 모든 자유도를 모사하지 않고, 브라우저 프로토타입에서 사용자가
 * 주행 특성의 trade-off를 재현 가능하게 비교할 수 있는 작은 경계만 제공한다.
 */

/** 사용자 화면과 replay manifest가 공유하는 셋업 프리셋 식별자다. */
export type VehicleSetupPresetId = "low-downforce" | "balanced" | "high-downforce";

/** 차량 물리에 반영되는 제한형 셋업 값이다. 모든 배율은 initial_assumption이다. */
export interface VehicleSetup {
  /** 저장·리플레이 호환성에 사용하는 안정적인 프리셋 ID다. */
  id: VehicleSetupPresetId;
  /** HUD에 표시하는 프리셋 이름이다. */
  label: string;
  /** 타이어와 손상 배율 뒤에 적용되는 횡그립 배율이다. */
  aeroGripMultiplier: number;
  /** 스로틀 명령에 적용하는 구동 응답 배율이다. */
  enginePowerMultiplier: number;
  /** 브레이크 명령에 적용하는 제동 압력 배율이다. */
  brakePressureMultiplier: number;
}

/** 초기 밸런스 셋업이다. 실제 특정 차량의 계측값이 아닌 simulation_required 기준이다. */
export const DEFAULT_VEHICLE_SETUP: VehicleSetup = {
  id: "balanced",
  label: "BALANCED",
  aeroGripMultiplier: 1,
  enginePowerMultiplier: 1,
  brakePressureMultiplier: 1,
};

/** 사용자가 선택 가능한 제한형 셋업 목록이다. */
export const VEHICLE_SETUP_PRESETS: readonly VehicleSetup[] = [
  {
    id: "low-downforce",
    label: "LOW DOWNFORCE",
    // 직선 응답을 조금 우선하는 대신 코너 그립을 낮춘 initial_assumption이다.
    aeroGripMultiplier: 0.94,
    enginePowerMultiplier: 1.04,
    brakePressureMultiplier: 0.96,
  },
  DEFAULT_VEHICLE_SETUP,
  {
    id: "high-downforce",
    label: "HIGH DOWNFORCE",
    // 코너 안정성을 우선하되, 현재 모델의 단순화를 감추지 않기 위해 배율 폭을 작게 제한한다.
    aeroGripMultiplier: 1.05,
    enginePowerMultiplier: 0.96,
    brakePressureMultiplier: 1.04,
  },
] as const;

/** 프리셋 ID를 유한한 물리 배율이 보장된 독립 객체로 해석한다. */
export function getVehicleSetup(id: VehicleSetupPresetId = DEFAULT_VEHICLE_SETUP.id): VehicleSetup {
  const preset = VEHICLE_SETUP_PRESETS.find((candidate) => candidate.id === id) ?? DEFAULT_VEHICLE_SETUP;
  return { ...preset };
}
