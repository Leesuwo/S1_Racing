import { expect, test } from "@playwright/test";

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

  const aiReadout = page.locator(".ai-readout strong");
  await expect(aiReadout).toBeVisible();
  await page.waitForTimeout(1_200);

  await expect(aiReadout).not.toHaveText(/^0 km\/h/);
  await expect(page.getByText("AI 상대", { exact: true })).toBeVisible();
});

test("moves the vehicle when throttle is held", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("canvas")).toHaveCount(1);
  await page.locator("canvas").click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(250);
  await page.keyboard.down("w");
  await page.waitForTimeout(900);
  await page.keyboard.up("w");

  await expect(page.locator(".speed-readout strong")).not.toHaveText("0");

  const slipCard = page.locator(".telemetry-grid article").filter({
    has: page.getByText("타이어 최대 슬립", { exact: true }),
  });
  await expect(slipCard).not.toContainText("초기화 중");
  await expect(slipCard).not.toHaveText(/타이어 최대 슬립\s*0\.0%/);
});

test("applies the keyboard preset without an input delay", async ({ page }) => {
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
  await page.goto("/");

  const canvas = page.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await canvas.click({ position: { x: 12, y: 12 } });
  await page.keyboard.down("d");
  await page.waitForTimeout(400);

  const steeringCard = page.locator(".telemetry-grid article").filter({ hasText: "전륜 조향각" });
  await expect(steeringCard).toHaveText(/전륜 조향각\s*25\.8°/);
  await page.keyboard.up("d");
});

test("keeps keyboard steering available while mouse steering is active", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("canvas")).toHaveCount(1);
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      throw new Error("Expected the driving canvas to be available");
    }
    Object.defineProperty(document, "pointerLockElement", { configurable: true, value: canvas });
  });

  await page.keyboard.down("d");
  await page.waitForTimeout(400);

  const steeringCard = page.locator(".telemetry-grid article").filter({ hasText: "전륜 조향각" });
  await expect(steeringCard).toHaveText(/전륜 조향각\s*25\.8°/);
  await page.keyboard.up("d");
});
