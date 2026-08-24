import { expect, test } from "@playwright/test";

const username = process.env.BLOCKOPS_E2E_USERNAME ?? "blockops-e2e-admin";
const password = process.env.BLOCKOPS_E2E_PASSWORD ?? "BlockOps E2E passphrase 42!";
const viewerUsername = `${username.slice(0, 24)}-viewer`;

test("secure first-run and primary operations remain usable when integrations are unavailable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const initialResponse = await page.goto("/");
  expect(initialResponse).not.toBeNull();
  const contentSecurityPolicy = initialResponse?.headers()["content-security-policy"];
  if (contentSecurityPolicy) {
    expect(contentSecurityPolicy).toContain("connect-src 'self'");
    expect(contentSecurityPolicy).not.toContain("unsafe-inline");
    expect(contentSecurityPolicy).not.toContain("unsafe-eval");
    expect(initialResponse?.headers()["x-content-type-options"]).toBe("nosniff");
  }
  const setupHeading = page.getByRole("heading", { name: "Create the first administrator" });
  const loginHeading = page.getByRole("heading", { name: "Welcome back" });
  await expect(setupHeading.or(loginHeading)).toBeVisible();
  if (await setupHeading.isVisible().catch(() => false)) {
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create administrator" }).click();
  } else {
    await expect(loginHeading).toBeVisible();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }

  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Integration unavailable" })).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true }).first()).toBeVisible();

  const restartButton = page.getByRole("button", { name: "Graceful restart" });
  await restartButton.click();
  await expect(page.getByRole("heading", { name: "Restart the Minecraft server?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Restart the Minecraft server?" })).toBeHidden();
  await expect(restartButton).toBeFocused();

  const stopButton = page.getByRole("button", { name: "Stop", exact: true });
  await stopButton.click();
  const stopConfirm = page.getByRole("button", { name: "Stop server" });
  await expect(stopConfirm).toBeVisible();
  expect(await stopConfirm.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe("rgb(180, 68, 60)");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(stopButton).toBeFocused();

  await page.route("**/api/v1/backups", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "backup_failed", message: "The backup could not be created safely." } }),
    });
  });
  const backupButton = page.getByRole("button", { name: "Back up now" });
  await backupButton.click();
  await page.getByRole("button", { name: "Create backup" }).click();
  await expect(page.getByText("The backup could not be created safely.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create a consistent backup?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(backupButton).toBeFocused();
  await page.unroute("**/api/v1/backups");

  await page.route("**/api/v1/server/actions", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "server_action_failed", message: "The configured Minecraft container could not be changed." } }),
  }));
  await restartButton.click();
  await page.getByRole("button", { name: "Restart server" }).click();
  await expect(page.getByText("The configured Minecraft container could not be changed.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Restart the Minecraft server?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(restartButton).toBeFocused();
  await page.unroute("**/api/v1/server/actions");

  const desktopOverflow = await page.evaluate(() => [...document.querySelectorAll("body *")]
    .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
    .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
    .slice(0, 10));
  expect(desktopOverflow).toEqual([]);

  await page.getByRole("link", { name: "Console", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Console", exact: true })).toBeVisible();
  await expect(page.getByText("connected", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Minecraft command")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("log")).toHaveAttribute("aria-live", "off");
  await page.getByRole("button", { name: "Return to live output" }).click();
  await expect(page.getByRole("log")).toHaveAttribute("aria-live", "polite");
  await page.getByLabel("Minecraft command").fill("say BlockOps browser check");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Minecraft did not accept the command.")).toBeVisible();

  await page.getByRole("link", { name: "Players", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  await page.route("**/api/v1/backups", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 400));
    return route.continue();
  });
  await page.getByRole("link", { name: "Backups", exact: true }).click();
  await expect(page.getByText("Loading local backup catalog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "No backups yet" })).toBeVisible();
  await page.unroute("**/api/v1/backups");

  const createBackupButton = page.getByRole("button", { name: "Create backup" });
  await createBackupButton.click();
  await expect(page.getByRole("heading", { name: "Create a consistent backup?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Create a consistent backup?" })).toBeHidden();
  await expect(createBackupButton).toBeFocused();
  await createBackupButton.click();
  await page.getByRole("button", { name: "Create backup" }).last().click();
  await expect(page.getByText("The backup could not be created safely.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.route("**/api/v1/backups", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ backups: [{
      id: "unsafe/id",
      sizeBytes: 1024,
      createdAt: "2026-08-17T12:00:00Z",
      createdBy: username,
      status: "ready",
    }] }),
  }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
  await expect(page.getByText("BlockOps returned an invalid response.")).toBeVisible();
  await expect(page.getByText("unsafe/id", { exact: true })).toBeHidden();
  await page.unroute("**/api/v1/backups");

  const browserBackups = [
    { id: "fedcba9876543210fedcba9876543210", sizeBytes: 1572864, createdAt: "2026-08-17T12:00:00Z", createdBy: username, status: "ready" },
    { id: "0123456789abcdef0123456789abcdef", sizeBytes: 1024, createdAt: "2026-08-16T11:00:00Z", createdBy: username, status: "ready" },
  ];
  await page.route("**/api/v1/backups", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ backups: browserBackups }),
  }));
  await page.reload();
  const backupRows = page.getByRole("list", { name: "Local backup catalog" }).getByRole("listitem");
  await expect(backupRows).toHaveCount(2);
  await expect(backupRows.nth(0)).toContainText(browserBackups[0].id);
  await expect(backupRows.nth(1)).toContainText(browserBackups[1].id);
  await expect(backupRows.nth(0).getByRole("link", { name: "Download" })).toHaveAttribute(
    "href",
    `/api/v1/backups/${browserBackups[0].id}/download`,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const backupOverflow = await page.evaluate(() => [...document.querySelectorAll("body *")]
    .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
    .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
    .slice(0, 10));
  expect(backupOverflow).toEqual([]);
  await expect(backupRows.nth(0).getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(backupRows.nth(0).getByRole("button", { name: "Restore" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.unroute("**/api/v1/backups");

  await page.getByRole("link", { name: "Audit log", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Audit log", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "auth.setup" })).toBeVisible();
  await page.goto("/audit?q=auth.setup&outcome=success");
  await expect(page.getByRole("searchbox", { name: "Search audit events" })).toHaveValue("auth.setup");
  await expect(page.getByRole("button", { name: "success" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("cell", { name: "auth.setup" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/audit\?q=auth\.setup&outcome=success$/);
  await expect(page.getByRole("cell", { name: "auth.setup" })).toBeVisible();

  const browserAuditEvents = [
    {
      id: "0123456789abcdef0123456789abcdef",
      occurredAt: "2026-08-17T12:00:00Z",
      username: "Admin",
      action: "auth.setup",
      target: "dashboard",
      sourceIp: "127.0.0.1",
      outcome: "success",
      details: { role: "administrator" },
    },
    {
      id: "1123456789abcdef0123456789abcdef",
      occurredAt: "2026-08-17T11:00:00Z",
      action: "backup.create",
      target: "world",
      sourceIp: "10.0.0.8",
      outcome: "failure",
      details: { reason: "Disk FULL" },
    },
    {
      id: "2123456789abcdef0123456789abcdef",
      occurredAt: "2026-08-17T10:00:00Z",
      username: "operator",
      action: "authorization.denied",
      target: "/api/v1/settings",
      sourceIp: "10.0.0.9",
      outcome: "denied",
      details: { permission: "settings.manage" },
    },
  ];
  await page.route("**/api/v1/audit?limit=200", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: browserAuditEvents }) });
  });
  await page.goto("/audit?outcome=unexpected");
  await expect(page.getByText("Loading administrative evidence")).toBeVisible();
  await expect(page).toHaveURL(/\/audit\?outcome=all$/);
  await expect(page.getByRole("cell", { name: "auth.setup" })).toBeVisible();
  await page.getByRole("button", { name: "failure" }).click();
  await expect(page).toHaveURL(/\/audit\?outcome=failure$/);
  await expect(page.getByRole("cell", { name: "backup.create" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search audit events" }).fill("disk full");
  await expect(page.getByRole("cell", { name: "backup.create" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search audit events" }).fill("missing event");
  await expect(page.getByRole("heading", { name: "No matching audit events" })).toBeVisible();
  await page.goto("/overview");
  await page.goto("/audit?outcome=all");
  await page.getByRole("button", { name: "denied" }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/audit\?outcome=denied$/);
  await expect(page.getByRole("cell", { name: "authorization.denied" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "denied" })).toHaveAttribute("aria-pressed", "true");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "all" }).click();
  const auditTableScrolls = await page.locator("[data-slot='table-container']").evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(auditTableScrolls).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("searchbox", { name: "Search audit events" }).focus();
  await expect(page.getByRole("searchbox", { name: "Search audit events" })).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.unroute("**/api/v1/audit?limit=200");
  await page.route("**/api/v1/audit?limit=200", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ events: [{ ...browserAuditEvents[0], action: "<script>unsafe</script>", outcome: "unknown" }] }),
  }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
  await expect(page.getByText("BlockOps returned an invalid response.")).toBeVisible();
  await expect(page.getByText("<script>unsafe</script>", { exact: true })).toBeHidden();

  await page.unroute("**/api/v1/audit?limit=200");
  await page.route("**/api/v1/audit?limit=200", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ events: [] }),
  }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "No audit events yet" })).toBeVisible();

  await page.unroute("**/api/v1/audit?limit=200");

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByText("Never", { exact: true })).toBeVisible();
  await expect(page.getByText("Not available", { exact: true })).toBeVisible();

  const directRoutes = [
    ["/overview", "Overview"],
    ["/console", "Console"],
    ["/players", "Players"],
    ["/worlds", "Worlds"],
    ["/backups", "Backups"],
    ["/audit", "Audit log"],
    ["/settings", "Settings"],
  ] as const;
  for (const [path, label] of directRoutes) {
    expect((await page.goto(path))?.status()).toBe(200);
    await expect(page.locator(".breadcrumb strong")).toHaveText(label);
    expect((await page.reload())?.status()).toBe(200);
    await expect(page.locator(".breadcrumb strong")).toHaveText(label);
  }

  expect((await page.goto("/missing-route"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "There is nothing here" })).toBeVisible();
  expect((await page.goto("/"))?.status()).toBe(200);
  await expect(page).toHaveURL(/\/overview$/);

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).last().fill(viewerUsername);
  await page.getByLabel("Temporary password").fill(password);
  await page.getByLabel("Role").selectOption("viewer");
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText(viewerUsername, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByLabel("Username").fill(viewerUsername);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await page.route("**/api/v1/backups", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ backups: [{
      id: "fedcba9876543210fedcba9876543210",
      sizeBytes: 1572864,
      createdAt: "2026-08-17T12:00:00Z",
      createdBy: username,
      status: "ready",
    }] }),
  }));
  await page.goto("/backups");
  await expect(page.getByRole("heading", { name: "Backups", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create backup" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Delete" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Restore" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Download" })).toBeHidden();
  await page.unroute("**/api/v1/backups");
  await page.goto("/settings");
  await expect(page.getByText("Restricted area", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

  await page.goto("/audit");
  await expect(page.getByText("Restricted area", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit log", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  const overflowingElements = await page.evaluate(() => [...document.querySelectorAll("body *")]
    .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
    .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
    .slice(0, 10));
  expect(overflowingElements).toEqual([]);

  await page.unroute("**/api/v1/overview");
  await page.route("**/api/v1/overview", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.goto("/overview");
  await expect(page.getByText("Reading live server state")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Integration unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back up now" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Graceful restart" })).toHaveCount(0);
  await expect(page.getByLabel("Server lifecycle controls")).toHaveCount(0);
  await page.unroute("**/api/v1/overview");

  await page.route("**/api/v1/overview", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ unsafe: "unvalidated" }),
  }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
  await expect(page.getByText("BlockOps returned an invalid response.")).toBeVisible();
  await expect(page.getByText("unvalidated", { exact: true })).toBeHidden();
  await page.unroute("**/api/v1/overview");

  await page.route("**/api/v1/overview", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      server: { available: true, value: { state: "online", image: `ghcr.io/blockops/${"long-image-name-".repeat(20)}:latest`, uptimeSeconds: 3_900, version: "1.21.8", software: "Paper" } },
      metrics: { available: true, value: { cpuPercent: 12.3, memoryUsageBytes: 1536, memoryLimitBytes: 2048 } },
      disk: { available: true, value: { usedBytes: 5 * 1024 ** 3, totalBytes: 10 * 1024 ** 3 } },
      players: { available: true, value: { online: 2, max: 20, names: ["Zed", "Alex"] } },
      recentWarnings: [
        { sequence: 9, timestamp: "2026-08-24T09:59:00Z", text: `[WARN] ${"long warning text ".repeat(30)}` },
        { sequence: 10, timestamp: "2026-08-24T10:00:00Z", text: "[ERROR] Second signal" },
      ],
    }),
  }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Minecraft server" })).toBeVisible();
  await expect(page.getByText("1h 5m")).toBeVisible();
  await expect(page.getByText("1.5 KB / 2.0 KB")).toBeVisible();
  const warningItems = page.getByRole("heading", { name: "Console warnings" }).locator("xpath=ancestor::section").getByRole("listitem");
  await expect(warningItems).toHaveCount(2);
  await expect(warningItems.nth(0)).toContainText("[WARN]");
  await expect(warningItems.nth(1)).toContainText("[ERROR] Second signal");
  const overviewOverflow = await page.evaluate(() => [...document.querySelectorAll("body *")]
    .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
    .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
    .slice(0, 10));
  expect(overviewOverflow).toEqual([]);
  await page.unroute("**/api/v1/overview");

  expect(pageErrors).toEqual([]);
});
