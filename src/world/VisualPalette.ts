/**
 * 게임 장면의 색상·안개·조명 토큰을 한 곳에서 관리한다.
 * 물리 계수나 트랙 판정에는 사용하지 않으며, 세 장면의 시각적 기준선만 공유한다.
 */

/** 저폴리 트랙과 HUD가 같은 대비 규칙을 사용하도록 하는 공통 팔레트다. */
export const VISUAL_PALETTE = {
  track: {
    road: "#292d2c",
    grass: "#3c5939",
    curb: "#d25f58",
    wallOuter: "#b7a68d",
    wallInner: "#c99d51",
    wallTop: "#ddc58a",
    startFinish: "#f7f8fa",
    brakeMarker: "#ffcf5b",
    checkpoint: "#a6dbe3",
  },
  scene: {
    background: "#b96d6e",
    fog: "#b96d6e",
    skyLight: "#e28f7e",
    groundLight: "#324c38",
    ambientLight: "#ffd7a1",
    sunLight: "#ffd19a",
    fillLight: "#e28e64",
  },
  hud: {
    panel: "#071117e6",
    panelBorder: "#82e8ed40",
    primary: "#43d9e8",
    secondary: "#ffbe55",
    danger: "#ff748c",
    text: "#effcff",
    muted: "#8aa5ad",
  },
} as const;

/** 장면별로 미세 조정할 수 있지만, 모든 수치는 렌더링 전용 초기 가정이다. */
export type VisualSceneVariant = "training" | "driving" | "weekend";
