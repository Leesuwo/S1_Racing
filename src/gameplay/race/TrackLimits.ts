/**
 * M3A 트랙 리밋의 순수 상태 추적기다.
 * 트랙 위치 샘플은 TestTrack 원본을 읽고, 이 모듈은 위반 이벤트·랩 유효성·패널티만 소유한다.
 */
import {
  sampleTestTrackLocation,
  type TestTrackDefinition,
  type TestTrackLocation,
  type TrackPoint,
  TEST_TRACK_DATA,
} from "../../tracks/TestTrack";

/** 현재 차량이 트랙 리밋 안에 있는지 나타내는 상태다. */
export type TrackLimitStatus = "on-track" | "off-track";

/** 트랙 리밋 한 스텝의 읽기 전용 관찰값이다. */
export interface TrackLimitsSnapshot {
  status: TrackLimitStatus;
  onTrack: boolean;
  lapValid: boolean;
  violationCount: number;
  lapViolationCount: number;
  offTrackDurationSeconds: number;
  penaltySeconds: number;
  distanceToBoundaryM: number;
  sectionId: TestTrackLocation["sectionId"];
  sectionLabel: string;
}

/** 트랙 리밋 패널티의 초기 게임 가정이다. 단위는 s와 m이다. */
export interface TrackLimitsConfig {
  basePenaltySeconds: number;
  distancePenaltySecondsPerM: number;
  maximumPenaltySecondsPerEvent: number;
}

/** 실차 규정값이 아닌 M3A 검증용 트랙 리밋 패널티 가정이다. */
export const DEFAULT_TRACK_LIMITS_CONFIG: TrackLimitsConfig = {
  basePenaltySeconds: 1,
  distancePenaltySecondsPerM: 0.25,
  maximumPenaltySecondsPerEvent: 3,
};

/** 차량 위치를 읽고 랩 유효성과 누적 패널티를 결정하는 순수 상태 객체다. */
export class TrackLimitsMonitor {
  private readonly config: TrackLimitsConfig;
  private readonly track: TestTrackDefinition;
  private previousOnTrack = true;
  private lapValid = true;
  private violationCount = 0;
  private lapViolationCount = 0;
  private offTrackDurationSeconds = 0;
  private penaltySeconds = 0;
  private lastLocation: TestTrackLocation;

  constructor(
    track: TestTrackDefinition = TEST_TRACK_DATA,
    config: TrackLimitsConfig = DEFAULT_TRACK_LIMITS_CONFIG,
  ) {
    this.track = track;
    this.config = { ...config };
    this.lastLocation = sampleTestTrackLocation(track.startPose.position, track);
  }

  /** 새 랩의 유효성·랩별 위반 카운트를 시작선 판정과 함께 초기화한다. */
  startLap(): void {
    this.lapValid = true;
    this.lapViolationCount = 0;
  }

  /** 차량이 새 랩을 시작했을 때 누적 위반 상태를 다음 랩으로 넘긴다. */
  update(position: TrackPoint, dtSeconds: number): TrackLimitsSnapshot {
    const safeDtSeconds = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 1 / 120;
    const location = sampleTestTrackLocation(position, this.track);
    const onTrack = location.onTrack;
    if (!onTrack) {
      this.offTrackDurationSeconds += safeDtSeconds;
      this.lapValid = false;
      if (this.previousOnTrack) {
        this.violationCount += 1;
        this.lapViolationCount += 1;
        const distanceOutsideM = Math.max(0, -location.distanceToBoundaryM);
        this.penaltySeconds += Math.min(
          this.config.maximumPenaltySecondsPerEvent,
          this.config.basePenaltySeconds + distanceOutsideM * this.config.distancePenaltySecondsPerM,
        );
      }
    }
    this.previousOnTrack = onTrack;
    this.lastLocation = location;
    return this.getSnapshot();
  }

  /** 세션 리셋 시 시작선의 유효한 상태로 복원한다. */
  reset(): void {
    this.previousOnTrack = true;
    this.lapValid = true;
    this.violationCount = 0;
    this.lapViolationCount = 0;
    this.offTrackDurationSeconds = 0;
    this.penaltySeconds = 0;
    this.lastLocation = sampleTestTrackLocation(this.track.startPose.position, this.track);
  }

  /** UI·순위 계산에 전달할 복사된 트랙 리밋 상태다. */
  getSnapshot(): TrackLimitsSnapshot {
    return {
      status: this.lastLocation.onTrack ? "on-track" : "off-track",
      onTrack: this.lastLocation.onTrack,
      lapValid: this.lapValid,
      violationCount: this.violationCount,
      lapViolationCount: this.lapViolationCount,
      offTrackDurationSeconds: this.offTrackDurationSeconds,
      penaltySeconds: this.penaltySeconds,
      distanceToBoundaryM: this.lastLocation.distanceToBoundaryM,
      sectionId: this.lastLocation.sectionId,
      sectionLabel: this.lastLocation.sectionLabel,
    };
  }
}
