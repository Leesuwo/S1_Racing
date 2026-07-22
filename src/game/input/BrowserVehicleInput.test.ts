import { describe, expect, it } from "vitest";
import { BrowserVehicleInput } from "./BrowserVehicleInput";

// 브라우저 이벤트를 실제 window에 등록하지 않고 포커스·Gamepad·Pointer Lock 경계를 재현한다.
class FakeDocument extends EventTarget {
  pointerLockElement: Element | null = null;
  hidden = false;

  exitPointerLock(): void {}
}

// 테스트마다 독립된 이벤트 타깃을 만들어 리스너 누수나 이전 입력 상태가 섞이지 않게 한다.
class FakeWindow extends EventTarget {
  document = new FakeDocument();
  gamepads: Gamepad[] = [];
  navigator = {
    getGamepads: (): readonly (Gamepad | null)[] => this.gamepads,
  };
}

/** 필요한 KeyboardEvent 필드만 주입한 합성 이벤트를 만든다. */
function createKeyboardEvent(type: "keydown" | "keyup", code: string): KeyboardEvent {
  const event = new Event(type);
  Object.defineProperties(event, {
    code: { value: code },
    key: { value: code.replace("Key", "") },
  });
  return event as KeyboardEvent;
}

// 각 테스트는 물리 경계에 전달되는 첫 샘플과 일회성 에지 소비를 검증한다.
describe("BrowserVehicleInput", () => {
  it("keeps keyboard steering available while mouse steering is active", () => {
    const target = new FakeWindow();
    const canvas = new EventTarget() as unknown as HTMLElement;
    const input = new BrowserVehicleInput(target as unknown as Window);
    input.attach(canvas);
    target.document.pointerLockElement = canvas as unknown as Element;

    target.dispatchEvent(createKeyboardEvent("keydown", "KeyD"));

    expect(input.sample(0.1).steering).toBeGreaterThan(0);

    target.dispatchEvent(createKeyboardEvent("keyup", "KeyD"));
    input.dispose();
  });

  it("applies keyboard throttle on the first sample without an input delay", () => {
    const target = new FakeWindow();
    const input = new BrowserVehicleInput(target as unknown as Window);
    input.setPreset("keyboard");

    target.dispatchEvent(createKeyboardEvent("keydown", "KeyW"));

    expect(input.sample(1 / 60)).toMatchObject({ throttle: 1, brake: 0 });

    target.dispatchEvent(createKeyboardEvent("keyup", "KeyW"));
    input.dispose();
  });

  it("normalizes a standard gamepad and queues edge-triggered shifting", () => {
    const target = new FakeWindow();
    const input = new BrowserVehicleInput(target as unknown as Window);
    input.setPreset("gamepad");
    // Gamepad 버튼 상승 에지는 첫 샘플에서만 변속 플래그가 되어야 한다.
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

  it("uses wheel calibration for steering and pedal axes", () => {
    const target = new FakeWindow();
    const input = new BrowserVehicleInput(target as unknown as Window);
    input.setPreset("wheel");
    target.gamepads = [createGamepad({ id: "Test Wheel", axis0: -1, axis1: 1, axis2: -1 })];

    expect(input.sample(1 / 60)).toMatchObject({ steering: -1, throttle: 1, brake: 0 });
    input.dispose();
  });

  it("exposes an explicit reset request for the UI reset control", () => {
    const target = new FakeWindow();
    const input = new BrowserVehicleInput(target as unknown as Window);

    input.requestReset();

    expect(input.consumeReset()).toBe(true);
    expect(input.consumeReset()).toBe(false);
    input.dispose();
  });
});

/** 표준 Gamepad API가 반환하는 값 중 입력 어댑터가 사용하는 최소 부분집합이다. */
interface GamepadOptions {
  id?: string;
  axis0?: number;
  axis1?: number;
  axis2?: number;
  throttle?: number;
  shiftUp?: boolean;
}

/** 테스트용 Gamepad을 만들어 실제 장치·브라우저 의존성을 제거한다. */
function createGamepad(options: GamepadOptions = {}): Gamepad {
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
