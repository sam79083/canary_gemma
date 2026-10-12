import { defineConfig, devices } from "@playwright/test";

// Smoke UI test: needs NO AI model, NO keys, NO network beyond localhost.
// The rule-based quiz runs fully offline.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
