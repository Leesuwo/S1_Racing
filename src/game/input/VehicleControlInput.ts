export interface VehicleControlInput {
  steering: number;
  throttle: number;
  brake: number;
  clutch: number;
  shiftUp: boolean;
  shiftDown: boolean;
  overtakeMode: boolean;
  activeAero: boolean;
}

export const neutralVehicleControlInput = (): VehicleControlInput => ({
  steering: 0,
  throttle: 0,
  brake: 0,
  clutch: 0,
  shiftUp: false,
  shiftDown: false,
  overtakeMode: false,
  activeAero: false,
});

export function clampAnalogInput(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
