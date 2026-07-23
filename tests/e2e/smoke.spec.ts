/**
 * 브라우저에서 WebGL 장면·입력·HUD·단일 AI 상대의 사용자 가시 동작을
 * 검증하는 Playwright E2E 시나리오 모음이다.
 */
import { expect, test } from "@playwright/test";

// 초기 렌더링과 기본 HUD가 사용자에게 표시되는지 확인한다.
test("loads the S1 Racing physics prototype", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("S1 Racing");
  await expect(page.getByRole("heading", { name: "S1 Racing" })).toBeVisible();
  await expect(page.getByText("S1 RACING / MILESTONE 2A · 단일 AI 상대")).toBeVisible();
  await expect(page.getByText("공유 VehicleControlInput과 120Hz 물리로 주행하는 AI 상대")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByText("W/S 가속·브레이크 · A/D 키보드 조향")).toBeVisible();
  await expect(page.getByText("휠 하중 / N", { exact: true })).toBeVisible();
  await expect(page.getByText("서스펜션 압축", { exact: true })).toBeVisible();
  await expect(page.getByText("Rapier 접지", { exact: true })).toBeVisible();
  await expect(page.getByText(/4\/4 ·/)).toBeVisible();
  await expect(page.getByText("전륜 조향각", { exact: true })).toBeVisible();
  await expect(page.getByText("타이어 최대 슬립", { exact: true })).toBeVisible();
  await expect(page.getByText("타이어 최대 슬립각", { exact: true })).toBeVisible();
  await expect(page.getByText("타이어 그립 사용률", { exact: true })).toBeVisible();
  await expect(page.getByText("엔진 브레이크", { exact: true })).toBeVisible();
  await expect(page.getByText("항력", { exact: true })).toBeVisible();
  await expect(page.getByLabel("입력 프리셋")).toHaveValue("mouse");
  await expect(page.getByText("트랙 구간", { exact: true })).toBeVisible();
  await expect(page.getByText("트랙 경계", { exact: true })).toBeVisible();
  await expect(page.getByText("유효 · 4.0 m")).toBeVisible();
  await expect(page.getByText("AI 상대", { exact: true })).toBeVisible();
});

test("runs the single AI opponent through the shared physics path", async ({ page }) => {
  await page.goto("/");

  // AI가 초기화된 뒤 HUD에서 읽는 상대 차량 속도 샘플이다.
  const aiReadout = page.locator(".ai-readout strong");
  await expect(aiReadout).toBeVisible();
  await page.waitForTimeout(1_200);

  await expect(aiReadout).not.toHaveText(/^0 km\/h/);
  await expect(page.getByText("AI 상대", { exact: true })).toBeVisible();
});

test("moves the vehicle when throttle is held", async ({ page }) => {
  // 입력에 반응해 속도와 타이어 슬립 HUD가 갱신되는지 확인한다.
  await page.goto("/");

  await expect(page.locator("canvas")).toHaveCount(1);
  await page.locator("canvas").click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(250);
  await page.keyboard.down("w");
  await page.waitForTimeout(900);
  await page.keyboard.up("w");

  await expect(page.locator(".speed-readout strong")).not.toHaveText("0");

  // 주행 후 타이어 슬립 카드가 실제 텔레메트리를 표시하는지 확인할 locator다.
  const slipCard = page.locator(".telemetry-grid article").filter({
    has: page.getByText("타이어 최대 슬립", { exact: true }),
  });
  await expect(slipCard).not.toContainText("초기화 중");
  await expect(slipCard).not.toHaveText(/타이어 최대 슬립\s*0\.0%/);
});

test("applies the keyboard preset without an input delay", async ({ page }) => {
  // 키보드 프리셋 전환 직후 첫 입력이 지연되지 않는지 검증한다.
  await page.goto("/");

  await page.getByLabel("입력 프리셋").selectOption("keyboard");
  await expect(page.getByText(/4\/4 ·/)).toBeVisible();
  await page.locator("canvas").click({ position: { x: 12, y: 12 } });
  await page.keyboard.down("w");
  await page.waitForTimeout(350);
  await page.keyboard.up("w");

  await expect(page.locator(".speed-readout strong")).not.toHaveText("0");
});

test("resets the vehicle to the data-defined start pose", async ({ page }) => {
  // 주행 후 리셋하면 속도·구간·경계 HUD가 데이터 정의 시작 상태로 돌아와야 한다.
  await page.goto("/");

  await expect(page.getByText(/4\/4 ·/)).toBeVisible();
  await page.locator("canvas").click({ position: { x: 12, y: 12 } });
  await page.keyboard.down("w");
  await page.waitForTimeout(700);
  await page.keyboard.up("w");
  await expect(page.locator(".speed-readout strong")).not.toHaveText("0");

  await page.getByRole("button", { name: "트랙 시작점으로 리셋" }).click();
  await expect(page.locator(".speed-readout strong")).toHaveText("0", { timeout: 1_000 });
  await expect(page.getByText("스타트 직선", { exact: true })).toBeVisible();
  await expect(page.getByText("유효 · 4.0 m")).toBeVisible();
});

test("reports a track-surface boundary exit", async ({ page }) => {
  // 우측 조향으로 외곽 경계를 벗어나면 HUD가 이탈 상태를 표시해야 한다.
  await page.goto("/");

  await expect(page.getByText(/4\/4 ·/)).toBeVisible();
  await page.locator("canvas").click({ position: { x: 12, y: 12 } });
  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await page.waitForTimeout(2_800);
  await page.keyboard.up("d");
  await page.keyboard.up("w");

  await expect(page.getByText("이탈 · 리셋 권장")).toBeVisible({ timeout: 1_000 });
});

test("reports front steering when the player steers right", async ({ page }) => {
  // 우측 키 입력이 Rapier 전륜 조향각 텔레메트리로 전달되는지 확인한다.
  await page.goto("/");

  // Pointer Lock과 키보드 입력을 전달할 주행 캔버스 locator다.
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await canvas.click({ position: { x: 12, y: 12 } });
  await page.keyboard.down("d");
  await page.waitForTimeout(400);

  // 조향 입력 결과를 읽는 전륜 조향각 카드 locator다.
  const steeringCard = page.locator(".telemetry-grid article").filter({ hasText: "전륜 조향각" });
  await expect(steeringCard).toHaveText(/전륜 조향각\s*25\.8°/);
  await page.keyboard.up("d");
});

test("keeps keyboard steering available while mouse steering is active", async ({ page }) => {
  // Pointer Lock 상태에서도 키보드 조향 fallback이 유지되는지 검증한다.
  await page.goto("/");

  await expect(page.locator("canvas")).toHaveCount(1);
  await page.evaluate(() => {
    // 브라우저가 자동 Pointer Lock을 허용하지 않는 테스트 환경을 재현한다.
    // 페이지에서 실제 렌더링 캔버스를 찾아 Pointer Lock 소유자로 지정한다.
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      throw new Error("Expected the driving canvas to be available");
    }
    Object.defineProperty(document, "pointerLockElement", { configurable: true, value: canvas });
  });

  await page.keyboard.down("d");
  await page.waitForTimeout(400);

  // Pointer Lock 중에도 같은 조향각 HUD를 읽는 locator다.
  const steeringCard = page.locator(".telemetry-grid article").filter({ hasText: "전륜 조향각" });
  await expect(steeringCard).toHaveText(/전륜 조향각\s*25\.8°/);
  await page.keyboard.up("d");
});
