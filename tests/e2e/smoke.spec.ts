import { expect, test } from "@playwright/test";

test("loads the Milestone 0 foundation shell", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("S1 Racing");
  await expect(page.getByRole("heading", { name: "S1 Racing" })).toBeVisible();
  await expect(page.getByText("PROJECT FOUNDATION / MILESTONE 0")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByText("Milestone 1A")).toBeVisible();
});
