import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const username = process.env.BLOCKOPS_E2E_USERNAME ?? "blockops-e2e-admin";
const password = process.env.BLOCKOPS_E2E_PASSWORD ?? "BlockOps E2E passphrase 42!";
// compose.integration.yaml pins both. The journey asserts the fixture it was handed,
// not whatever server happens to answer on the configured port.
const software = process.env.BLOCKOPS_E2E_SOFTWARE ?? "Paper";
const minecraftVersion = process.env.BLOCKOPS_E2E_MINECRAFT_VERSION ?? "1.21.4";

const byteRange = String.raw`[\d.]+ (B|KB|MB|GB|TB)`;

test("the real Minecraft integration reports live state and completes a safe backup", async ({ page }) => {
  // Every assertion below has to survive a real Docker, RCON, and filesystem round trip.
  // One stray handler would quietly demote this to a second mocked journey, so
  // interception is removed from the page rather than merely discouraged.
  const refuseInterception = (): never => {
    throw new Error("The real-integration journey must never intercept an endpoint.");
  };
  page.route = refuseInterception;
  page.routeWebSocket = refuseInterception;
  page.context().route = refuseInterception;

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  const setupHeading = page.getByRole("heading", { name: "Create the first administrator" });
  const loginHeading = page.getByRole("heading", { name: "Welcome back" });
  await expect(setupHeading.or(loginHeading)).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: await setupHeading.isVisible() ? "Create administrator" : "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Minecraft server" })).toBeVisible();
  // The header and the sidebar carry their own state pills, so this is scoped to the
  // lifecycle card rather than matched across the whole page.
  const serverState = page.locator("#main-content").getByText("online", { exact: true });
  await expect(serverState).toBeVisible();

  const detail = (label: string) => page.locator(`dl div:has(> dt:text-is("${label}")) dd`);
  // Paper answers RCON `version` asynchronously, so software and version are still
  // empty for the first seconds after mc-health reports the fixture healthy, while
  // state, metrics, disk, and players are already correct. The retry is the point.
  await expect(detail("Software")).toHaveText(software, { timeout: 60_000 });
  await expect(detail("Version")).toContainText(minecraftVersion, { timeout: 60_000 });
  await expect(detail("Container image")).toContainText("itzg/minecraft-server@sha256:");
  await expect(detail("Uptime")).not.toHaveText("Unavailable");

  const metric = (label: string) => page.locator(`p:text-is("${label}") + strong`);
  await expect(metric("CPU")).toHaveText(/^\d+(\.\d+)?%$/);
  await expect(metric("Memory")).toHaveText(new RegExp(`^${byteRange} / ${byteRange}$`));
  await expect(metric("Disk")).toHaveText(new RegExp(`^${byteRange} / ${byteRange}$`));
  await expect(page.getByLabel("CPU utilization")).toBeVisible();
  await expect(page.getByText(/^\d+ \/ \d+ online$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Integration unavailable" })).toBeHidden();

  // Nothing ever joins the fixture, so the real catalog is legitimately empty. This
  // asserts the vanilla access lists parsed, not merely that the request returned.
  await page.getByRole("link", { name: "Players", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No players found" })).toBeVisible();
  await expect(page.getByText("Player records appear after the server has seen a player.")).toBeVisible();

  await page.getByRole("link", { name: "Console", exact: true }).click();
  const consoleLog = page.getByRole("log");
  await expect(page.getByText("connected", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(consoleLog).toContainText('For help, type "help"');

  // The overview poll and the command below both open RCON connections, and Paper logs
  // each one. Growth past the history snapshot is what proves the socket is streaming.
  const linesBeforeCommand = await consoleLog.locator("> div").count();
  await page.getByLabel("Minecraft command").fill("list");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/There are \d+ of a max of \d+ players online/)).toBeVisible();
  await expect.poll(() => consoleLog.locator("> div").count(), { timeout: 30_000 })
    .toBeGreaterThan(linesBeforeCommand);

  await page.getByRole("link", { name: "Backups", exact: true }).click();
  const backupRows = page.getByRole("list", { name: "Local backup catalog" }).getByRole("listitem");
  await expect(page.getByRole("heading", { name: "Backups", exact: true })).toBeVisible();
  // Counting while the catalog is still loading reads 0 and turns the assertion below
  // into a silent off-by-one whenever the fixture already holds a backup.
  await expect(page.getByText("Loading local backup catalog")).toBeHidden();
  const backupsBefore = await backupRows.count();
  await page.getByRole("button", { name: /^Create (backup|first backup)$/ }).first().click();
  await expect(page.getByRole("heading", { name: "Create a consistent backup?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Create backup" }).click();
  await expect(backupRows).toHaveCount(backupsBefore + 1, { timeout: 120_000 });
  const newest = backupRows.first();
  await expect(newest).toContainText("ready");
  await expect(newest).toContainText(`Created by ${username}`);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    newest.getByRole("link", { name: "Download" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^blockops-backup-[0-9a-f]{32}\.tar\.gz$/);
  const archivePath = await download.path();
  // A gzip magic number, not just a 200 with a download header on an error body.
  expect([...readFileSync(archivePath).subarray(0, 2)]).toEqual([0x1f, 0x8b]);

  // A full document load, so console history is refetched rather than served from the
  // query cache that predates the backup.
  await page.goto("/console");
  await page.getByRole("searchbox", { name: "Search console" }).fill("Automatic saving");
  // Both ends of the consistency cycle. A backup that strands the world in save-off
  // is the failure this catches.
  await expect(consoleLog).toContainText("Automatic saving is now disabled");
  await expect(consoleLog).toContainText("Automatic saving is now enabled");

  // Filtered to one row each so the action, the actor, and the recorded details are
  // asserted together. A run against a reused fixture sees earlier attempts too.
  await page.goto("/audit?q=console.command&outcome=success");
  await expect(page.getByRole("row")
    .filter({ hasText: "console.command" })
    .filter({ hasText: '{"command":"list"}' })
    .first()).toBeVisible();
  await page.goto("/audit?q=backup.create&outcome=success");
  await expect(page.getByRole("row")
    .filter({ hasText: "backup.create" })
    .filter({ hasText: username })
    .first()).toBeVisible();
  const [auditDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export CSV" }).click(),
  ]);
  expect(auditDownload.suggestedFilename()).toMatch(/^blockops-audit-\d{8}-\d{6}\.csv$/);
  const auditPath = await auditDownload.path();
  if (!auditPath) throw new Error("The audit export did not produce a local file.");
  const auditCSV = readFileSync(auditPath, "utf8");
  expect(auditCSV).toContain("occurred_at,id,principal_kind,principal_id,server_id,node_id,request_id,job_id,attempt,user_id,username,action,target,source_ip,outcome,details");
  expect(auditCSV).toContain("backup.create");

  await page.goto("/overview");
  await expect(serverState).toBeVisible();
  await expect(metric("CPU")).toHaveText(/^\d+(\.\d+)?%$/);
  expect(pageErrors).toEqual([]);
});
