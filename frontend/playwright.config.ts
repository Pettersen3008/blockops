import { defineConfig } from "@playwright/test";

// Three lanes that must never mix. The default lane is fully mocked and deterministic;
// the integration lane drives the disposable real-server fixture (scripts/integration.sh)
// and is opt-in, so a contributor running `bun run test:e2e` never needs Docker. The
// destructive lane stops, restarts, restores, and overwrites world data on that same
// fixture, so it needs its own opt-in on top of the integration one.
const integration = process.env.BLOCKOPS_E2E_INTEGRATION === "true";
const destructive = process.env.BLOCKOPS_E2E_DESTRUCTIVE === "true";
const integrationProject = process.env.BLOCKOPS_E2E_COMPOSE_PROJECT;

if (destructive && (!integration || integrationProject !== "blockops-integration")) {
  throw new Error("The destructive lane needs BLOCKOPS_E2E_INTEGRATION=true and BLOCKOPS_E2E_COMPOSE_PROJECT=blockops-integration.");
}

const lane = destructive
  ? { name: "destructive", testMatch: /destructive\.spec\.ts/ }
  : integration
    ? { name: "integration", testMatch: /integration\.spec\.ts/ }
    : { name: "mocked", testMatch: /blockops\.spec\.ts/ };

export default defineConfig({
  testDir: "./e2e",
  // Real Paper boots, RCON round trips, and world archiving are all slower than the
  // mocked lane's budget, and a too-tight timeout here reads as a product failure.
  // The destructive journey boots Paper five times end to end.
  timeout: destructive ? 900_000 : integration ? 180_000 : 30_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: "line",
  projects: [lane],
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
