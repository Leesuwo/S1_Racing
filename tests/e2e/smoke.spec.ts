import { expect, test } from "@playwright/test";

test("loads the S1 Racing physics prototype", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("S1 Racing");
  await expect(page.getByRole("heading", { name: "S1 Racing" })).toBeVisible();
  await expect(page.getByText("S1 RACING / 물리 프로토타입 v0.4")).toBeVisible();
  await expect(page.getByText("고정 120Hz 차량 물리 테스트 트랙")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByText("W/S 가속·브레이크 · A/D 키보드 조향")).toBeVisible();
  await expect(page.getByText("휠 하중 / N", { exact: true })).toBeVisible();
  await expect(page.getByText("서스펜션 압축", { exact: true })).toBeVisible();
  await expect(page.getByText("Rapier 접지", { exact: true })).toBeVisible();
  await expect(page.getByText(/4\/4 ·/)).toBeVisible();
  await expect(page.getByText("전륜 조향각", { exact: true })).toBeVisible();
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
