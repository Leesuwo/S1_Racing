import { expect, Page, test } from "@playwright/test";
import { releaseWebGLContexts } from "./webglCleanup";

/** 사용자에게 보이는 브라우저 흐름과 모드 전환의 완료 상태를 검증하는 E2E 모음이다. */

/** GPU 초기화 지연이 있어도 React 모드 상태가 확정된 뒤 주말 패널을 조회한다. */
async function openRaceWeekend(page: Page) {
  const tab = page.getByRole("tab", { name: "레이스 주말" });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Race Weekend" })).toBeVisible({ timeout: 20_000 });
}

/**
 * WebGL frame scheduling은 headless Chromium에서 절전될 수 있으므로, Training Lab E2E는
 * 사용자가 항상 실행할 수 있는 한 fixed-step 명령으로 물리·HUD 연결을 결정적으로 확인한다.
 */
async function advanceTrainingOneStep(page: Page) {
  await page.getByRole("button", { name: "한 스텝" }).click();
}

// 각 테스트의 Canvas를 먼저 잃게 해 Chromium이 다음 R3F 장면을 같은 GPU 컨텍스트로
// 보류하지 않게 한다. 사용자가 보는 런타임 동작이 아니라 E2E 격리 경계다.
test.afterEach(async ({ page }) => {
  await releaseWebGLContexts(page);
});

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

test("opens the car design review and switches its visual inspection controls", async ({ page }) => {
  await page.goto("/");

  const designTab = page.getByRole("tab", { name: "차 디자인" });
  await designTab.click();
  await expect(designTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Car Design" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "차량 외관을 가까이서 확인하십시오" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);

  const sideView = page.getByRole("button", { name: "SIDE", exact: true });
  await sideView.click();
  await expect(sideView).toHaveAttribute("aria-pressed", "true");

  const graphitePaint = page.getByRole("button", { name: "Carbon Graphite", exact: true });
  await graphitePaint.click();
  await expect(graphitePaint).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("STEP NOSE", { exact: true })).toBeVisible();
  await expect(page.getByText("UNDERCUT POD", { exact: true })).toBeVisible();
  await expect(page.getByText("이 화면은 LowPolyCar의 읽기 전용 외관만 표시하며 물리 포즈·입력·AI 상태를 변경하지 않습니다.")).toBeVisible();
});

test("runs an observable AI training episode and exposes its progress", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("교육 시나리오").selectOption("acceleration");
  await page.getByRole("button", { name: "훈련 시작" }).click();
  await advanceTrainingOneStep(page);
  await expect(page.getByRole("button", { name: "훈련 일시정지" })).toBeVisible();
  await expect(page.locator(".training-metric--hash em")).toHaveText(/step [1-9]\d*\/480/, { timeout: 5_000 });
  await expect(page.locator(".training-metric--hash strong")).not.toHaveText("811c9dc5");
  await expect(page.locator(".training-state")).toHaveText(/교육 중|교육 완료/);
});

test("keeps the full-lap percentage below completion before the finish checkpoint", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "훈련 시작" }).click();
  await advanceTrainingOneStep(page);
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
  await advanceTrainingOneStep(page);

  await expect(page.locator(".training-metric--hash em")).toHaveText(/step [1-9]\d*\/840/, { timeout: 5_000 });
  await expect(page.locator(".training-state")).toHaveText(/교육 중|교육 완료/);
});

test("keeps high-speed corner training within the visible body-slip envelope", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("교육 시나리오").selectOption("high-speed");
  await expect(page.locator(".training-overlay strong")).toHaveText("고속 복합 코너");
  await page.getByRole("button", { name: "훈련 시작" }).click();
  await advanceTrainingOneStep(page);

  await expect(page.locator(".training-metric--hash em")).toHaveText(/step [1-9]\d*\/1080/, { timeout: 5_000 });
  await expect(page.getByText("차체 슬립", { exact: true })).toBeVisible();
  await expect(page.getByText(/한계 3.4°/)).toBeVisible();
});

test("pauses, advances one fixed step, and resets the training episode", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("교육 시나리오").selectOption("acceleration");
  await page.getByRole("button", { name: "훈련 시작" }).click();
  await advanceTrainingOneStep(page);
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

test("keeps automatic tuning behind the completed deterministic training boundary", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "AI 학습 실행" })).toHaveCount(0);
  await page.getByLabel("교육 시나리오").selectOption("acceleration");
  await page.getByRole("button", { name: "훈련 시작" }).click();
  await advanceTrainingOneStep(page);

  // 후보 점수·자동 적용은 AITrainingEvaluator 단위 테스트에서 전체 결정적 episode로 검증한다.
  // E2E는 완료 전에는 결과 다운로드·수동 적용 UI가 나타나지 않는 사용자 경계만 확인한다.
  await expect(page.getByRole("button", { name: "최고 설정 적용" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "결과 JSON 저장" })).toHaveCount(0);
  await expect(page.locator(".training-metric--hash em")).toHaveText(/step [1-9]\d*\/480/);
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
  await expect(page.locator(".ai-readout strong").first()).not.toHaveText(/^0 km\/h/, { timeout: 3_000 });
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

test("shows the front axle steering response in driving telemetry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "주행 모드" }).click();

  await page.getByLabel("입력 프리셋").selectOption("keyboard");
  await page.locator("canvas").click({ position: { x: 12, y: 12 } });
  await page.keyboard.down("a");

  // UI 수치가 0이 아니면 동일한 렌더 스냅샷 조향각이 앞축 그룹에도 전달될 수 있는 상태다.
  const steeringCard = page.locator("article").filter({ hasText: "전륜 조향각" });
  await expect(steeringCard.locator("strong")).not.toHaveText("0.0°", { timeout: 3_000 });
  await page.keyboard.up("a");
});

test("exposes M3A track-limit and wall telemetry in driving mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "주행 모드" }).click();

  await expect(page.getByText("트랙 리밋", { exact: true })).toBeVisible();
  await expect(page.getByLabel("차량 텔레메트리").getByText("벽·연석 접촉", { exact: true })).toBeVisible();
  await expect(page.getByText("AI 트랙 리밋", { exact: true })).toBeVisible();
});

test("opens the M2B to M2D race weekend control surface", async ({ page }) => {
  await page.goto("/");

  await openRaceWeekend(page);
  await expect(page.locator("header").getByText("연습 준비", { exact: true })).toBeVisible();
  await expect(page.getByLabel("타이어 선택")).toHaveValue("medium");
  await expect(page.getByLabel("피트 정지 랩")).toBeVisible();
  await expect(page.getByText("M2B · 다차량", { exact: true })).toBeVisible();
});

test("runs deterministic qualifying cuts and exposes valid lap rules", async ({ page }) => {
  await page.goto("/");
  await openRaceWeekend(page);

  await page.getByRole("button", { name: "퀄리파잉 실행" }).click();
  await expect(page.getByText("Q1 20 → 15 완료", { exact: true })).toBeVisible();
  await expect(page.getByText("Q2 15 → 10 완료", { exact: true })).toBeVisible();
  await expect(page.getByText("Q3 10 최종 순위 확정", { exact: true })).toBeVisible();
  await expect(page.locator("header").getByText("퀄리파잉 완료", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "레이스 시작" })).toBeEnabled();
});

test("starts the multi-car race from the qualifying grid and resets the weekend", async ({ page }) => {
  await page.goto("/");
  await openRaceWeekend(page);
  await page.getByRole("button", { name: "퀄리파잉 실행" }).click();
  await page.getByRole("button", { name: "레이스 시작" }).click();

  await expect(page.locator("header").getByText("레이스 진행 중", { exact: true })).toBeVisible();
  await expect(page.getByText("20대 그리드", { exact: true })).toBeVisible();
  await expect(page.locator(".weekend-standing-row")).toHaveCount(8);

  await page.getByRole("button", { name: "주말 리셋" }).click();
  await expect(page.locator("header").getByText("연습 준비", { exact: true })).toBeVisible();
  await expect(page.getByText("Q1 20 → 15 대기", { exact: true })).toBeVisible();
});

test("shows M3A contact and track-limit state in the race weekend panel", async ({ page }) => {
  await page.goto("/");
  await openRaceWeekend(page);
  await expect(page.getByText("M3A · 트랙 리밋·접촉", { exact: true })).toBeVisible();
  await expect(page.getByText(/차량 접촉/).first()).toBeVisible();
  await expect(page.getByText(/PLAYER \d+회 위반/)).toBeVisible();
});

test("shows M3B to M3D tyre, racecraft, and race-operations state", async ({ page }) => {
  await page.goto("/");
  await openRaceWeekend(page);

  await expect(page.getByText("M3B · 타이어 상태", { exact: true })).toBeVisible();
  await expect(page.getByText("M3C · 레이스크래프트", { exact: true })).toBeVisible();
  await expect(page.getByText("M3D · 플래그·운영", { exact: true })).toBeVisible();
  await expect(page.getByText(/MEDIUM · 44 °C/)).toBeVisible();
  await expect(page.getByText(/GREEN · 0\.0% 손상/)).toBeVisible();

  await page.getByRole("button", { name: "퀄리파잉 실행" }).click();
  await page.getByRole("button", { name: "레이스 시작" }).click();
  await expect(page.getByText(/MEDIUM · \d+ °C/)).toBeVisible();
  await expect(page.getByText(/FOLLOW|ATTACK|DEFEND|AVOID/).first()).toBeVisible();
});

test("starts deterministic replay recording when the visible race begins", async ({ page }) => {
  await page.goto("/");
  await openRaceWeekend(page);
  await page.getByRole("button", { name: "퀄리파잉 실행" }).click();
  await page.getByRole("button", { name: "레이스 시작" }).click();

  // 20대 Rapier의 실제 3랩 결과 수렴은 RaceWeekendSession 단위 테스트로 결정적으로 검증한다.
  // 브라우저 E2E는 사용자에게 보이는 시작·리플레이 기록 상태를 GPU 시간과 무관하게 확인한다.
  await expect(page.locator(".weekend-stage")).toHaveText("레이스 진행 중");
  await expect(page.getByRole("button", { name: "주말 리셋" })).toBeVisible();
  await expect(page.getByText("현재 레이스 순위", { exact: true })).toBeVisible();
  await expect(page.getByText("M5 · DETERMINISTIC REPLAY", { exact: true })).toBeVisible();
  await expect(page.locator(".weekend-replay strong")).toHaveText("RECORDING");
  await expect(page.locator(".weekend-replay em")).toHaveText(/0 frames · 120 Hz|[1-9]\d* frames · 120 Hz/u);
});
