/**
 * M2B~M3D 레이스 주말의 단계·퀄리파잉·전략·타이어·레이스크래프트·운영 UI다.
 * 세션을 직접 변경하지 않고 앱 셸이 제공한 명령 콜백만 호출한다.
 */
import type {
  RaceStrategy,
  RaceWeekendSnapshot,
  TyreCompound,
} from "../gameplay/race/RaceWeekendSession";
import { TYRE_COMPOUNDS } from "../gameplay/race/RaceWeekendSession";

/** 주말 단계의 사용자 표시명이다. */
function stageLabel(snapshot: RaceWeekendSnapshot): string {
  if (snapshot.stage === "practice") return "연습 준비";
  if (snapshot.stage === "qualifying") return snapshot.status === "complete" ? "퀄리파잉 완료" : "퀄리파잉 진행";
  if (snapshot.stage === "race") return "레이스 진행 중";
  return "레이스 결과";
}

/** 퀄리파잉 단계 결과를 컷 요약 문장으로 표시한다. */
function cutLabel(snapshot: RaceWeekendSnapshot, phase: "Q1" | "Q2" | "Q3"): string {
  const result = snapshot.qualifying.phaseResults.find((item) => item.phase === phase);
  if (!result) {
    if (phase === "Q1") return "Q1 20 → 15 대기";
    if (phase === "Q2") return "Q2 15 → 10 대기";
    return "Q3 10 최종 순위 대기";
  }
  return phase === "Q3"
    ? "Q3 10 최종 순위 확정"
    : phase + " " + String(result.entrantCount) + " → " + String(result.advanceCount) + " 완료";
}

/** 레이스 주말 단계 전환과 전략 선택을 포함한 조작 패널의 외부 계약이다. */
export interface RaceWeekendPanelProps {
  snapshot: RaceWeekendSnapshot;
  onRunQualifying: () => void;
  onStartRace: () => void;
  onReset: () => void;
  onSelectTyre: (compound: TyreCompound) => void;
  onStrategy: (strategy: RaceStrategy) => void;
}

/** M2B~M3D의 다차량·퀄리파잉·전략·주행 운영 상태를 한 화면에 표시한다. */
export function RaceWeekendPanel({
  snapshot,
  onRunQualifying,
  onStartRace,
  onReset,
  onSelectTyre,
  onStrategy,
}: RaceWeekendPanelProps) {
  const qualifyingComplete = snapshot.qualifying.status === "complete";
  const raceStarted = snapshot.stage === "race" || snapshot.stage === "results";
  const pitCompounds = TYRE_COMPOUNDS.filter((compound) => compound !== snapshot.strategy.startCompound);
  const player = snapshot.race.standings.find((participant) => participant.kind === "player");
  const tyre = player?.tyreCondition;
  const operations = player?.operations;
  const racecraft = player?.racecraft;

  return (
    <section className="weekend-dashboard" aria-label="레이스 주말 관리">
      <div className="weekend-dashboard__header">
        <div>
          <span className="section-kicker">M2B / M2C / M2D / M3B / M3C / M3D · RACE WEEKEND CONTROL</span>
          <h2>레이스 주말을 운영하십시오</h2>
        </div>
        <span className="weekend-stage" aria-label="레이스 주말 단계">{stageLabel(snapshot)}</span>
      </div>

      <div className="weekend-summary-grid">
        <article className="weekend-summary-card weekend-summary-card--primary">
          <span>다차량 세션</span>
          <strong>{snapshot.race.participantCount}대 그리드</strong>
          <em>{snapshot.race.status === "running" ? "120Hz fixed-step 실행 중" : "그리드·순위·리셋 경계 준비"}</em>
        </article>
        <article className="weekend-summary-card">
          <span>퀄리파잉 규칙</span>
          <strong>{snapshot.qualifying.rulesetVersion}</strong>
          <em>{cutLabel(snapshot, "Q1")} · {cutLabel(snapshot, "Q2")}</em>
        </article>
        <article className="weekend-summary-card">
          <span>레이스 전략</span>
          <strong>{snapshot.selectedCompound.toUpperCase()} 시작</strong>
          <em>Lap {snapshot.strategy.pitStopLap} · {snapshot.strategy.pitStopCompound.toUpperCase()} 피트 정지</em>
        </article>
        <article className="weekend-summary-card weekend-summary-card--m3a">
          <span>M3A · 트랙 리밋·접촉</span>
          <strong>{snapshot.race.contactCount}회 차량 접촉</strong>
          <em>PLAYER {player?.trackLimits.violationCount ?? 0}회 위반 · {player?.trackLimits.lapValid ? "현재 랩 유효" : "현재 랩 무효"}</em>
        </article>
        <article className="weekend-summary-card weekend-summary-card--m3b">
          <span>M3B · 타이어 상태</span>
          <strong>{tyre?.compound.toUpperCase() ?? "MEDIUM"} · {tyre?.averageTemperatureC.toFixed(0) ?? "44"} °C</strong>
          <em>{((tyre?.averageWearRatio ?? 0) * 100).toFixed(1)}% 마모 · {tyre?.averagePressureKPa.toFixed(1) ?? "170.0"} kPa</em>
        </article>
        <article className="weekend-summary-card weekend-summary-card--m3c">
          <span>M3C · 레이스크래프트</span>
          <strong>{racecraft?.mode.toUpperCase() ?? "FOLLOW"}</strong>
          <em>{racecraft?.reason ?? "레이싱 라인 추종"}</em>
        </article>
        <article className="weekend-summary-card weekend-summary-card--m3d">
          <span>M3D · 플래그·운영</span>
          <strong>{snapshot.race.flag.toUpperCase()} · {((operations?.damage.totalRatio ?? 0) * 100).toFixed(1)}% 손상</strong>
          <em>{operations?.pitStop.status === "servicing" ? `피트 서비스 ${(operations.pitStop.remainingSeconds).toFixed(1)} s` : `피트 ${operations?.pitStop.stopCount ?? 0}회 완료`}</em>
        </article>
      </div>

      <div className="weekend-controls" aria-label="레이스 주말 조작">
        <button type="button" className="training-button training-button--primary" onClick={onRunQualifying} disabled={raceStarted}>
          퀄리파잉 실행
        </button>
        <button type="button" className="training-button" onClick={onStartRace} disabled={!qualifyingComplete || raceStarted}>
          레이스 시작
        </button>
        <button type="button" className="training-button training-button--quiet" onClick={onReset}>
          주말 리셋
        </button>
      </div>

      <div className="weekend-strategy" aria-label="타이어 및 피트 전략">
        <label>
          <span>타이어 선택</span>
          <select
            aria-label="타이어 선택"
            value={snapshot.selectedCompound}
            disabled={raceStarted}
            onChange={(event) => onSelectTyre(event.target.value as TyreCompound)}
          >
            {TYRE_COMPOUNDS.map((compound) => <option key={compound} value={compound}>{compound.toUpperCase()}</option>)}
          </select>
        </label>
        <label>
          <span>피트 정지 랩</span>
          <select
            aria-label="피트 정지 랩"
            value={snapshot.strategy.pitStopLap}
            disabled={raceStarted}
            onChange={(event) => onStrategy({ ...snapshot.strategy, pitStopLap: Number(event.target.value) })}
          >
            {Array.from({ length: Math.max(1, snapshot.totalLaps - 1) }, (_, index) => {
              const lap = index + 1;
              return <option key={lap} value={lap}>Lap {lap}</option>;
            })}
          </select>
        </label>
        <label>
          <span>피트 타이어</span>
          <select
            aria-label="피트 타이어"
            value={snapshot.strategy.pitStopCompound}
            disabled={raceStarted}
            onChange={(event) => onStrategy({ ...snapshot.strategy, pitStopCompound: event.target.value as TyreCompound })}
          >
            {pitCompounds.map((compound) => <option key={compound} value={compound}>{compound.toUpperCase()}</option>)}
          </select>
        </label>
        <p>선택한 컴파운드는 차량 물리와 레이스 전략에 공유되며, 지정 랩에서 실제 피트 서비스 시간이 차감됩니다.</p>
      </div>

      <div className="weekend-results-grid">
        <section className="weekend-result-card" aria-label="퀄리파잉 결과">
          <div className="weekend-result-card__header">
            <div>
              <span className="section-kicker">M2C / VALID LAP TIMING</span>
              <h3>퀄리파잉 컷</h3>
            </div>
            <strong>{snapshot.qualifying.phase}</strong>
          </div>
          <div className="weekend-cut-list">
            <span>{cutLabel(snapshot, "Q1")}</span>
            <span>{cutLabel(snapshot, "Q2")}</span>
            <span>{cutLabel(snapshot, "Q3")}</span>
          </div>
          <p className="weekend-result-note">유효 랩만 최고 기록에 반영하며, 무효 랩은 순위 시간으로 사용할 수 없습니다.</p>
        </section>

        <section className="weekend-result-card" aria-label="레이스 순위">
          <div className="weekend-result-card__header">
            <div>
              <span className="section-kicker">M2B / M3A / M3D · DETERMINISTIC STANDINGS</span>
              <h3>현재 레이스 순위</h3>
            </div>
            <strong>{snapshot.race.elapsedSeconds.toFixed(2)} s</strong>
          </div>
          <div className="weekend-standings" role="table" aria-label="다차량 순위">
            {snapshot.race.standings.slice(0, 8).map((participant) => (
              <div className="weekend-standing-row" role="row" key={participant.id}>
                <b>{participant.position}</b>
                <span>{participant.label}</span>
                <em>{participant.finished ? "FIN" : participant.retired ? "OUT" : `${participant.operations.flag.toUpperCase()} · ${formatDistance(participant.raceDistanceM)}`}</em>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

/** 순위 거리(m)를 작은 단위 문자열로 표시한다. */
function formatDistance(distanceM: number): string {
  return distanceM.toFixed(1) + " m";
}
