/**
 * 디자인 스튜디오의 DOM과 WebGL 장면이 공유하는 가벼운 설정 데이터다.
 * Three.js 의존성이 없는 별도 모듈로 두어 일반 주행 화면의 초기 bundle에 차량 geometry가 섞이지 않게 한다.
 */

/** 차량 디자인 검토 화면에서 선택할 카메라 방향이다. */
export type DesignStudioView = "hero" | "front" | "side" | "rear";

/** 차량 디자인 검토 화면에서 사용할 무표식 도장 프리셋의 식별자다. */
export type DesignStudioPaintId = "crimson" | "telemetry" | "graphite";

/** 디자인 프리셋은 실제 팀 리버리가 아닌 S1 검토용 색상 토큰이다. */
export const DESIGN_STUDIO_PAINTS: Readonly<Record<DesignStudioPaintId, {
  label: string;
  bodyColor: string;
  accentColor: string;
  emissiveColor: string;
}>> = {
  crimson: { label: "S1 Crimson", bodyColor: "#d9364d", accentColor: "#f2c66d", emissiveColor: "#6c1524" },
  telemetry: { label: "Telemetry Cyan", bodyColor: "#32c8e8", accentColor: "#ffbe55", emissiveColor: "#075e75" },
  // 실제 RB8 리버리의 색·그래픽을 복제하지 않는 무표식 차체 대비용 슬레이트 블루다.
  graphite: { label: "Midnight Form Study", bodyColor: "#31577f", accentColor: "#b9cfdd", emissiveColor: "#102a48" },
} as const;

/** 뷰포트별 초기 카메라 위치(m)다. 값은 렌더링 전용 initial_assumption이다. */
export const DESIGN_STUDIO_CAMERA: Readonly<Record<DesignStudioView, {
  label: string;
  position: readonly [number, number, number];
}>> = {
  // 전방(-Z) 3/4 시점은 스텝 노즈·전륜·콕핏·코크 보틀을 한 번에 비교하는 기본 검토 구도다.
  hero: { label: "3/4 VIEW", position: [5.35, 2.15, -6.95] },
  front: { label: "FRONT", position: [0, 2.05, -8.4] },
  side: { label: "SIDE", position: [9.1, 1.95, 0.3] },
  rear: { label: "REAR", position: [0, 2.25, 8.2] },
};

/** 카메라 시점 설정에서 사용자에게 표시할 라벨을 반환한다. */
export function getDesignStudioViewLabel(view: DesignStudioView): string {
  return DESIGN_STUDIO_CAMERA[view].label;
}
