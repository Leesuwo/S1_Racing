/**
 * Training·Driving·Race Weekend가 공유하는 저폴리 조명과 안개를 제공한다.
 * 장면 컴포넌트는 물리·카메라 상태를 소유하고, 이 컴포넌트는 렌더링 환경만 소유한다.
 */
import { VISUAL_PALETTE, type VisualSceneVariant } from "./VisualPalette";

/** 장면별 추적 카메라와 어울리는 조명 강도 차이다. 값은 simulation_required가 아닌 시각 초기 가정이다. */
const SCENE_LIGHTING: Record<VisualSceneVariant, {
  fogNear: number;
  fogFar: number;
  sunX: number;
  sunZ: number;
  sunIntensity: number;
  ambientIntensity: number;
}> = {
  training: {
    fogNear: 58,
    fogFar: 190,
    sunX: -18,
    sunZ: 12,
    sunIntensity: 2.7,
    ambientIntensity: 1.45,
  },
  driving: {
    fogNear: 42,
    fogFar: 150,
    sunX: -18,
    sunZ: 10,
    sunIntensity: 2.5,
    ambientIntensity: 1.55,
  },
  weekend: {
    fogNear: 48,
    fogFar: 160,
    sunX: -18,
    sunZ: 10,
    sunIntensity: 2.5,
    ambientIntensity: 1.55,
  },
};

/** 세 모드에 공통 팔레트와 제한된 광원을 연결하는 R3F 렌더 컴포넌트다. */
export function SceneLighting({ variant }: { variant: VisualSceneVariant }) {
  const lighting = SCENE_LIGHTING[variant];

  return (
    <>
      <color attach="background" args={[VISUAL_PALETTE.scene.background]} />
      <fog attach="fog" args={[VISUAL_PALETTE.scene.fog, lighting.fogNear, lighting.fogFar]} />
      <ambientLight intensity={lighting.ambientIntensity} color={VISUAL_PALETTE.scene.ambientLight} />
      <directionalLight
        position={[lighting.sunX, 24, lighting.sunZ]}
        intensity={lighting.sunIntensity}
        color={VISUAL_PALETTE.scene.sunLight}
        castShadow
      />
      <hemisphereLight
        args={[VISUAL_PALETTE.scene.skyLight, VISUAL_PALETTE.scene.groundLight, 1.1]}
      />
      {variant === "training" && (
        <pointLight
          position={[0, 8, 0]}
          intensity={14}
          distance={45}
          color={VISUAL_PALETTE.scene.fillLight}
        />
      )}
    </>
  );
}
