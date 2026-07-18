import { describe, expect, it } from "vitest";
import { BrowserVehicleInput } from "./BrowserVehicleInput";

class FakeDocument extends EventTarget {
  pointerLockElement: Element | null = null;
  hidden = false;

  exitPointerLock(): void {}
}

class FakeWindow extends EventTarget {
  document = new FakeDocument();
}

function createKeyboardEvent(type: "keydown" | "keyup", code: string): KeyboardEvent {
  const event = new Event(type);
  Object.defineProperties(event, {
    code: { value: code },
    key: { value: code.replace("Key", "") },
  });
  return event as KeyboardEvent;
}

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
});
