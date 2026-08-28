import { defineConfig } from "@playwright/test";

// Two lanes that must never mix. The default lane is fully mocked and deterministic;
// the integration lane drives the disposable real-server fixture (scripts/integration.sh)
// and is opt-in, so a contributor running `bun run test:e2e` never needs Docker.
const integration = process.env.BLOCKOPS_E2E_INTEGRATION === "true";

export default defineConfig({
  testDir: "./e2e",
  // Real Paper boots, RCON round trips, and world archiving are all slower than the
  // mocked lane's budget, and a too-tight timeout here reads as a product failure.
  timeout: integration ? 180_000 : 30_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: "line",
  projects: [
    integration
      ? { name: "integration", testMatch: /integration\.spec\.ts/ }
      : { name: "mocked", testMatch: /blockops\.spec\.ts/ },
  ],
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
