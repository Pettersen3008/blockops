import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { formatDate } from "@/formatters";
import { server } from "@/test/setup";
import { AuditPage } from "./audit-page";

const successEvent = {
  id: "0123456789abcdef0123456789abcdef",
  occurredAt: "2026-08-17T12:00:00Z",
  username: "Admin",
  action: "auth.setup",
  target: "dashboard",
  sourceIp: "127.0.0.1",
  outcome: "success",
  details: { role: "administrator" },
};

const failureEvent = {
  ...successEvent,
  id: "1123456789abcdef0123456789abcdef",
  occurredAt: "2026-08-17T11:00:00Z",
  username: undefined,
  action: "backup.create",
  target: "world",
  sourceIp: "10.0.0.8",
  outcome: "failure",
  details: { reason: "Disk FULL" },
};

const deniedEvent = {
  ...successEvent,
  id: "2123456789abcdef0123456789abcdef",
  occurredAt: "2026-08-17T10:00:00Z",
  username: "operator",
  action: "authorization.denied",
  target: "/api/v1/settings",
  sourceIp: "10.0.0.9",
  outcome: "denied",
  details: { permission: "settings.manage" },
};

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{`${location.pathname}${location.search}`}</output>
      <button type="button" onClick={() => navigate(-1)}>Back</button>
      <button type="button" onClick={() => navigate(1)}>Forward</button>
    </>
  );
}

function renderAudit(initialEntries = ["/audit"], initialIndex = initialEntries.length - 1) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <AuditPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AuditPage", () => {
  it("shows loading, sends the bounded GET, and renders server order and table semantics", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let requestMethod = "";
    let requestLimit = "";
    server.use(http.get("/api/v1/audit", async ({ request }) => {
      requestMethod = request.method;
      requestLimit = new URL(request.url).searchParams.get("limit") ?? "";
      await blocked;
      return HttpResponse.json({ events: [successEvent, failureEvent, deniedEvent] });
    }));

    renderAudit();
    expect(screen.getByText("Loading administrative evidence")).toBeVisible();
    release?.();

    const table = await screen.findByRole("table", { name: "Most recent administrative audit events in server order" });
    expect(requestMethod).toBe("GET");
    expect(requestLimit).toBe("200");
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Time", "Outcome", "Actor", "Action", "Target", "Source", "Details",
    ]);
    expect(within(table).getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("auth.setup"),
      expect.stringContaining("backup.create"),
      expect.stringContaining("authorization.denied"),
    ]);
    expect(screen.getByText(formatDate(successEvent.occurredAt))).toBeVisible();
    expect(screen.getByRole("cell", { name: "Unauthenticated" })).toBeVisible();
    expect(within(table).getByText("success")).toHaveClass("status-pill--good");
    expect(within(table).getByText("failure")).toHaveClass("status-pill--bad");
    expect(within(table).getByText("denied")).toHaveClass("status-pill--warn");
    expect(table.closest("[data-slot='table-container']")).toHaveClass("overflow-x-auto");
    expect(table.closest("[data-slot='table-container']")?.parentElement).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");
  });

  it("retries a failed request from the visible error state", async () => {
    let requests = 0;
    server.use(http.get("/api/v1/audit", () => {
      requests += 1;
      return requests === 1
        ? HttpResponse.json({ error: { message: "Audit storage is unavailable." } }, { status: 503 })
        : HttpResponse.json({ events: [successEvent] });
    }));
    const user = userEvent.setup();
    renderAudit();

    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("Audit storage is unavailable.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("cell", { name: "auth.setup" })).toBeVisible();
    expect(requests).toBe(2);
  });

  it("distinguishes an empty catalog from filters with no matches", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/audit", () => HttpResponse.json({ events: [] })));
    const view = renderAudit();

    expect(await screen.findByRole("heading", { name: "No audit events yet" })).toBeVisible();
    view.unmount();

    server.use(http.get("/api/v1/audit", () => HttpResponse.json({ events: [successEvent] })));
    renderAudit();
    await screen.findByRole("cell", { name: "auth.setup" });
    await user.type(screen.getByRole("searchbox", { name: "Search audit events" }), "missing");
    expect(screen.getByRole("heading", { name: "No matching audit events" })).toBeVisible();
  });

  it("restores and updates URL filters with replace navigation", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/audit", () => HttpResponse.json({ events: [successEvent, failureEvent] })));
    renderAudit(["/audit?q=auth.setup&outcome=success"]);

    expect(await screen.findByRole("cell", { name: "auth.setup" })).toBeVisible();
    const search = screen.getByRole("searchbox", { name: "Search audit events" });
    expect(search).toHaveValue("auth.setup");
    expect(screen.getByRole("button", { name: "success" })).toHaveAttribute("aria-pressed", "true");

    await user.clear(search);
    await user.click(screen.getByRole("button", { name: "failure" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/audit?outcome=failure"));
    expect(screen.getByRole("cell", { name: "backup.create" })).toBeVisible();
    expect(screen.queryByRole("cell", { name: "auth.setup" })).not.toBeInTheDocument();
  });

  it("canonicalizes invalid outcomes without discarding other deep-link values", async () => {
    server.use(http.get("/api/v1/audit", () => HttpResponse.json({ events: [successEvent] })));
    renderAudit(["/audit?q=auth&keep=1&outcome=unexpected"]);

    expect(await screen.findByRole("cell", { name: "auth.setup" })).toBeVisible();
    expect(screen.getByRole("button", { name: "all" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/audit?q=auth&keep=1&outcome=all"));
  });

  it("keeps replaced filter state across browser back and forward", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/audit", () => HttpResponse.json({ events: [successEvent, failureEvent] })));
    renderAudit(["/before", "/audit?outcome=all"], 1);
    await screen.findByRole("cell", { name: "auth.setup" });

    await user.click(screen.getByRole("button", { name: "failure" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/audit?outcome=failure"));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/before");
    await user.click(screen.getByRole("button", { name: "Forward" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/audit?outcome=failure");
    expect(screen.getByRole("button", { name: "failure" })).toHaveAttribute("aria-pressed", "true");
  });

  it("filters every outcome and searches every field case-insensitively", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/audit", () => HttpResponse.json({ events: [successEvent, failureEvent, deniedEvent] })));
    renderAudit();
    await screen.findByRole("cell", { name: "auth.setup" });

    for (const [outcome, action] of [["success", "auth.setup"], ["failure", "backup.create"], ["denied", "authorization.denied"]] as const) {
      await user.click(screen.getByRole("button", { name: outcome }));
      expect(screen.getByRole("cell", { name: action })).toBeVisible();
      expect(screen.getAllByRole("row")).toHaveLength(2);
    }

    await user.click(screen.getByRole("button", { name: "all" }));
    const search = screen.getByRole("searchbox", { name: "Search audit events" });
    for (const value of ["ADMIN", "AUTH.SETUP", "DASHBOARD", "127.0.0.1", "ADMINISTRATOR", "disk full"]) {
      await user.clear(search);
      await user.type(search, value);
      expect(screen.getAllByRole("row")).toHaveLength(2);
    }
  });

  it("renders details as text and truncates their visible value safely", async () => {
    const unsafe = "<img src=x onerror=alert(1)>";
    const longDetails = { note: `${unsafe}${"x".repeat(220)}` };
    server.use(http.get("/api/v1/audit", () => HttpResponse.json({
      events: [{ ...successEvent, details: longDetails }],
    })));
    renderAudit();

    const details = await screen.findByText(`${JSON.stringify(longDetails).slice(0, 180)}…`);
    expect(details).toBeVisible();
    expect(details).toHaveClass("max-w-[260px]", "overflow-hidden", "text-ellipsis");
    expect(details.querySelector("img")).toBeNull();
    expect(screen.queryByText(JSON.stringify(longDetails), { exact: true })).not.toBeInTheDocument();
  });

  it("rejects malformed successful data before untrusted values render", async () => {
    server.use(http.get("/api/v1/audit", () => HttpResponse.json({
      events: [{ ...successEvent, action: "<script>unsafe</script>", outcome: "unknown" }],
    })));
    renderAudit(["/audit?outcome=unexpected"]);

    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText("<script>unsafe</script>")).not.toBeInTheDocument();
  });
});
