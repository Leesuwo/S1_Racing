import {
  clampAnalogInput,
  neutralVehicleControlInput,
  type VehicleControlInput,
} from "./VehicleControlInput";

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

function getKeyCode(event: KeyboardEvent): string {
  if (event.code) {
    return event.code;
  }

  if (event.key.length === 1 && /[a-z]/i.test(event.key)) {
    return `Key${event.key.toUpperCase()}`;
  }

  return event.key;
}

export class BrowserVehicleInput {
  private readonly pressedKeys = new Set<string>();
  private steering = 0;
  private mouseDeltaX = 0;
  private shiftUpQueued = false;
  private shiftDownQueued = false;
  private resetQueued = false;
  private attachedElement: HTMLElement | null = null;
  private connected = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const keyCode = getKeyCode(event);
    this.pressedKeys.add(keyCode);
    if (!event.repeat && keyCode === "KeyE") {
      this.shiftUpQueued = true;
    }
    if (!event.repeat && keyCode === "KeyQ") {
      this.shiftDownQueued = true;
    }
    if (!event.repeat && keyCode === "KeyR") {
      this.resetQueued = true;
    }
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(keyCode)) {
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(getKeyCode(event));
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (this.isPointerLocked()) {
      this.mouseDeltaX += event.movementX;
    }
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.shiftUpQueued = true;
    }
    if (event.button === 2) {
      this.shiftDownQueued = true;
    }
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handlePointerLockChange = (): void => {
    if (!this.isPointerLocked()) {
      this.mouseDeltaX = 0;
    }
  };

  private readonly clearTransientInput = (): void => {
    this.pressedKeys.clear();
    this.steering = 0;
    this.mouseDeltaX = 0;
    this.shiftUpQueued = false;
    this.shiftDownQueued = false;
    this.resetQueued = false;
  };

  private readonly handleWindowBlur = (): void => {
    this.clearTransientInput();
  };

  private readonly handleVisibilityChange = (): void => {
    if (this.target.document.hidden) {
      this.clearTransientInput();
    }
  };

  constructor(private readonly target: Window) {
    this.connect();
  }

  connect(): void {
    if (this.connected) {
      return;
    }

    this.target.addEventListener("keydown", this.handleKeyDown);
    this.target.addEventListener("keyup", this.handleKeyUp);
    this.target.addEventListener("mousemove", this.handleMouseMove);
    this.target.addEventListener("mousedown", this.handleMouseDown);
    this.target.addEventListener("contextmenu", this.handleContextMenu);
    this.target.addEventListener("blur", this.handleWindowBlur);
    this.target.document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    this.target.document.addEventListener("keydown", this.handleKeyDown);
    this.target.document.addEventListener("keyup", this.handleKeyUp);
    this.target.document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.connected = true;
  }

  attach(element: HTMLElement): void {
    this.attachedElement = element;
    element.addEventListener("contextmenu", this.handleContextMenu);
  }

  dispose(): void {
    if (!this.connected) {
      return;
    }

    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.target.removeEventListener("keyup", this.handleKeyUp);
    this.target.removeEventListener("mousemove", this.handleMouseMove);
    this.target.removeEventListener("mousedown", this.handleMouseDown);
    this.target.removeEventListener("contextmenu", this.handleContextMenu);
    this.target.removeEventListener("blur", this.handleWindowBlur);
    this.target.document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    this.target.document.removeEventListener("keydown", this.handleKeyDown);
    this.target.document.removeEventListener("keyup", this.handleKeyUp);
    this.target.document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.attachedElement?.removeEventListener("contextmenu", this.handleContextMenu);
    this.connected = false;
  }

  requestPointerLock(): void {
    this.attachedElement?.requestPointerLock();
  }

  exitPointerLock(): void {
    if (this.isPointerLocked()) {
      this.target.document.exitPointerLock();
    }
  }

  resetSteering(): void {
    this.steering = 0;
    this.mouseDeltaX = 0;
  }

  consumeReset(): boolean {
    const shouldReset = this.resetQueued;
    this.resetQueued = false;
    return shouldReset;
  }

  sample(deltaSeconds: number): VehicleControlInput {
    const keyboardSteering =
      (this.pressedKeys.has("KeyD") || this.pressedKeys.has("ArrowRight") ? 1 : 0) -
      (this.pressedKeys.has("KeyA") || this.pressedKeys.has("ArrowLeft") ? 1 : 0);

    if (this.isPointerLocked()) {
      this.steering = clampAnalogInput(this.steering + this.mouseDeltaX * 0.0025);
      if (keyboardSteering !== 0) {
        this.steering = moveTowards(this.steering, keyboardSteering, deltaSeconds * 5.5);
      } else if (Math.abs(this.mouseDeltaX) < 0.01) {
        this.steering = moveTowards(this.steering, 0, deltaSeconds * 2.8);
      }
    } else {
      this.steering = moveTowards(this.steering, keyboardSteering, deltaSeconds * 5.5);
    }

    const input: VehicleControlInput = {
      ...neutralVehicleControlInput(),
      steering: clampAnalogInput(this.steering),
      throttle: this.pressedKeys.has("KeyW") || this.pressedKeys.has("ArrowUp") ? 1 : 0,
      brake: this.pressedKeys.has("KeyS") || this.pressedKeys.has("ArrowDown") ? 1 : 0,
      clutch: this.pressedKeys.has("Space") ? 1 : 0,
      shiftUp: this.shiftUpQueued,
      shiftDown: this.shiftDownQueued,
      overtakeMode: this.pressedKeys.has("ControlLeft") || this.pressedKeys.has("ControlRight"),
      activeAero: this.pressedKeys.has("ShiftLeft") || this.pressedKeys.has("ShiftRight"),
    };

    this.mouseDeltaX = 0;
    this.shiftUpQueued = false;
    this.shiftDownQueued = false;
    return input;
  }

  private isPointerLocked(): boolean {
    return this.attachedElement !== null && this.target.document.pointerLockElement === this.attachedElement;
  }
}
