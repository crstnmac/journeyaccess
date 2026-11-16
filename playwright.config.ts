import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    // Use the installed Google Chrome instead of the bundled headless shell,
    // matching the browser channel the journey runner uses.
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm exec next dev -p 3100",
    url: "http://127.0.0.1:3100/demo-shop",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      // Journeys run against the deterministic mock judge in tests. Live Jev
      // behavior is exercised manually and via `pnpm dev`.
      JEV_MODE: "mock",
      NEXT_DIST_DIR: ".next-test",
    },
  },
});
