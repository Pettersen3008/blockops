import { expect, test } from "@playwright/test";

const username = process.env.BLOCKOPS_E2E_USERNAME ?? "blockops-e2e-admin";
const password = process.env.BLOCKOPS_E2E_PASSWORD ?? "BlockOps E2E passphrase 42!";

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
  if (await setupHeading.isVisible().catch(() => false)) {
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create administrator" }).click();
  } else {
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }

  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Integration unavailable" })).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Graceful restart" }).click();
  await expect(page.getByRole("heading", { name: "Restart the Minecraft server?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Restart the Minecraft server?" })).toBeHidden();

  await page.getByRole("button", { name: "Console", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Console", exact: true })).toBeVisible();
  await expect(page.getByText("connected", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Minecraft command")).toBeVisible();

  await page.getByRole("button", { name: "Players", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  await page.getByRole("button", { name: "Backups", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No backups yet" })).toBeVisible();

  await page.getByRole("button", { name: "Audit log", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Audit log", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "auth.setup" })).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByText("Never", { exact: true })).toBeVisible();
  await expect(page.getByText("Not available", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  const overflowingElements = await page.evaluate(() => [...document.querySelectorAll("body *")]
    .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
    .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
    .slice(0, 10));
  expect(overflowingElements).toEqual([]);

  expect(pageErrors).toEqual([]);
});
