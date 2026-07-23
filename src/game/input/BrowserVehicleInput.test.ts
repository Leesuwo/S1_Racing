/** 브라우저 입력 어댑터의 키보드·Pointer Lock·게임패드·휠·리셋 경계를 검증한다. */
import { describe, expect, it } from "vitest";
import { BrowserVehicleInput } from "./BrowserVehicleInput";

/** 포인터 잠금 API만 제공하는 최소 문서 테스트 대역이다. */
class FakeDocument extends EventTarget {
  pointerLockElement: Element | null = null;
  hidden = false;

  exitPointerLock(): void {}
}

/** DOM 이벤트와 게임패드 목록을 제어할 수 있는 최소 Window 테스트 대역이다. */
class FakeWindow extends EventTarget {
  document = new FakeDocument();
  gamepads: Gamepad[] = [];
  navigator = {
    getGamepads: (): readonly (Gamepad | null)[] => this.gamepads,
  };
}

/** 브라우저 KeyboardEvent를 대체하는 결정론적 테스트 이벤트를 생성한다. */
function createKeyboardEvent(type: "keydown" | "keyup", code: string): KeyboardEvent {
  // EventTarget으로 dispatch할 기본 이벤트와 키 식별자를 조합한다.
  const event = new Event(type);
  Object.defineProperties(event, {
    code: { value: code },
    key: { value: code.replace("Key", "") },
  });
  return event as KeyboardEvent;
}

describe("BrowserVehicleInput", () => {
  // Pointer Lock 마우스가 활성화되어도 키보드 조향을 fallback으로 사용할 수 있어야 한다.
  it("keeps keyboard steering available while mouse steering is active", () => {
    // 실제 브라우저 대신 입력 이벤트를 수동 dispatch하는 테스트 대역을 만든다.
    const target = new FakeWindow();
    // 실제 Canvas 대신 Pointer Lock 대상 역할을 하는 HTMLElement 대역이다.
    const canvas = new EventTarget() as unknown as HTMLElement;
    // 테스트 대상 입력 어댑터는 fake Window를 브라우저 Window 계약으로 주입한다.
    const input = new BrowserVehicleInput(target as unknown as Window);
    input.attach(canvas);
    target.document.pointerLockElement = canvas as unknown as Element;

    target.dispatchEvent(createKeyboardEvent("keydown", "KeyD"));

    expect(input.sample(0.1).steering).toBeGreaterThan(0);

    target.dispatchEvent(createKeyboardEvent("keyup", "KeyD"));
    input.dispose();
  });

  // 키를 누른 첫 sample부터 throttle이 전달되어 입력 지연이 없어야 한다.
  it("applies keyboard throttle on the first sample without an input delay", () => {
    // 키 이벤트와 현재 프리셋을 보유하는 테스트 브라우저 대역이다.
    const target = new FakeWindow();
    const input = new BrowserVehicleInput(target as unknown as Window);
    input.setPreset("keyboard");

    target.dispatchEvent(createKeyboardEvent("keydown", "KeyW"));

    expect(input.sample(1 / 60)).toMatchObject({ throttle: 1, brake: 0 });

    target.dispatchEvent(createKeyboardEvent("keyup", "KeyW"));
    input.dispose();
  });

  // 표준 게임패드 축·트리거와 버튼 rising edge가 공통 입력으로 변환되어야 한다.
  it("normalizes a standard gamepad and queues edge-triggered shifting", () => {
    // 패드 목록과 입력 어댑터의 현재 프리셋을 설정한다.
    const target = new FakeWindow();
    const input = new BrowserVehicleInput(target as unknown as Window);
    input.setPreset("gamepad");
    target.gamepads = [createGamepad({ axis0: 0.5, throttle: 0.75, shiftUp: true })];

    expect(input.sample(1 / 60)).toMatchObject({
      steering: expect.closeTo(0.4565, 3),
      throttle: 0.75,
      shiftUp: true,
    });
    expect(input.sample(1 / 60).shiftUp).toBe(false);

    target.gamepads[0] = createGamepad({ axis0: 0.5, throttle: 0.75, shiftUp: false });
    input.sample(1 / 60);
    target.gamepads[0] = createGamepad({ axis0: 0.5, throttle: 0.75, shiftUp: true });
    expect(input.sample(1 / 60).shiftUp).toBe(true);
    input.dispose();
  });

  // 휠 장치는 캘리브레이션과 pedal 축 fallback을 사용해야 한다.
  it("uses wheel calibration for steering and pedal axes", () => {
    // 휠 식별자와 축 값을 제공하는 게임패드 대역이다.
    const target = new FakeWindow();
    const input = new BrowserVehicleInput(target as unknown as Window);
    input.setPreset("wheel");
    target.gamepads = [createGamepad({ id: "Test Wheel", axis0: -1, axis1: 1, axis2: -1 })];

    expect(input.sample(1 / 60)).toMatchObject({ steering: -1, throttle: 1, brake: 0 });
    input.dispose();
  });

  // UI 리셋은 한 번 소비된 뒤 다시 발생하지 않는 edge여야 한다.
  it("exposes an explicit reset request for the UI reset control", () => {
    // UI reset edge를 소비할 입력 어댑터다.
    const target = new FakeWindow();
    const input = new BrowserVehicleInput(target as unknown as Window);

    input.requestReset();

    expect(input.consumeReset()).toBe(true);
    expect(input.consumeReset()).toBe(false);
    input.dispose();
  });
});

/** 게임패드 대역을 만드는 선택적 축·버튼 픽스처다. */
interface GamepadOptions {
  id?: string;
  axis0?: number;
  axis1?: number;
  axis2?: number;
  throttle?: number;
  shiftUp?: boolean;
}

/** 브라우저 Gamepad 계약에 맞는 최소 연결 패드를 생성한다. */
function createGamepad(options: GamepadOptions = {}): Gamepad {
  // 표준 게임패드 버튼 인덱스 4/5/6/7을 재현할 8개 버튼 배열이다.
  const buttons = Array.from({ length: 8 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }));
  buttons[7].value = options.throttle ?? 0;
  buttons[7].pressed = buttons[7].value > 0.5;
  buttons[5].pressed = options.shiftUp ?? false;

  return {
    axes: [options.axis0 ?? 0, options.axis1 ?? -1, options.axis2 ?? -1],
    buttons,
    connected: true,
    id: options.id ?? "Test Gamepad",
    index: 0,
    mapping: "standard",
    timestamp: 0,
    vibrationActuator: null,
  } as unknown as Gamepad;
}
