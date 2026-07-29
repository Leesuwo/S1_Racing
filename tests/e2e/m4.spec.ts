import { expect, Page, test } from "@playwright/test";

/** M4A~M4C의 사용자 표시 경계와 레이스 시작 후 상태 갱신을 검증한다. */
test.describe("M4 race systems", () => {
  /** 레이스 주말 화면이 선택된 뒤 M4 카드가 렌더링되는 시점까지 기다린다. */
  async function openRaceWeekend(page: Page) {
    const tab = page.getByRole("tab", { name: "레이스 주말" });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Race Weekend" })).toBeVisible({ timeout: 20_000 });
  }

  test("shows Rapier collision, pit-lane, and regulation cards", async ({ page }) => {
    await page.goto("/");
    await openRaceWeekend(page);

    await expect(page.getByText("M4A · Rapier 차체 접촉", { exact: true })).toBeVisible();
    await expect(page.getByText("M4B · 실제 피트 레인", { exact: true })).toBeVisible();
    await expect(page.getByText("M4C · 레이스 규정", { exact: true })).toBeVisible();
    await expect(page.getByText("INACTIVE", { exact: true })).toBeVisible();
    await expect(page.getByText("GREEN", { exact: true })).toBeVisible();
  });

  test("keeps M4 regulation state visible after race start", async ({ page }) => {
    await page.goto("/");
    await openRaceWeekend(page);

    await page.getByRole("button", { name: "퀄리파잉 실행" }).click();
    await page.getByRole("button", { name: "레이스 시작" }).click();

    await expect(page.locator("header").getByText("레이스 진행 중", { exact: true })).toBeVisible();
    await expect(page.getByText("M4A · Rapier 차체 접촉", { exact: true })).toBeVisible();
    await expect(page.getByText("M4B · 실제 피트 레인", { exact: true })).toBeVisible();
    await expect(page.getByText("M4C · 레이스 규정", { exact: true })).toBeVisible();
    await expect(page.getByText(/\/ 12\.0 m\/s/).first()).toBeVisible();
  });
});
