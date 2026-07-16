import {
  ASPHALT_SURFACE,
  GRASS_SURFACE,
  type Vec2,
  type VehicleSurface,
} from "./VehiclePhysics";

export interface TrackDimensions {
  outerHalfWidthM: number;
  outerHalfLengthM: number;
  innerHalfWidthM: number;
  innerHalfLengthM: number;
}

export const TEST_TRACK_DIMENSIONS: TrackDimensions = {
  outerHalfWidthM: 22,
  outerHalfLengthM: 14,
  innerHalfWidthM: 13,
  innerHalfLengthM: 6,
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
