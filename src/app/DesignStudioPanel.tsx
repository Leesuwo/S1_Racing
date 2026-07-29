/**
 * 차량 디자인 검토 장면의 DOM 컨트롤 패널이다.
 * 3D canvas는 외관을 표시하고, 이 모듈은 시점·도장·조향 미리보기 같은 검토 명령만 소유한다.
 */
import {
  DESIGN_STUDIO_PAINTS,
  getDesignStudioViewLabel,
  type DesignStudioPaintId,
  type DesignStudioView,
} from "./DesignStudioConfig";

/** 디자인 패널의 현재 선택값과 변경 콜백이다. */
export interface DesignStudioPanelProps {
  paintId: DesignStudioPaintId;
  view: DesignStudioView;
  steeringAngleDeg: number;
  autoRotate: boolean;
  onPaintChange: (paintId: DesignStudioPaintId) => void;
  onViewChange: (view: DesignStudioView) => void;
  onSteeringChange: (steeringAngleDeg: number) => void;
  onAutoRotateChange: (autoRotate: boolean) => void;
}

/** 차량 외관을 정면·측면·후면과 색상별로 비교하는 검토 UI다. */
export function DesignStudioPanel({
  paintId,
  view,
  steeringAngleDeg,
  autoRotate,
  onPaintChange,
  onViewChange,
  onSteeringChange,
  onAutoRotateChange,
}: DesignStudioPanelProps) {
  const viewOptions: readonly DesignStudioView[] = ["hero", "front", "side", "rear"];
  const paintOptions: readonly DesignStudioPaintId[] = ["crimson", "telemetry", "graphite"];

  return (
    <section className="design-studio-dashboard" aria-label="차량 디자인 검토 패널">
      <div className="design-studio-dashboard__header">
        <div>
          <span className="section-kicker">CAR DESIGN / S1 2012 OPEN-WHEEL</span>
          <h2>차량 외관을 가까이서 확인하십시오</h2>
          <p>드래그로 회전하고, 휠로 확대·축소하며 노즈·콕핏·사이드포드·리어 윙을 비교합니다.</p>
        </div>
        <span className="design-studio-status">READ-ONLY RENDER</span>
      </div>

      <div className="design-studio-control-grid">
        <fieldset className="design-studio-control-group">
          <legend>시점</legend>
          <div className="design-studio-segmented" role="group" aria-label="차량 시점">
            {viewOptions.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                className={view === option ? "design-studio-option design-studio-option--active" : "design-studio-option"}
                onClick={() => onViewChange(option)}
              >
                {getDesignStudioViewLabel(option)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="design-studio-control-group">
          <legend>무표식 도장 프리셋</legend>
          <div className="design-studio-paint-options" role="group" aria-label="차량 도장 프리셋">
            {paintOptions.map((option) => {
              const paint = DESIGN_STUDIO_PAINTS[option];
              return (
                <button
                  key={option}
                  type="button"
                  aria-label={paint.label}
                  aria-pressed={paintId === option}
                  className={paintId === option ? "design-studio-paint design-studio-paint--active" : "design-studio-paint"}
                  onClick={() => onPaintChange(option)}
                >
                  <i style={{ background: paint.bodyColor }} aria-hidden="true" />
                  <span>{paint.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="design-studio-control-group design-studio-control-group--steering">
          <legend>앞바퀴 조향 미리보기</legend>
          <div className="design-studio-range-row">
            <input
              type="range"
              min={-28}
              max={28}
              step={1}
              value={steeringAngleDeg}
              aria-label="앞바퀴 조향각"
              onChange={(event) => onSteeringChange(Number(event.target.value))}
            />
            <output>{steeringAngleDeg > 0 ? "+" : ""}{steeringAngleDeg}°</output>
          </div>
          <button
            type="button"
            className={autoRotate ? "design-studio-auto design-studio-auto--active" : "design-studio-auto"}
            aria-pressed={autoRotate}
            onClick={() => onAutoRotateChange(!autoRotate)}
          >
            {autoRotate ? "자동 회전 켜짐" : "자동 회전 꺼짐"}
          </button>
        </fieldset>
      </div>

      <div className="design-studio-specs" aria-label="2012년형 외관 요소">
        <article>
          <span>01 / FRONT</span>
          <strong>STEP NOSE</strong>
          <p>낮은 노즈 팁과 높은 모노코크의 단차</p>
        </article>
        <article>
          <span>02 / COCKPIT</span>
          <strong>OPEN CELL</strong>
          <p>헬멧·바이저·스티어링 휠이 보이는 착좌 자세</p>
        </article>
        <article>
          <span>03 / SIDE</span>
          <strong>UNDERCUT POD</strong>
          <p>높은 흡입구 어깨와 바닥 쪽 언더컷</p>
        </article>
        <article>
          <span>04 / REAR</span>
          <strong>AERO STACK</strong>
          <p>코크 보틀·빔 윙·리어 윙·디퓨저 층</p>
        </article>
      </div>
    </section>
  );
}
