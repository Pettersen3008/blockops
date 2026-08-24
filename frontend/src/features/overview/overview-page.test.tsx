import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, delay, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { authKeys } from "@/features/auth";
import type { Role, Session } from "@/features/auth";
import { formatDate } from "@/formatters";
import { configureCsrfToken } from "@/lib/api/api";
import { server } from "@/test/setup";
import { OverviewPage } from "./overview-page";

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

const unavailableOverview = {
  server: { available: false, message: "Container metrics unavailable." },
  metrics: { available: false, message: "CPU and memory metrics are unavailable." },
  disk: { available: false, message: "Disk usage is unavailable." },
  players: { available: false, message: "Player data is unavailable." },
  recentWarnings: [],
};

const backup = {
  id: "0123456789abcdef0123456789abcdef",
  sizeBytes: 1024,
  createdAt: "2026-08-24T10:00:00Z",
  createdBy: "admin",
  status: "ready",
};

const availableOverview = {
  server: {
    available: true,
    value: {
      state: "online",
      image: "ghcr.io/example/minecraft:latest",
      uptimeSeconds: 3_900,
      version: "1.21.8",
      software: "Paper",
    },
  },
  metrics: { available: true, value: { cpuPercent: 12.3, memoryUsageBytes: 1536, memoryLimitBytes: 2048 } },
  disk: { available: true, value: { usedBytes: 5 * 1024 ** 3, totalBytes: 10 * 1024 ** 3 } },
  players: { available: true, value: { online: 2, max: 20, names: ["Zed", "Alex"] } },
  recentWarnings: [
    { sequence: 9, timestamp: "2026-08-24T09:59:00Z", text: "[WARN] First signal" },
    { sequence: 10, timestamp: "2026-08-24T10:00:00Z", text: "[ERROR] Second signal" },
  ],
  lastSuccessfulBackup: backup,
};

const unrelatedQueryKey = ["unrelated-feature", "detail"] as const;

afterEach(() => configureCsrfToken(() => undefined));

function renderOverview(
  currentSession = session,
  queryOptions: { retry?: boolean | number; retryDelay?: number } = { retry: false },
) {
  configureCsrfToken(() => currentSession.csrfToken);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: queryOptions,
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <OverviewPage session={currentSession} />
    </QueryClientProvider>,
  );
  return queryClient;
}

function sessionWithRole(role: Role): Session {
  return { ...session, user: { ...session.user, role } };
}

describe("OverviewPage", () => {
  it("shows loading, unavailable integrations, empty warnings, and retryable errors", async () => {
    let requests = 0;
    server.use(http.get("/api/v1/overview", async () => {
      requests += 1;
      await delay(40);
      if (requests === 1) return HttpResponse.json({ error: { code: "unavailable", message: "Live state failed." } }, { status: 503 });
      return HttpResponse.json(unavailableOverview);
    }));
    renderOverview();

    expect(screen.getByText("Reading live server state")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("Live state failed.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Integration unavailable" })).toBeVisible();
    expect(screen.getByText("No recent warnings are present in the bounded console buffer.")).toBeVisible();
    expect(screen.getAllByText("Unavailable", { exact: true })).not.toHaveLength(0);
  });

  it("uses the application retry policy when a transient query fails", async () => {
    let requests = 0;
    server.use(http.get("/api/v1/overview", () => {
      requests += 1;
      return requests === 1
        ? HttpResponse.json({ error: { code: "temporary", message: "Temporary failure." } }, { status: 503 })
        : HttpResponse.json(unavailableOverview);
    }));
    renderOverview(session, { retry: 1, retryDelay: 0 });

    expect(await screen.findByRole("heading", { name: "Integration unavailable" })).toBeVisible();
    expect(requests).toBe(2);
    expect(screen.queryByText("Temporary failure.")).not.toBeInTheDocument();
  });

  it("renders available state, formatting, server order, capacity, and warnings", async () => {
    server.use(http.get("/api/v1/overview", () => HttpResponse.json(availableOverview)));
    renderOverview();

    expect(await screen.findByRole("heading", { name: "Minecraft server" })).toBeVisible();
    expect(screen.getByText("Paper")).toBeVisible();
    expect(screen.getByText("1.21.8")).toBeVisible();
    expect(screen.getByText("1h 5m")).toBeVisible();
    expect(screen.getByText("12.3%", { selector: "strong" })).toBeVisible();
    expect(screen.getByText("1.5 KB / 2.0 KB")).toBeVisible();
    expect(screen.getByText("5.0 GB / 10 GB")).toBeVisible();
    expect(screen.getByText(formatDate(backup.createdAt))).toBeVisible();
    expect(screen.getByText("2", { selector: "strong" })).toBeVisible();
    expect(screen.getByLabelText("CPU utilization")).toHaveAttribute("value", "12.3");

    const playerList = screen.getByText("Zed").closest("ul");
    expect(playerList).not.toBeNull();
    expect(within(playerList!).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Zed", "Alex"]);

    const warnings = screen.getByRole("heading", { name: "Console warnings" }).closest("section");
    expect(warnings).not.toBeNull();
    expect(within(warnings!).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "[WARN] First signal",
      "[ERROR] Second signal",
    ]);
  });

  it("rejects malformed query success without rendering untrusted values", async () => {
    server.use(http.get("/api/v1/overview", () => HttpResponse.json({
      ...unavailableOverview,
      recentWarnings: [{ text: "untrusted warning" }],
    })));
    renderOverview();

    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText("untrusted warning")).not.toBeInTheDocument();
  });

  it("creates a validated backup, sends CSRF, broadly invalidates, and closes only on success", async () => {
    const user = userEvent.setup();
    let csrf: string | null = null;
    server.use(
      http.get("/api/v1/overview", () => HttpResponse.json(unavailableOverview)),
      http.post("/api/v1/backups", ({ request }) => {
        csrf = request.headers.get("X-CSRF-Token");
        return HttpResponse.json(backup, { status: 201 });
      }),
    );
    const queryClient = renderOverview();
    queryClient.setQueryData(unrelatedQueryKey, { cached: true });
    queryClient.setQueryData(authKeys.session(), session);

    const trigger = await screen.findByRole("button", { name: "Back up now" });
    await user.click(trigger);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create backup" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(csrf).toBe("csrf-token");
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(authKeys.session())?.isInvalidated).toBe(true);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps backup confirmation and cache intact after failure or malformed success", async () => {
    const user = userEvent.setup();
    let response: "failure" | "malformed" = "failure";
    server.use(
      http.get("/api/v1/overview", () => HttpResponse.json(unavailableOverview)),
      http.post("/api/v1/backups", () => response === "failure"
        ? HttpResponse.json({ error: { code: "backup_failed", message: "The backup could not be created safely." } }, { status: 503 })
        : HttpResponse.json({ ...backup, id: "unsafe/id" }, { status: 201 })),
    );
    const queryClient = renderOverview();
    queryClient.setQueryData(unrelatedQueryKey, { cached: true });

    await user.click(await screen.findByRole("button", { name: "Back up now" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create backup" }));
    expect(await screen.findByText("The backup could not be created safely.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(false);

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    response = "malformed";
    await user.click(screen.getByRole("button", { name: "Back up now" }));
    expect(screen.queryByText("The backup could not be created safely.")).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create backup" }));
    expect(await screen.findByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(false);
  });

  it("posts a validated lifecycle action and broadly invalidates cached views", async () => {
    const user = userEvent.setup();
    let request: { body: unknown; csrf: string | null } | undefined;
    server.use(
      http.get("/api/v1/overview", () => HttpResponse.json(unavailableOverview)),
      http.post("/api/v1/server/actions", async ({ request: incoming }) => {
        request = { body: await incoming.json(), csrf: incoming.headers.get("X-CSRF-Token") };
        return HttpResponse.json({ status: "restart requested" }, { status: 202 });
      }),
    );
    const queryClient = renderOverview();
    queryClient.setQueryData(unrelatedQueryKey, { cached: true });
    queryClient.setQueryData(authKeys.session(), session);

    await user.click(await screen.findByRole("button", { name: "Graceful restart" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restart server" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(request).toEqual({ body: { action: "restart" }, csrf: "csrf-token" });
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(authKeys.session())?.isInvalidated).toBe(true);
  });

  it("keeps lifecycle confirmation visible and skips cleanup or invalidation on malformed success", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/overview", () => HttpResponse.json(unavailableOverview)),
      http.post("/api/v1/server/actions", () => HttpResponse.json({ status: "unexpected" }, { status: 202 })),
    );
    const queryClient = renderOverview();
    queryClient.setQueryData(unrelatedQueryKey, { cached: true });

    await user.click(await screen.findByRole("button", { name: "Graceful restart" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restart server" }));

    expect(await screen.findByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(false);
  });

  it("disables confirmation while a lifecycle request is pending and reports failure", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/overview", () => HttpResponse.json(unavailableOverview)),
      http.post("/api/v1/server/actions", async () => {
        await delay(40);
        return HttpResponse.json({ error: { code: "server_action_failed", message: "The configured Minecraft container could not be changed." } }, { status: 503 });
      }),
    );
    renderOverview();

    await user.click(await screen.findByRole("button", { name: "Graceful restart" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restart server" }));
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(await screen.findByText("The configured Minecraft container could not be changed.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("restores focus when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/overview", () => HttpResponse.json(unavailableOverview)));
    renderOverview();

    const restart = await screen.findByRole("button", { name: "Graceful restart" });
    await user.click(restart);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(restart).toHaveFocus());
  });

  it.each([
    ["administrator", true, true, true],
    ["operator", true, true, false],
    ["viewer", false, false, false],
  ] as const)("renders only %s permissions", async (role, backupAllowed, restartAllowed, lifecycleAllowed) => {
    server.use(http.get("/api/v1/overview", () => HttpResponse.json(unavailableOverview)));
    renderOverview(sessionWithRole(role));

    await screen.findByRole("heading", { name: "Overview" });
    expect(screen.queryByRole("button", { name: "Back up now" }) !== null).toBe(backupAllowed);
    expect(screen.queryByRole("button", { name: "Graceful restart" }) !== null).toBe(restartAllowed);
    expect(screen.queryByLabelText("Server lifecycle controls") !== null).toBe(lifecycleAllowed);
    expect(screen.queryByRole("button", { name: "Start" }) !== null).toBe(lifecycleAllowed);
    expect(screen.queryByRole("button", { name: "Stop" }) !== null).toBe(lifecycleAllowed);
  });
});
