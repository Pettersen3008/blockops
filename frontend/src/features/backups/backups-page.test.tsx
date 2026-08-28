import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "bun:test";
import { authKeys } from "@/features/auth";
import type { Session } from "@/features/auth";
import { formatBytes, formatDate } from "@/formatters";
import { configureCsrfToken } from "@/lib/api/api";
import { server } from "@/test/setup";
import { BackupsPage } from "./backups-page";

const session: Session = {
  user: {
    id: "admin-1",
    username: "admin",
    role: "administrator",
    disabled: false,
    createdAt: "2026-08-17T12:00:00Z",
  },
  csrfToken: "csrf-token",
  expiresAt: "2026-08-18T00:00:00Z",
};

const olderBackup = {
  id: "0123456789abcdef0123456789abcdef",
  sizeBytes: 1024,
  createdAt: "2026-08-16T11:00:00Z",
  createdBy: "operator.one",
  status: "ready",
} as const;

const newerBackup = {
  id: "fedcba9876543210fedcba9876543210",
  sizeBytes: 1_572_864,
  createdAt: "2026-08-17T12:00:00Z",
  createdBy: "admin",
  status: "ready",
} as const;

const unrelatedQueryKey = ["unrelated-feature", "detail"] as const;

afterEach(() => configureCsrfToken(() => undefined));

function renderBackups(currentSession = session) {
  configureCsrfToken(() => currentSession.csrfToken);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <BackupsPage session={currentSession} />
    </QueryClientProvider>,
  );

  return queryClient;
}

function catalog(backups = [newerBackup, olderBackup]) {
  server.use(http.get("/api/v1/backups", () => HttpResponse.json({ backups })));
}

describe("BackupsPage", () => {
  it("shows loading, retries a failed catalog, and renders the empty state", async () => {
    const user = userEvent.setup();
    let requests = 0;
    server.use(http.get("/api/v1/backups", () => {
      requests += 1;
      return requests === 1
        ? HttpResponse.json({ error: { code: "catalog_failed", message: "The backup catalog is unavailable." } }, { status: 503 })
        : HttpResponse.json({ backups: [] });
    }));
    renderBackups();

    expect(screen.getByRole("status")).toHaveTextContent("Loading local backup catalog");
    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("The backup catalog is unavailable.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "No backups yet" })).toBeVisible();
    expect(screen.getByText("Manual retention")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create first backup" })).toBeVisible();
    expect(requests).toBe(2);
  });

  it("preserves server order and formats every catalog value", async () => {
    catalog();
    renderBackups();

    const list = await screen.findByRole("list", { name: "Local backup catalog" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(formatDate(newerBackup.createdAt));
    expect(rows[0]).toHaveTextContent(`Created by admin · ${formatBytes(newerBackup.sizeBytes)}`);
    expect(rows[0]).toHaveTextContent(newerBackup.id);
    expect(rows[0]).toHaveTextContent("ready");
    expect(rows[1]).toHaveTextContent(formatDate(olderBackup.createdAt));
    expect(within(rows[0]!).getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      `/api/v1/backups/${newerBackup.id}/download`,
    );
    expect(rows[0]).toHaveClass("min-w-0");
  });

  it("creates a validated backup and broadly invalidates cached views", async () => {
    const user = userEvent.setup();
    let catalogRequests = 0;
    let csrfHeader: string | null = null;
    server.use(
      http.get("/api/v1/backups", () => {
        catalogRequests += 1;
        return HttpResponse.json({ backups: [] });
      }),
      http.post("/api/v1/backups", ({ request }) => {
        csrfHeader = request.headers.get("X-CSRF-Token");
        return HttpResponse.json(newerBackup, { status: 201 });
      }),
    );
    const queryClient = renderBackups();
    queryClient.setQueryData(unrelatedQueryKey, { status: "cached" });
    queryClient.setQueryData(authKeys.session(), session);

    await user.click(await screen.findByRole("button", { name: "Create first backup" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/World saves will be disabled briefly/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Create backup" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(csrfHeader as string | null).toBe("csrf-token");
    await waitFor(() => expect(catalogRequests).toBeGreaterThan(1));
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(authKeys.session())?.isInvalidated).toBe(true);
  });

  it.each([
    ["server failure", HttpResponse.json({ error: { code: "backup_failed", message: "The backup could not be created safely." } }, { status: 503 }), "The backup could not be created safely."],
    ["malformed success", HttpResponse.json({ ...newerBackup, id: "unsafe/id" }, { status: 201 }), "BlockOps returned an invalid response."],
  ])("keeps the create confirmation and cache intact after %s", async (_name, response, message) => {
    const user = userEvent.setup();
    catalog([]);
    server.use(http.post("/api/v1/backups", () => response));
    const queryClient = renderBackups();
    queryClient.setQueryData(unrelatedQueryKey, { status: "cached" });

    await user.click(await screen.findByRole("button", { name: "Create first backup" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create backup" }));

    expect(await within(screen.getByRole("dialog")).findByText(message)).toBeVisible();
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(false);
  });

  it("cancels deletion with focus return, then deletes through the exact endpoint", async () => {
    const user = userEvent.setup();
    let deleted = false;
    let csrfHeader: string | null = null;
    catalog([newerBackup]);
    server.use(http.delete(`/api/v1/backups/${newerBackup.id}`, ({ request }) => {
      deleted = true;
      csrfHeader = request.headers.get("X-CSRF-Token");
      return new HttpResponse(null, { status: 204 });
    }));
    const queryClient = renderBackups();
    queryClient.setQueryData(unrelatedQueryKey, { status: "cached" });

    const trigger = await screen.findByRole("button", { name: "Delete" });
    await user.click(trigger);
    expect(screen.getByText(/permanently removed. This cannot be undone/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(deleted).toBe(false);

    await user.click(trigger);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete backup" }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(csrfHeader as string | null).toBe("csrf-token");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(true);
  });

  it("restores a backup, disables dialog controls while pending, and invalidates", async () => {
    const user = userEvent.setup();
    catalog([newerBackup]);
    server.use(http.post(`/api/v1/backups/${newerBackup.id}/restore`, async () => {
      await delay(50);
      return HttpResponse.json({ status: "restored" });
    }));
    const queryClient = renderBackups();
    queryClient.setQueryData(unrelatedQueryKey, { status: "cached" });

    await user.click(await screen.findByRole("button", { name: "Restore" }));
    expect(screen.getByText(/prior world is kept for rollback/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(true);
  });

  it.each([
    ["delete", "Delete", "Delete backup", http.delete(`/api/v1/backups/${newerBackup.id}`, () => HttpResponse.json({ unexpected: true }))],
    ["restore", "Restore", "Restore backup", http.post(`/api/v1/backups/${newerBackup.id}/restore`, () => HttpResponse.json({ status: "unknown" }))],
  ])("rejects a malformed successful %s response without cleanup or invalidation", async (_name, triggerName, confirmName, handler) => {
    const user = userEvent.setup();
    catalog([newerBackup]);
    server.use(handler);
    const queryClient = renderBackups();
    queryClient.setQueryData(unrelatedQueryKey, { status: "cached" });

    await user.click(await screen.findByRole("button", { name: triggerName }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: confirmName }));

    expect(await within(screen.getByRole("dialog")).findByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(false);
  });

  it("keeps the restore confirmation visible after an HTTP failure", async () => {
    const user = userEvent.setup();
    catalog([newerBackup]);
    server.use(http.post(`/api/v1/backups/${newerBackup.id}/restore`, () => HttpResponse.json(
      { error: { code: "restore_failed", message: "The backup could not be restored. The prior world was preserved when possible." } },
      { status: 503 },
    )));
    const queryClient = renderBackups();
    queryClient.setQueryData(unrelatedQueryKey, { status: "cached" });

    await user.click(await screen.findByRole("button", { name: "Restore" }));
    await user.click(screen.getByRole("button", { name: "Restore backup" }));

    expect(await within(screen.getByRole("dialog")).findByText(/prior world was preserved when possible/)).toBeVisible();
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(false);
  });

  it("clears only the closed action failure before another action opens", async () => {
    const user = userEvent.setup();
    catalog([newerBackup]);
    server.use(http.delete(`/api/v1/backups/${newerBackup.id}`, () => HttpResponse.json(
      { error: { code: "backup_not_found", message: "The backup was not found." } },
      { status: 404 },
    )));
    renderBackups();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete backup" }));
    expect(await screen.findByText("The backup was not found.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Restore" }));

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.queryByText("The backup was not found.")).not.toBeInTheDocument();
  });

  it.each([
    ["operator", true, true, true, false],
    ["viewer", false, false, false, false],
  ] as const)("protects %s actions by permission", async (role, canCreate, canDelete, canDownload, canRestore) => {
    catalog([newerBackup]);
    renderBackups({ ...session, user: { ...session.user, role } });

    await screen.findByRole("list", { name: "Local backup catalog" });
    expect(Boolean(screen.queryByRole("button", { name: "Create backup" }))).toBe(canCreate);
    expect(Boolean(screen.queryByRole("button", { name: "Delete" }))).toBe(canDelete);
    expect(Boolean(screen.queryByRole("link", { name: "Download" }))).toBe(canDownload);
    expect(Boolean(screen.queryByRole("button", { name: "Restore" }))).toBe(canRestore);
  });
});
