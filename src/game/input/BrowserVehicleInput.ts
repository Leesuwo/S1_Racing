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

/** 조향처럼 연속적인 입력을 프레임 시간에 무관하게 목표값으로 접근시킨다. */
function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

/** 브라우저별 KeyboardEvent 차이를 물리 입력에서 사용할 안정적인 코드로 통일한다. */
function getKeyCode(event: KeyboardEvent): string {
  if (event.code) {
    return event.code;
  }

  if (event.key.length === 1 && /[a-z]/i.test(event.key)) {
    return `Key${event.key.toUpperCase()}`;
  }

  return event.key;
}

/**
 * 키보드·Pointer Lock 마우스·Gamepad·휠의 원시 이벤트를 `VehicleControlInput`으로 변환한다.
 * 이벤트 리스너는 이 객체가 소유하고, `sample` 호출마다 일회성 변속 에지를 소비한다.
 */
export class BrowserVehicleInput {
  // 현재 눌린 키는 keydown/keyup 쌍으로 유지하며, 포커스 해제 시 전체를 비운다.
  private readonly pressedKeys = new Set<string>();
  // 조향은 장치별 원시값이 아니라 -1..1의 마지막 안정화 상태로 보관한다.
  private steering = 0;
  // Pointer Lock movementX는 이벤트 빈도가 물리 주기와 다르므로 다음 sample까지 누적한다.
  private mouseDeltaX = 0;
  // 변속·리셋은 level 입력이 아닌 한 번의 동작이므로 큐에 저장한다.
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
    // repeat 변속을 허용하면 키를 길게 누른 한 번의 입력이 여러 기어를 건너뛴다.
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
      // 브라우저 스크롤·페이지 이동이 차량 입력과 동시에 발생하지 않게 한다.
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
      // 잠금 해제 직후 남은 movementX를 다음 모드로 전파하지 않는다.
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
    // 호출자가 별도로 connect하지 않아도 즉시 동작하게 하되 connect는 멱등적으로 유지한다.
    this.connect();
  }

  /** 브라우저 이벤트를 한 번 연결한다. 중복 호출은 무시한다. */
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

  /** Pointer Lock 요청과 contextmenu 차단의 대상 Canvas를 지정한다. */
  attach(element: HTMLElement): void {
    this.attachedElement = element;
    element.addEventListener("contextmenu", this.handleContextMenu);
  }

  /** 등록한 모든 브라우저 리스너를 제거하고 이후 샘플을 중립 입력으로 되돌린다. */
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

  /** 현재 연결된 Canvas에 Pointer Lock을 요청한다. 브라우저가 거부하면 상태만 유지한다. */
  requestPointerLock(): void {
    this.attachedElement?.requestPointerLock();
  }

  /** Pointer Lock이 활성화된 경우에만 브라우저 잠금을 해제한다. */
  exitPointerLock(): void {
    if (this.isPointerLocked()) {
      this.target.document.exitPointerLock();
    }
  }

  /** 외부 리셋 직후 조향 관성과 누적 마우스 델타를 즉시 제거한다. */
  resetSteering(): void {
    this.steering = 0;
    this.mouseDeltaX = 0;
  }

  /** 현재 UI 입력 프리셋을 반환한다. */
  getPreset(): VehicleInputPresetId {
    return this.activePreset;
  }

  /** 프리셋을 바꾸면서 이전 장치의 눌림·변속 에지를 다음 샘플로 넘기지 않는다. */
  setPreset(preset: VehicleInputPresetId): void {
    if (this.activePreset === preset) {
      return;
    }

    this.activePreset = preset;
    this.clearTransientInput();
    this.previousGamepadButtons = [];
  }

  /** 휠 장치의 원시 축 범위를 다음 샘플부터 적용한다. */
  setWheelCalibration(calibration: WheelInputCalibration): void {
    this.wheelCalibration = calibration;
  }

  /** 다음 `sample`에서 소비할 차량 리셋 요청을 큐에 넣는다. */
  requestReset(): void {
    this.resetQueued = true;
  }

  /** 큐에 쌓인 리셋을 한 번만 반환한다. */
  consumeReset(): boolean {
    const shouldReset = this.resetQueued;
    this.resetQueued = false;
    return shouldReset;
  }

  /**
   * 현재 브라우저 입력을 하나의 물리 입력 스냅샷으로 만든다.
   * `deltaSeconds`는 키보드·마우스 조향 보간에만 사용하며, 반환된 입력은 한 프레임의 고정 스텝들이 공유한다.
   */
  sample(deltaSeconds: number): VehicleControlInput {
    const keyboardSteering =
      (this.pressedKeys.has("KeyD") || this.pressedKeys.has("ArrowRight") ? 1 : 0) -
      (this.pressedKeys.has("KeyA") || this.pressedKeys.has("ArrowLeft") ? 1 : 0);

    // Gamepad API는 연결된 장치 목록을 매 샘플 조회해야 재연결을 놓치지 않는다.
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

    // 이벤트 큐는 다음 물리 샘플에 중복 적용되지 않도록 반환 직후 비운다.
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
      // initial_assumption: movementX 1px을 약 0.0025 조향으로 환산한다. 실제 마우스 감도는 플레이테스트에서 조정한다.
      this.steering = clampAnalogInput(this.steering + this.mouseDeltaX * 0.0025);
      if (keyboardSteering !== 0) {
        this.steering = moveTowards(this.steering, keyboardSteering, deltaSeconds * 5.5);
      } else if (Math.abs(this.mouseDeltaX) < 0.01) {
        // 포인터가 움직이지 않을 때 중앙으로 복귀시켜 잠금 해제 전 조향이 고착되지 않게 한다.
        this.steering = moveTowards(this.steering, 0, deltaSeconds * 2.8);
      }
      return;
    }

    this.steering = moveTowards(this.steering, keyboardSteering, deltaSeconds * 5.5);
  }

  /** Gamepad는 첫 연결 장치를 사용하고, 휠은 식별자·표준 매핑으로 best-effort 탐지한다. */
  private findGamepad(preset: "gamepad" | "wheel"): Gamepad | null {
    const gamepads = this.target.navigator?.getGamepads?.() ?? [];
    const connected = [...gamepads].filter((gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected);
    if (preset === "gamepad") {
      return connected[0] ?? null;
    }

    return connected.find((gamepad) => /wheel|logitech|thrustmaster|fanatec|moza|simucube/i.test(gamepad.id)
      || gamepad.mapping === "") ?? null;
  }

  /** 표준 Gamepad 버튼 배치 또는 휠 축 보정을 공통 입력 경계로 변환한다. */
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
    // 범퍼 변속은 눌림 상태가 아니라 false -> true 전이에서만 큐에 넣는다.
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

  /** 휠은 버튼값을 우선하고, 버튼이 없으면 보정된 축값을 사용한다. */
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

  /** 없는 버튼은 0, 비정상 범위는 0..1로 잘라 안전한 페달값으로 반환한다. */
  private readButtonValue(gamepad: Gamepad, index: number): number {
    const button = gamepad.buttons[index];
    return button ? Math.max(0, Math.min(1, button.value)) : 0;
  }

  /** 조이스틱 중심부의 미세 노이즈를 제거하고 남은 범위를 다시 -1..1로 펼친다. */
  private applyDeadzone(value: number, deadzone: number): number {
    const safeValue = Number.isFinite(value) ? value : 0;
    const magnitude = Math.abs(safeValue);
    if (magnitude <= deadzone) {
      return 0;
    }

    return clampAnalogInput(Math.sign(safeValue) * ((magnitude - deadzone) / (1 - deadzone)));
  }
}
