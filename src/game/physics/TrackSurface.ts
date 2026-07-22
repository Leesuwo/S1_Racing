import {
  ASPHALT_SURFACE,
  GRASS_SURFACE,
  type Vec2,
  type VehicleSurface,
} from "./VehiclePhysics";
import {
  sampleTestTrackLocation as sampleTrackLocationData,
  TEST_TRACK_DATA,
  type TestTrackLocation,
} from "../../tracks/TestTrack";

/** 축에 평행한 테스트 트랙의 반폭·반길이 정의다. 단위는 m이다. */
export interface TrackDimensions {
  outerHalfWidthM: number;
  outerHalfLengthM: number;
  innerHalfWidthM: number;
  innerHalfLengthM: number;
}

/** `TEST_TRACK_DATA.surfaceLayout`에서 파생한 구형 표면 샘플러 호환값이다. */
export const TEST_TRACK_DIMENSIONS: TrackDimensions = {
  ...TEST_TRACK_DATA.surfaceLayout,
};

/** 단순 직사각형 레이아웃에서 아스팔트 영역인지 판정한다. 인필드는 잔디로 제외한다. */
export function isOnTestTrackAsphalt(
  position: Vec2,
  dimensions: TrackDimensions = TEST_TRACK_DIMENSIONS,
): boolean {
  const inOuterBounds =
    Math.abs(position.x) <= dimensions.outerHalfWidthM &&
    Math.abs(position.z) <= dimensions.outerHalfLengthM;
  const inInnerGrass =
    Math.abs(position.x) < dimensions.innerHalfWidthM &&
    Math.abs(position.z) < dimensions.innerHalfLengthM;

  return inOuterBounds && !inInnerGrass;
}

/** 평면 위치를 기존 `VehicleSurface` 계약으로 변환한다. */
export function sampleTestTrackSurface(
  position: Vec2,
  dimensions: TrackDimensions = TEST_TRACK_DIMENSIONS,
): VehicleSurface {
  return isOnTestTrackAsphalt(position, dimensions) ? ASPHALT_SURFACE : GRASS_SURFACE;
}

/** 데이터 기반 트랙 위치 판정을 표면 물리 계층의 `VehicleSurface`로 변환한다. */
export function sampleTrackSurface(
  position: Vec2,
  track = TEST_TRACK_DATA,
): VehicleSurface {
  return sampleTrackLocationData(position, track).surface === "asphalt"
    ? ASPHALT_SURFACE
    : GRASS_SURFACE;
}

/** 레거시·테스트 호환을 위해 기본 테스트 트랙 위치 판정을 노출한다. */
export function sampleTestTrackLocation(position: Vec2): TestTrackLocation {
  return sampleTestTrackLocationData(position);
}

/** 사용자 정의 트랙을 내부 브리지에서 샘플링할 때 사용하는 비공개 위임 함수다. */
function sampleTestTrackLocationData(position: Vec2, track = TEST_TRACK_DATA): TestTrackLocation {
  return sampleTrackLocationData(position, track);
}
