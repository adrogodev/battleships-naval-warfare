import { defineConfig, devices } from "@playwright/test";

const CLIENT_URL = "http://localhost:4173";

/**
 * End-to-end tests against the real server and a production build of the client.
 * Each test opens two browser contexts (two players) in the same browser engine.
 */
export default defineConfig({
  testDir: "e2e",
  // One full game can take a couple hundred shots.
  timeout: 240_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: CLIENT_URL,
    // Recording a trace on every run doubles the cost of each action in WebKit.
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: "pnpm --filter @battleships/server start",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command:
        "pnpm --filter @battleships/client build && pnpm --filter @battleships/client preview --port 4173 --strictPort",
      url: CLIENT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
