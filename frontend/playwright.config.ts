import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: process.env.BLOCKOPS_E2E_URL ?? "http://127.0.0.1:5173",
    browserName: "chromium",
    headless: true,
    screenshot: "off",
    trace: "off",
    launchOptions: process.env.BLOCKOPS_E2E_CHROME_PATH
      ? { executablePath: process.env.BLOCKOPS_E2E_CHROME_PATH }
      : undefined,
  },
});
