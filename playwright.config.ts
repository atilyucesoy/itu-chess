import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "browser.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3099",
    headless: true,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "node --import tsx scripts/test-server.ts",
    url: "http://127.0.0.1:3099/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
