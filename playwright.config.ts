import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const port = process.env.PLAYWRIGHT_PORT ?? "4173";

export default defineConfig({
  testDir: "./tests/e2e",
  // The prototype owns a WebGL context; serialize browser smoke tests to avoid
  // cross-test GPU/context contention in local and CI environments.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: externalBaseURL ?? `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
