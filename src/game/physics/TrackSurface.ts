/**
 * 데이터 기반 테스트 트랙 위치를 물리 계층의 아스팔트·잔디 표면 설정으로
 * 연결하는 어댑터다. 경계와 구간의 단일 원본은 `tracks/TestTrack`에 있다.
 */
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

/** 직사각형 트랙의 외곽·내부 반폭/반길이(m) 설정이다. */
export interface TrackDimensions {
  outerHalfWidthM: number;
  outerHalfLengthM: number;
  innerHalfWidthM: number;
  innerHalfLengthM: number;
}

/** 렌더링·물리 초기 구현이 공유하는 테스트 트랙 크기다. */
export const TEST_TRACK_DIMENSIONS: TrackDimensions = {
  ...TEST_TRACK_DATA.surfaceLayout,
};

/** 위치가 외곽 직사각형 안이고 내부 잔디 영역 밖인지 판정한다. */
export function isOnTestTrackAsphalt(
  position: Vec2,
  dimensions: TrackDimensions = TEST_TRACK_DIMENSIONS,
): boolean {
  // 외곽 포함 여부와 인필드 잔디 제외 여부를 분리해 경계 판정을 명확히 한다.
  const inOuterBounds =
    Math.abs(position.x) <= dimensions.outerHalfWidthM &&
    Math.abs(position.z) <= dimensions.outerHalfLengthM;
  const inInnerGrass =
    Math.abs(position.x) < dimensions.innerHalfWidthM &&
    Math.abs(position.z) < dimensions.innerHalfLengthM;

  return inOuterBounds && !inInnerGrass;
}

/** 위치에 대응하는 아스팔트 또는 잔디의 전체 물리 표면 설정을 반환한다. */
export function sampleTestTrackSurface(
  position: Vec2,
  dimensions: TrackDimensions = TEST_TRACK_DIMENSIONS,
): VehicleSurface {
  return isOnTestTrackAsphalt(position, dimensions) ? ASPHALT_SURFACE : GRASS_SURFACE;
}

/** 트랙 데이터의 구간·경계를 포함한 노면 위치를 물리 표면으로 변환한다. */
export function sampleTrackSurface(
  position: Vec2,
  track = TEST_TRACK_DATA,
): VehicleSurface {
  return sampleTrackLocationData(position, track).surface === "asphalt"
    ? ASPHALT_SURFACE
    : GRASS_SURFACE;
}

/** 기본 테스트 트랙에서 UI·시뮬레이션이 사용할 위치 정보를 조회한다. */
export function sampleTestTrackLocation(position: Vec2): TestTrackLocation {
  return sampleTestTrackLocationData(position);
}

/** 내부 별칭으로 트랙 정의를 주입하는 호출 경로를 유지한다. */
function sampleTestTrackLocationData(position: Vec2, track = TEST_TRACK_DATA): TestTrackLocation {
  return sampleTrackLocationData(position, track);
}
