import { expect, test, type Page } from "@playwright/test";
import { buildZip, readWorldArchiveEntry } from "./world-archive";

const username = process.env.BLOCKOPS_E2E_USERNAME ?? "blockops-e2e-admin";
const password = process.env.BLOCKOPS_E2E_PASSWORD ?? "BlockOps E2E passphrase 42!";
const fixtureContainer = "blockops-integration-minecraft";
const markerPath = "world/blockops-e2e-marker.txt";

test("the disposable fixture survives lifecycle and world recovery operations", async ({ page }) => {
  const refuseInterception = (): never => {
    throw new Error("The destructive journey must never intercept an endpoint.");
  };
  page.route = refuseInterception;
  page.routeWebSocket = refuseInterception;
  page.context().route = refuseInterception;

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await login(page);
  await page.goto("/settings");
  await expect(page.locator('dl div:has(> dt:text-is("Minecraft container")) dd'))
    .toHaveText(fixtureContainer);

  await page.goto("/overview");
  await page.getByRole("button", { name: "Graceful restart" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restart server" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 60_000 });
  await waitForServerReady(page);

  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Stop server" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 60_000 });
  await expect(serverState(page, "offline")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start server" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 60_000 });
  await waitForServerReady(page);

  const initialArchive = await downloadWorld(page);
  const levelDat = readWorldArchiveEntry(initialArchive, "world/level.dat");

  await replaceWorld(page, buildWorldZip(levelDat, "before restore"));
  await waitForServerReady(page);

  await page.goto("/backups");
  const backupRows = page.getByRole("list", { name: "Local backup catalog" }).getByRole("listitem");
  await expect(page.getByText("Loading local backup catalog")).toBeHidden();
  const backupsBefore = await backupRows.count();
  await page.getByRole("button", { name: /^Create (backup|first backup)$/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Create backup" }).click();
  await expect(backupRows).toHaveCount(backupsBefore + 1, { timeout: 120_000 });

  await replaceWorld(page, buildWorldZip(levelDat, "after backup"));
  await waitForServerReady(page);
  expect(await readMarker(page)).toBe("after backup");

  await page.goto("/backups");
  await backupRows.first().getByRole("button", { name: "Restore" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore backup" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 120_000 });
  await waitForServerReady(page);
  expect(await readMarker(page)).toBe("before restore");

  await page.goto("/worlds");
  await page.getByLabel(/Choose a world ZIP/).setInputFiles({
    name: "unsafe-world.zip",
    mimeType: "application/zip",
    buffer: buildZip([
      { name: "world/level.dat", data: levelDat },
      { name: "../escape.txt", data: Buffer.from("must not escape") },
    ]),
  });
  await page.getByRole("button", { name: "Replace current world" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Replace world" }).click();
  await expect(page.getByText("The uploaded ZIP was unsafe or could not replace the world."))
    .toBeVisible();
  expect(await readMarker(page)).toBe("before restore");
  expect(pageErrors).toEqual([]);
});

async function login(page: Page) {
  await page.goto("/");
  const setupHeading = page.getByRole("heading", { name: "Create the first administrator" });
  const loginHeading = page.getByRole("heading", { name: "Welcome back" });
  await expect(setupHeading.or(loginHeading)).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: await setupHeading.isVisible() ? "Create administrator" : "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
}

function serverState(page: Page, state: "online" | "offline") {
  return page.locator("#main-content").getByText(state, { exact: true });
}

async function waitForServerReady(page: Page) {
  await page.goto("/overview");
  await expect(serverState(page, "online")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('dl div:has(> dt:text-is("Software")) dd'))
    .toHaveText("Paper", { timeout: 120_000 });
}

function buildWorldZip(levelDat: Buffer, marker: string) {
  return buildZip([
    { name: "world/level.dat", data: levelDat },
    { name: markerPath, data: Buffer.from(marker) },
  ]);
}

async function replaceWorld(page: Page, archive: Buffer) {
  await page.goto("/worlds");
  await page.getByLabel(/Choose a world ZIP/).setInputFiles({
    name: "replacement-world.zip",
    mimeType: "application/zip",
    buffer: archive,
  });
  await page.getByRole("button", { name: "Replace current world" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Replace world" }).click();
  await expect(page.getByText("World replacement completed and the configured server was started."))
    .toBeVisible({ timeout: 120_000 });
}

async function downloadWorld(page: Page) {
  await page.goto("/worlds");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Prepare download" }).click(),
  ]);
  const archivePath = await download.path();
  if (!archivePath) throw new Error("The world archive download did not produce a local file.");
  return archivePath;
}

async function readMarker(page: Page) {
  return readWorldArchiveEntry(await downloadWorld(page), markerPath).toString("utf8");
}
