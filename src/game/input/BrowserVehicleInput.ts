import {
  clampAnalogInput,
  neutralVehicleControlInput,
  type VehicleControlInput,
} from "./VehicleControlInput";
import {
  DEFAULT_WHEEL_INPUT_CALIBRATION,
  normalizeCenteredAxis,
  normalizePedalAxis,
  type VehicleInputPresetId,
  type WheelInputCalibration,
} from "./InputPreset";

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
  private activePreset: VehicleInputPresetId = "mouse";
  private wheelCalibration: WheelInputCalibration = DEFAULT_WHEEL_INPUT_CALIBRATION;
  private previousGamepadButtons: boolean[] = [];
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

  getPreset(): VehicleInputPresetId {
    return this.activePreset;
  }

  setPreset(preset: VehicleInputPresetId): void {
    if (this.activePreset === preset) {
      return;
    }

    this.activePreset = preset;
    this.clearTransientInput();
    this.previousGamepadButtons = [];
  }

  setWheelCalibration(calibration: WheelInputCalibration): void {
    this.wheelCalibration = calibration;
  }

  requestReset(): void {
    this.resetQueued = true;
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

    const gamepad = this.activePreset === "gamepad" || this.activePreset === "wheel"
      ? this.findGamepad(this.activePreset)
      : null;
    const gamepadInput = gamepad ? this.sampleGamepad(gamepad) : null;

    if (this.activePreset === "gamepad" && gamepadInput) {
      this.steering = gamepadInput.steering;
    } else if (this.activePreset === "wheel" && gamepadInput) {
      this.steering = gamepadInput.steering;
    } else if (this.activePreset === "mouse") {
      this.updateMouseSteering(keyboardSteering, deltaSeconds);
    } else {
      this.steering = moveTowards(this.steering, keyboardSteering, deltaSeconds * 5.5);
    }

    const usesGamepad = gamepadInput !== null;
    const keyboardThrottle = this.pressedKeys.has("KeyW") || this.pressedKeys.has("ArrowUp") ? 1 : 0;
    const keyboardBrake = this.pressedKeys.has("KeyS") || this.pressedKeys.has("ArrowDown") ? 1 : 0;

    const input: VehicleControlInput = {
      ...neutralVehicleControlInput(),
      steering: clampAnalogInput(this.steering),
      throttle: gamepadInput?.throttle ?? keyboardThrottle,
      brake: gamepadInput?.brake ?? keyboardBrake,
      clutch: this.pressedKeys.has("Space") ? 1 : 0,
      shiftUp: this.shiftUpQueued,
      shiftDown: this.shiftDownQueued,
      overtakeMode: gamepadInput
        ? gamepadInput.overtakeMode
        : this.pressedKeys.has("ControlLeft") || this.pressedKeys.has("ControlRight"),
      activeAero: gamepadInput
        ? gamepadInput.activeAero
        : this.pressedKeys.has("ShiftLeft") || this.pressedKeys.has("ShiftRight"),
    };

    this.mouseDeltaX = 0;
    this.shiftUpQueued = false;
    this.shiftDownQueued = false;
    return input;
  }

  private isPointerLocked(): boolean {
    return this.attachedElement !== null && this.target.document.pointerLockElement === this.attachedElement;
  }

  private updateMouseSteering(keyboardSteering: number, deltaSeconds: number): void {
    if (this.isPointerLocked()) {
      this.steering = clampAnalogInput(this.steering + this.mouseDeltaX * 0.0025);
      if (keyboardSteering !== 0) {
        this.steering = moveTowards(this.steering, keyboardSteering, deltaSeconds * 5.5);
      } else if (Math.abs(this.mouseDeltaX) < 0.01) {
        this.steering = moveTowards(this.steering, 0, deltaSeconds * 2.8);
      }
      return;
    }

    this.steering = moveTowards(this.steering, keyboardSteering, deltaSeconds * 5.5);
  }

  private findGamepad(preset: "gamepad" | "wheel"): Gamepad | null {
    const gamepads = this.target.navigator?.getGamepads?.() ?? [];
    const connected = [...gamepads].filter((gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected);
    if (preset === "gamepad") {
      return connected[0] ?? null;
    }

    return connected.find((gamepad) => /wheel|logitech|thrustmaster|fanatec|moza|simucube/i.test(gamepad.id)
      || gamepad.mapping === "") ?? null;
  }

  private sampleGamepad(gamepad: Gamepad): VehicleControlInput {
    const isWheel = this.activePreset === "wheel";
    const steering = isWheel
      ? normalizeCenteredAxis(gamepad.axes[0] ?? 0, this.wheelCalibration.steering)
      : this.applyDeadzone(gamepad.axes[0] ?? 0, 0.08);
    const throttle = isWheel
      ? this.sampleWheelPedal(gamepad, 1, 7, this.wheelCalibration.throttle)
      : this.readButtonValue(gamepad, 7);
    const brake = isWheel
      ? this.sampleWheelPedal(gamepad, 2, 6, this.wheelCalibration.brake)
      : this.readButtonValue(gamepad, 6);
    const buttonStates = gamepad.buttons.map((button) => Boolean(button?.pressed || button?.value > 0.5));
    const rising = (index: number): boolean => Boolean(buttonStates[index] && !this.previousGamepadButtons[index]);

    if (rising(5)) {
      this.shiftUpQueued = true;
    }
    if (rising(4)) {
      this.shiftDownQueued = true;
    }
    this.previousGamepadButtons = buttonStates;

    return {
      ...neutralVehicleControlInput(),
      steering: clampAnalogInput(steering),
      throttle: Math.max(0, Math.min(1, throttle)),
      brake: Math.max(0, Math.min(1, brake)),
      clutch: this.readButtonValue(gamepad, 0),
      shiftUp: false,
      shiftDown: false,
      overtakeMode: Boolean(buttonStates[2]),
      activeAero: Boolean(buttonStates[3]),
    };
  }

  private sampleWheelPedal(
    gamepad: Gamepad,
    axisIndex: number,
    buttonIndex: number,
    calibration: WheelInputCalibration["throttle"],
  ): number {
    const buttonValue = this.readButtonValue(gamepad, buttonIndex);
    if (buttonValue > 0.05) {
      return buttonValue;
    }

    return normalizePedalAxis(gamepad.axes[axisIndex] ?? calibration.min, calibration);
  }

  private readButtonValue(gamepad: Gamepad, index: number): number {
    const button = gamepad.buttons[index];
    return button ? Math.max(0, Math.min(1, button.value)) : 0;
  }

  private applyDeadzone(value: number, deadzone: number): number {
    const safeValue = Number.isFinite(value) ? value : 0;
    const magnitude = Math.abs(safeValue);
    if (magnitude <= deadzone) {
      return 0;
    }

    return clampAnalogInput(Math.sign(safeValue) * ((magnitude - deadzone) / (1 - deadzone)));
  }
}
