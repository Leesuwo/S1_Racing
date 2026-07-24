import { expect, test } from "@playwright/test";

test("opens the AI Training Lab as the default visible screen", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("S1 Racing");
  await expect(page.getByRole("heading", { name: "Training Lab" })).toBeVisible();
  await expect(page.getByText("S1 RACING / M2A-0 · AI TRAINING LAB")).toBeVisible();
  await expect(page.getByText("Northfield GP · AI의 레이싱 라인과 제동을 눈앞에서 관찰하는 120Hz 교육실")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByLabel("교육 시나리오")).toHaveValue("full-lap");
  await expect(page.getByRole("button", { name: "훈련 시작" })).toBeVisible();
  await expect(page.getByText("결정성 해시", { exact: true })).toBeVisible();
  await expect(page.getByText("차체 슬립", { exact: true })).toBeVisible();
  await expect(page.getByText("AI는 입력만 생성하고 차량 위치·속도는 VehicleSimulation이 계산합니다.")).toBeVisible();
});

test("runs an observable AI training episode and exposes its progress", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("교육 시나리오").selectOption("acceleration");
  await page.getByRole("button", { name: "훈련 시작" }).click();
  await expect(page.getByRole("button", { name: "훈련 일시정지" })).toBeVisible();
  await expect(page.locator(".training-metric--hash em")).toHaveText(/step [1-9]\d*\/480/, { timeout: 5_000 });
  await expect(page.locator(".training-metric--hash strong")).not.toHaveText("811c9dc5");
  await expect(page.locator(".training-state")).toHaveText(/교육 중|교육 완료/);
});

test("keeps the full-lap percentage below completion before the finish checkpoint", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "훈련 시작" }).click();
  await expect(page.locator(".training-metric--hash em")).toHaveText(/step [1-9]\d*\/7200/, { timeout: 5_000 });
  await expect(page.locator(".training-state")).toHaveText("교육 중");
  await expect(page.getByLabel(/실제 트랙 진행률 (?!100%)/)).toBeVisible();
  await expect(page.getByLabel("실제 트랙 진행 거리")).toBeVisible();
  await expect(page.getByLabel("출발선과 도착선")).toBeVisible();
});

test("runs the track-defined low-speed exit curriculum", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("교육 시나리오").selectOption("low-speed-exit");
  await expect(page.locator(".training-overlay strong")).toHaveText("저속 탈출");
  await expect(page.locator(".training-metric--hash em")).toHaveText(/step 0\/840/);
  await page.getByRole("button", { name: "훈련 시작" }).click();

  await expect(page.locator(".training-metric--hash em")).toHaveText(/step [1-9]\d*\/840/, { timeout: 5_000 });
  await expect(page.locator(".training-state")).toHaveText(/교육 중|교육 완료/);
});

test("keeps high-speed corner training within the visible body-slip envelope", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("교육 시나리오").selectOption("high-speed");
  await expect(page.locator(".training-overlay strong")).toHaveText("고속 복합 코너");
  await page.getByRole("button", { name: "훈련 시작" }).click();

  await expect(page.locator(".training-metric--hash em")).toHaveText(/step [1-9]\d*\/1080/, { timeout: 5_000 });
  await expect(page.getByText("차체 슬립", { exact: true })).toBeVisible();
  await expect(page.getByText(/한계 3.4°/)).toBeVisible();
});

test("pauses, advances one fixed step, and resets the training episode", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("교육 시나리오").selectOption("acceleration");
  await page.getByRole("button", { name: "훈련 시작" }).click();
  await expect(page.locator(".training-metric--hash em")).toHaveText(/step [1-9]\d*\/480/, { timeout: 5_000 });
  await page.getByRole("button", { name: "훈련 일시정지" }).click();
  await expect(page.getByRole("button", { name: "훈련 시작" })).toBeVisible();

  const beforeStep = await page.locator(".training-metric--hash em").innerText();
  await page.getByRole("button", { name: "한 스텝" }).click();
  await expect(page.locator(".training-metric--hash em")).not.toHaveText(beforeStep);
  await page.getByRole("button", { name: "훈련 리셋" }).click();
  await expect(page.locator(".training-metric--hash em")).toHaveText(/step 0\/480/);
  await expect(page.locator(".training-overlay p")).toHaveText(/훈련 대기/);
});

test("automatically tunes and conditionally applies AI configuration after training finishes", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "AI 학습 실행" })).toHaveCount(0);
  await page.getByLabel("교육 시나리오").selectOption("acceleration");
  await page.getByRole("button", { name: "훈련 시작" }).click();

  await expect(page.getByRole("heading", { name: /설정을 (자동 적용|유지)했습니다/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("기준 점수", { exact: true })).toBeVisible();
  await expect(page.getByText("최고 점수", { exact: true })).toBeVisible();
  await expect(page.getByText("탐색 후보", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "최고 설정 적용" })).toHaveCount(0);
  await expect(page.locator(".training-overlay p")).toHaveText(/훈련 대기|시나리오 완료/);
});

test("keeps the M2A driving mode available from the training lab", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("tab", { name: "주행 모드" }).click();
  await expect(page.getByRole("heading", { name: "S1 Racing" })).toBeVisible();
  await expect(page.getByText("공유 VehicleControlInput과 120Hz 물리로 주행하는 AI 상대")).toBeVisible();
  await expect(page.getByLabel("입력 프리셋")).toHaveValue("mouse");
  await expect(page.getByText("휠 하중 / N", { exact: true })).toBeVisible();
  await expect(page.getByText("Rapier 접지", { exact: true })).toBeVisible();
  await expect(page.getByText(/4\/4 ·/)).toBeVisible();
});

test("moves the vehicle when throttle is held in driving mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "주행 모드" }).click();

  await page.locator("canvas").click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(250);
  await page.keyboard.down("w");
  await page.waitForTimeout(900);
  await page.keyboard.up("w");

  await expect(page.locator(".speed-readout strong")).not.toHaveText("0");
});

test("applies the keyboard preset without an input delay", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "주행 모드" }).click();

  await page.getByLabel("입력 프리셋").selectOption("keyboard");
  await page.locator("canvas").click({ position: { x: 12, y: 12 } });
  await page.keyboard.down("w");
  await page.waitForTimeout(350);
  await page.keyboard.up("w");

  await expect(page.locator(".speed-readout strong")).not.toHaveText("0");
});
