/**
 * 브라우저 키보드·Pointer Lock 마우스·게임패드·휠 이벤트를 읽어
 * `VehicleControlInput` 계약으로 정규화하는 입력 어댑터다. 이벤트 수집과
 * 소비를 분리해 fixed step이 장치별 DOM 상태를 직접 읽지 않게 한다.
 */
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

/** 조향 상태처럼 시간에 따라 변하는 아날로그 값을 일정 속도로 이동한다. */
function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

/** 브라우저·테스트 환경 차이를 흡수해 키 이벤트의 안정된 코드 문자열을 얻는다. */
function getKeyCode(event: KeyboardEvent): string {
  if (event.code) {
    return event.code;
  }

  if (event.key.length === 1 && /[a-z]/i.test(event.key)) {
    return `Key${event.key.toUpperCase()}`;
  }

  return event.key;
}

/** 브라우저 이벤트를 공통 차량 입력 샘플로 변환한다. */
export class BrowserVehicleInput {
  /** 현재 눌린 키 코드 집합이며 키보드 입력의 소유 상태다. */
  private readonly pressedKeys = new Set<string>();
  /** 누적된 조향 값(-1..1)으로 키보드와 마우스/패드 입력을 혼합한다. */
  private steering = 0;
  /** 마지막 sample 이후 누적된 Pointer Lock 이동량(px)이다. */
  private mouseDeltaX = 0;
  /** 다음 sample에서 한 번 소비할 업시프트 edge다. */
  private shiftUpQueued = false;
  /** 다음 sample에서 한 번 소비할 다운시프트 edge다. */
  private shiftDownQueued = false;
  /** UI 또는 R키가 요청한 다음 리셋 edge다. */
  private resetQueued = false;
  /** 현재 읽는 장치 프리셋이다. 기본은 Pointer Lock 마우스다. */
  private activePreset: VehicleInputPresetId = "mouse";
  /** 휠 축을 공통 입력 범위로 변환하는 현재 캘리브레이션이다. */
  private wheelCalibration: WheelInputCalibration = DEFAULT_WHEEL_INPUT_CALIBRATION;
  /** 게임패드 버튼 rising edge 계산을 위한 이전 상태다. */
  private previousGamepadButtons: boolean[] = [];
  /** Pointer Lock 요청 대상 캔버스 또는 컨트롤 요소다. */
  private attachedElement: HTMLElement | null = null;
  /** DOM 리스너가 연결되어 있는지 나타내는 생명주기 상태다. */
  private connected = false;

  /** 키보드 press를 저장하고 변속·리셋 edge를 큐에 넣는다. */
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    // code를 기준으로 저장해 키보드 배열·레이아웃 차이를 제거한다.
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

  /** 키보드 release를 눌림 집합에서 제거한다. */
  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(getKeyCode(event));
  };

  /** Pointer Lock 중 이동량만 누적해 마우스가 포커스를 잃었을 때의 오입력을 막는다. */
  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (this.isPointerLocked()) {
      this.mouseDeltaX += event.movementX;
    }
  };

  /** 마우스 좌·우 버튼을 한 번성 변속 edge로 변환한다. */
  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.shiftUpQueued = true;
    }
    if (event.button === 2) {
      this.shiftDownQueued = true;
    }
  };

  /** 우클릭 메뉴가 주행 입력을 가로채지 않게 차단한다. */
  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  /** Pointer Lock 해제 시 남은 마우스 delta를 폐기한다. */
  private readonly handlePointerLockChange = (): void => {
    if (!this.isPointerLocked()) {
      this.mouseDeltaX = 0;
    }
  };

  /** 포커스·프리셋 변경 시 계속 눌린 키와 edge 입력을 모두 중립화한다. */
  private readonly clearTransientInput = (): void => {
    this.pressedKeys.clear();
    this.steering = 0;
    this.mouseDeltaX = 0;
    this.shiftUpQueued = false;
    this.shiftDownQueued = false;
    this.resetQueued = false;
  };

  /** 창 포커스 상실을 안전한 중립 입력으로 변환한다. */
  private readonly handleWindowBlur = (): void => {
    this.clearTransientInput();
  };

  /** 탭이 백그라운드로 가면 키 고착과 변속 edge를 제거한다. */
  private readonly handleVisibilityChange = (): void => {
    if (this.target.document.hidden) {
      this.clearTransientInput();
    }
  };

  /** 대상 Window에 입력 리스너를 연결한다. 생성 시 자동으로 한 번 연결된다. */
  constructor(private readonly target: Window) {
    this.connect();
  }

  /** 중복 연결을 막으며 Window와 Document 이벤트를 등록한다. */
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

  /** Pointer Lock과 context menu 차단을 적용할 렌더링 요소를 저장한다. */
  attach(element: HTMLElement): void {
    this.attachedElement = element;
    element.addEventListener("contextmenu", this.handleContextMenu);
  }

  /** 등록한 모든 DOM 리스너를 제거해 컴포넌트 수명 종료를 처리한다. */
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

  /** 현재 연결된 요소에 Pointer Lock을 요청한다. */
  requestPointerLock(): void {
    this.attachedElement?.requestPointerLock();
  }

  /** Pointer Lock이 잡혀 있으면 브라우저 잠금을 해제한다. */
  exitPointerLock(): void {
    if (this.isPointerLocked()) {
      this.target.document.exitPointerLock();
    }
  }

  /** 마우스·키보드 조향의 누적 상태를 중립으로 되돌린다. */
  resetSteering(): void {
    this.steering = 0;
    this.mouseDeltaX = 0;
  }

  /** 현재 입력 프리셋을 조회한다. */
  getPreset(): VehicleInputPresetId {
    return this.activePreset;
  }

  /** 입력 프리셋을 바꾸고 이전 장치 상태가 새 장치로 누출되지 않게 초기화한다. */
  setPreset(preset: VehicleInputPresetId): void {
    if (this.activePreset === preset) {
      return;
    }

    this.activePreset = preset;
    this.clearTransientInput();
    this.previousGamepadButtons = [];
  }

  /** 이후 휠 샘플에 사용할 축 캘리브레이션을 교체한다. */
  setWheelCalibration(calibration: WheelInputCalibration): void {
    this.wheelCalibration = calibration;
  }

  /** UI 버튼에서 한 번성 리셋 edge를 큐에 넣는다. */
  requestReset(): void {
    this.resetQueued = true;
  }

  /** 큐에 있던 리셋 edge를 한 번 소비하고 다음 샘플에는 남기지 않는다. */
  consumeReset(): boolean {
    // 읽기 전에 별도 변수로 복사해 반환과 초기화를 원자적으로 처리한다.
    const shouldReset = this.resetQueued;
    this.resetQueued = false;
    return shouldReset;
  }

  /** 현재 프레임의 장치 상태를 공통 VehicleControlInput으로 샘플링한다. */
  sample(deltaSeconds: number): VehicleControlInput {
    // 키보드 조향은 오른쪽 입력에서 왼쪽 입력을 빼 단일 [-1, 1] 값으로 만든다.
    const keyboardSteering =
      (this.pressedKeys.has("KeyD") || this.pressedKeys.has("ArrowRight") ? 1 : 0) -
      (this.pressedKeys.has("KeyA") || this.pressedKeys.has("ArrowLeft") ? 1 : 0);

    // 게임패드·휠 프리셋에서만 연결 장치를 탐색해 브라우저 API 의존을 제한한다.
    const gamepad = this.activePreset === "gamepad" || this.activePreset === "wheel"
      ? this.findGamepad(this.activePreset)
      : null;
    // 장치가 없어도 키보드/중립 경로가 계속 동작하도록 null을 유지한다.
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

    // 현재 sample이 실제 게임패드에서 왔는지 기록해 입력 경계를 설명한다.
    const usesGamepad = gamepadInput !== null;
    // throttle/brake의 키보드 대체값은 게임패드 샘플이 없을 때만 사용한다.
    const keyboardThrottle = this.pressedKeys.has("KeyW") || this.pressedKeys.has("ArrowUp") ? 1 : 0;
    // S 또는 아래 화살표가 눌리면 공통 브레이크 입력을 1로 만든다.
    const keyboardBrake = this.pressedKeys.has("KeyS") || this.pressedKeys.has("ArrowDown") ? 1 : 0;

    // 모든 소스는 neutral 입력에서 시작해 숨은 제어값이 남지 않게 한다.
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

    // edge와 Pointer Lock delta는 한 sample에서만 유효하므로 소비 후 지운다.
    this.mouseDeltaX = 0;
    this.shiftUpQueued = false;
    this.shiftDownQueued = false;
    return input;
  }

  /** 현재 attached element가 브라우저 Pointer Lock을 소유하는지 확인한다. */
  private isPointerLocked(): boolean {
    return this.attachedElement !== null && this.target.document.pointerLockElement === this.attachedElement;
  }

  /** Pointer Lock 마우스와 키보드 조향을 프리셋 규칙에 따라 누적한다. */
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

  /** 요청된 프리셋에 맞는 연결 게임패드 또는 휠 장치를 찾는다. */
  private findGamepad(preset: "gamepad" | "wheel"): Gamepad | null {
    // getGamepads가 없는 브라우저·테스트 환경은 빈 목록으로 취급한다.
    const gamepads = this.target.navigator?.getGamepads?.() ?? [];
    // null 슬롯과 연결 해제 장치를 제거해 실제 후보만 남긴다.
    const connected = [...gamepads].filter((gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected);
    if (preset === "gamepad") {
      return connected[0] ?? null;
    }

    return connected.find((gamepad) => /wheel|logitech|thrustmaster|fanatec|moza|simucube/i.test(gamepad.id)
      || gamepad.mapping === "") ?? null;
  }

  /** 게임패드/휠의 축과 버튼을 공통 입력 계약으로 변환한다. */
  private sampleGamepad(gamepad: Gamepad): VehicleControlInput {
    // 휠은 캘리브레이션을 적용하고 일반 패드는 중앙 deadzone을 적용한다.
    const isWheel = this.activePreset === "wheel";
    const steering = isWheel
      ? normalizeCenteredAxis(gamepad.axes[0] ?? 0, this.wheelCalibration.steering)
      : this.applyDeadzone(gamepad.axes[0] ?? 0, 0.08);
    // 휠은 보정된 페달 축을, 패드는 표준 트리거 버튼을 읽는다.
    const throttle = isWheel
      ? this.sampleWheelPedal(gamepad, 1, 7, this.wheelCalibration.throttle)
      : this.readButtonValue(gamepad, 7);
    const brake = isWheel
      ? this.sampleWheelPedal(gamepad, 2, 6, this.wheelCalibration.brake)
      : this.readButtonValue(gamepad, 6);
    // 버튼 edge는 현재 pressed와 이전 sample을 비교해 한 번만 발생시킨다.
    const buttonStates = gamepad.buttons.map((button) => Boolean(button?.pressed || button?.value > 0.5));
    // 버튼 배열의 누락 슬롯은 false로 취급한다.
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

  /** 휠 페달은 버튼 우선, 축 fallback 순서로 샘플링한다. */
  private sampleWheelPedal(
    gamepad: Gamepad,
    axisIndex: number,
    buttonIndex: number,
    calibration: WheelInputCalibration["throttle"],
  ): number {
    // 일부 휠 드라이버는 같은 페달을 버튼과 축 중 하나로만 노출한다.
    const buttonValue = this.readButtonValue(gamepad, buttonIndex);
    if (buttonValue > 0.05) {
      return buttonValue;
    }

    return normalizePedalAxis(gamepad.axes[axisIndex] ?? calibration.min, calibration);
  }

  /** 게임패드 버튼 값을 [0, 1]로 제한한다. */
  private readButtonValue(gamepad: Gamepad, index: number): number {
    // 드라이버가 제공하지 않는 버튼 인덱스는 중립 0으로 처리한다.
    const button = gamepad.buttons[index];
    return button ? Math.max(0, Math.min(1, button.value)) : 0;
  }

  /** 게임패드 조향축의 중앙 deadzone을 제거하고 [-1, 1]로 재확장한다. */
  private applyDeadzone(value: number, deadzone: number): number {
    // 장치가 보고한 NaN은 중립으로 대체한다.
    const safeValue = Number.isFinite(value) ? value : 0;
    // 양방향 축의 deadzone 판정을 위해 절대 크기를 분리한다.
    const magnitude = Math.abs(safeValue);
    if (magnitude <= deadzone) {
      return 0;
    }

    return clampAnalogInput(Math.sign(safeValue) * ((magnitude - deadzone) / (1 - deadzone)));
  }
}
