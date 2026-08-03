/**
 * 주행 물리와 분리된 차량 디자인 검토 장면이다.
 * LowPolyCar의 읽기 전용 외관을 스튜디오 조명·바닥·OrbitControls와 조합하며,
 * 차량 위치·속도·입력·AI 상태를 소유하지 않는다.
 */
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LowPolyCar } from "../world/LowPolyCar";
import { DESIGN_STUDIO_CAMERA, type DesignStudioView } from "./DesignStudioConfig";

/** 디자인 검토 장면에 전달하는 순수 렌더링 입력이다. */
export interface DesignStudioSceneProps {
  /** 현재 무표식 도장 프리셋의 차체 색상이다. */
  bodyColor: string;
  /** 차체와 휠 허브를 구분하는 대비 색상이다. */
  accentColor: string;
  /** 어두운 차체 면에만 적용할 약한 발광 색상이다. */
  emissiveColor: string;
  /** 초기 카메라 구도이며 사용자는 OrbitControls로 다시 조정할 수 있다. */
  view: DesignStudioView;
  /** 정지된 차량의 앞바퀴 판독성을 위한 시각 조향각(rad)이다. */
  steeringAngleRad: number;
  /** 자동 회전 여부이며 물리 회전과 무관한 검토용 표시 옵션이다. */
  autoRotate: boolean;
}

/** 설계 요소를 보기 위한 저폴리 차량 스튜디오 장면이다. */
export function DesignStudioScene({
  bodyColor,
  accentColor,
  emissiveColor,
  view,
  steeringAngleRad,
  autoRotate,
}: DesignStudioSceneProps) {
  const camera = DESIGN_STUDIO_CAMERA[view];
  const { camera: activeCamera } = useThree();

  useEffect(() => {
    // 시점 버튼은 OrbitControls의 이전 위치를 재사용하지 않고 프리셋의 검수 기준선으로 카메라를 되돌린다.
    activeCamera.position.set(...camera.position);
    activeCamera.lookAt(...camera.target);
    if (activeCamera instanceof THREE.PerspectiveCamera) {
      activeCamera.fov = camera.fovDeg;
      activeCamera.updateProjectionMatrix();
    }
  }, [activeCamera, camera]);

  return (
    <>
      {/* 주행 트랙 대신 중립 스튜디오 배경을 사용해 차체 실루엣과 부품 층을 우선 판독한다. */}
      <color attach="background" args={["#0a1113"]} />
      <ambientLight intensity={1.7} color="#d9f5ed" />
      <directionalLight position={[-5, 8, 6]} intensity={3.6} color="#ffe0b0" castShadow />
      <directionalLight position={[5, 4, -4]} intensity={2.4} color="#8fd9e8" />
      {/* 어두운 탄소 부품이 배경에 묻히지 않도록 후방 rim light를 둬 형상 검토를 우선한다. */}
      <directionalLight position={[0, 5, 7]} intensity={1.4} color="#a7c9ff" />
      <hemisphereLight args={["#b9e9ed", "#17231f", 1.05]} />

      {/* key로 카메라를 교체해 시점 버튼을 눌렀을 때 이전 OrbitControls 상태를 끌고 오지 않게 한다. */}
      <PerspectiveCamera
        key={view}
        makeDefault
        position={camera.position}
        fov={camera.fovDeg}
        near={0.1}
        far={100}
      />
      <OrbitControls
        makeDefault
        target={camera.target}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={view === "cockpit" ? 0.2 : 4.2}
        maxDistance={view === "cockpit" ? 4.2 : 11}
        autoRotate={view === "cockpit" ? false : autoRotate}
        autoRotateSpeed={0.52}
      />

      {/* 얇은 플랫폼과 grid는 차체의 차고·휠 접지·전후 비율을 확인하는 기준면이다. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[13, 13]} />
        <meshStandardMaterial color="#10191a" roughness={0.86} metalness={0.08} />
      </mesh>
      <gridHelper args={[12, 24, "#31534d", "#182c2b"]} position={[0, 0.012, 0]} />
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.35, 2.43, 64]} />
        <meshBasicMaterial color="#4bd8b0" transparent opacity={0.22} />
      </mesh>

      {/* 차량은 정지된 렌더 샘플만 표시하며, 스튜디오의 조향각은 실제 물리 입력이 아니다. */}
      <LowPolyCar
        bodyColor={bodyColor}
        accentColor={accentColor}
        emissiveColor={emissiveColor}
        detail="hero"
        steeringAngleRad={steeringAngleRad}
        // 온보드 검토에서는 운전자 외피가 카메라를 가리지 않게 하고, 콕핏 셀·휠·노즈의 관계만 확인한다.
        hideDriver={view === "cockpit"}
      />
    </>
  );
}
