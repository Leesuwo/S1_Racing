/**
 * M3A 다차량 접촉의 결정적 2D 응답 계산기다.
 * AI나 UI가 차량 위치를 덮어쓰지 않으며, RaceSession이 fixed-step 뒤 물리 응답으로 적용한다.
 */
import type { TrackPoint } from "../../tracks/TestTrack";

/** 접촉 계산에 필요한 차량의 평면 상태다. 질량은 kg, 반경은 m다. */
export interface VehicleContactBody {
  id: string;
  position: TrackPoint;
  velocity: TrackPoint;
  massKg: number;
  radiusM: number;
}

/** 한 쌍의 접촉에서 관측한 침투량과 충돌 속도다. 속도 단위는 m/s다. */
export interface VehicleContactEvent {
  firstId: string;
  secondId: string;
  penetrationM: number;
  impactSpeedMps: number;
}

/** 접촉 해결 뒤 각 차량에 적용할 평면 응답이다. */
export interface VehicleContactResponse {
  id: string;
  position: TrackPoint;
  velocity: TrackPoint;
}

/** 한 fixed step의 접촉 이벤트와 차량별 응답을 함께 반환한다. */
export interface VehicleContactResult {
  responses: readonly VehicleContactResponse[];
  contacts: readonly VehicleContactEvent[];
}

/** M3A 초기 접촉 가정이다. 회전·차체 형상은 후속 Rapier 다차량 모델에서 확장한다. */
export const DEFAULT_VEHICLE_CONTACT_RESTITUTION = 0.18;

/** 여러 차량의 원형 근사 겹침을 침투 보정과 반발 임펄스로 해결한다. */
export function resolveVehicleContacts(
  bodies: readonly VehicleContactBody[],
  restitution = DEFAULT_VEHICLE_CONTACT_RESTITUTION,
): VehicleContactResult {
  const positions = new Map(bodies.map((body) => [body.id, { ...body.position }]));
  const velocities = new Map(bodies.map((body) => [body.id, { ...body.velocity }]));
  const contacts: VehicleContactEvent[] = [];
  const safeRestitution = Math.max(0, Math.min(1, restitution));

  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    const firstBody = bodies[firstIndex];
    if (!firstBody) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
      const secondBody = bodies[secondIndex];
      if (!secondBody) continue;
      const firstPosition = positions.get(firstBody.id) ?? firstBody.position;
      const secondPosition = positions.get(secondBody.id) ?? secondBody.position;
      const delta = {
        x: secondPosition.x - firstPosition.x,
        z: secondPosition.z - firstPosition.z,
      };
      const distanceM = Math.hypot(delta.x, delta.z);
      const minimumDistanceM = Math.max(0.1, firstBody.radiusM + secondBody.radiusM);
      if (distanceM >= minimumDistanceM) continue;

      const normal = distanceM > 1e-6 ? { x: delta.x / distanceM, z: delta.z / distanceM } : { x: 1, z: 0 };
      const penetrationM = minimumDistanceM - distanceM;
      const firstInverseMass = 1 / Math.max(1, firstBody.massKg);
      const secondInverseMass = 1 / Math.max(1, secondBody.massKg);
      const inverseMassSum = firstInverseMass + secondInverseMass;
      const firstCorrection = penetrationM * firstInverseMass / inverseMassSum;
      const secondCorrection = penetrationM * secondInverseMass / inverseMassSum;
      positions.set(firstBody.id, {
        x: firstPosition.x - normal.x * firstCorrection,
        z: firstPosition.z - normal.z * firstCorrection,
      });
      positions.set(secondBody.id, {
        x: secondPosition.x + normal.x * secondCorrection,
        z: secondPosition.z + normal.z * secondCorrection,
      });

      const firstVelocity = velocities.get(firstBody.id) ?? firstBody.velocity;
      const secondVelocity = velocities.get(secondBody.id) ?? secondBody.velocity;
      const relativeVelocityAlongNormal = (
        (secondVelocity.x - firstVelocity.x) * normal.x
        + (secondVelocity.z - firstVelocity.z) * normal.z
      );
      const impactSpeedMps = Math.max(0, -relativeVelocityAlongNormal);
      if (relativeVelocityAlongNormal < 0) {
        const impulse = -(1 + safeRestitution) * relativeVelocityAlongNormal / inverseMassSum;
        velocities.set(firstBody.id, {
          x: firstVelocity.x - normal.x * impulse * firstInverseMass,
          z: firstVelocity.z - normal.z * impulse * firstInverseMass,
        });
        velocities.set(secondBody.id, {
          x: secondVelocity.x + normal.x * impulse * secondInverseMass,
          z: secondVelocity.z + normal.z * impulse * secondInverseMass,
        });
      }
      contacts.push({ firstId: firstBody.id, secondId: secondBody.id, penetrationM, impactSpeedMps });
    }
  }

  return {
    responses: bodies.map((body) => ({
      id: body.id,
      position: { ...(positions.get(body.id) ?? body.position) },
      velocity: { ...(velocities.get(body.id) ?? body.velocity) },
    })),
    contacts,
  };
}
