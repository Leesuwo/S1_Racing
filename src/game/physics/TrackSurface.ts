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

export interface TrackDimensions {
  outerHalfWidthM: number;
  outerHalfLengthM: number;
  innerHalfWidthM: number;
  innerHalfLengthM: number;
}

export const TEST_TRACK_DIMENSIONS: TrackDimensions = {
  ...TEST_TRACK_DATA.surfaceLayout,
};

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

export function sampleTestTrackSurface(
  position: Vec2,
  dimensions: TrackDimensions = TEST_TRACK_DIMENSIONS,
): VehicleSurface {
  return isOnTestTrackAsphalt(position, dimensions) ? ASPHALT_SURFACE : GRASS_SURFACE;
}

export function sampleTrackSurface(
  position: Vec2,
  track = TEST_TRACK_DATA,
): VehicleSurface {
  return sampleTrackLocationData(position, track).surface === "asphalt"
    ? ASPHALT_SURFACE
    : GRASS_SURFACE;
}

export function sampleTestTrackLocation(position: Vec2): TestTrackLocation {
  return sampleTestTrackLocationData(position);
}

function sampleTestTrackLocationData(position: Vec2, track = TEST_TRACK_DATA): TestTrackLocation {
  return sampleTrackLocationData(position, track);
}
