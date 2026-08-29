import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "bun:test";
import type { Session } from "@/features/auth";
import { configureCsrfToken } from "@/lib/api/api";
import { server } from "@/test/setup";
import { ConsolePage } from "./console-page";

const session: Session = {
  user: { id: "admin-1", username: "admin", role: "administrator", disabled: false, createdAt: "2026-08-17T12:00:00Z" },
  csrfToken: "csrf-token",
  expiresAt: "2026-08-18T00:00:00Z",
  serverId: "test-server",
};

const lines = [
  { sequence: 1, timestamp: "2026-08-17T12:00:00Z", text: "[Server thread/INFO]: Ready" },
  { sequence: 2, timestamp: "2026-08-17T12:01:00Z", text: "[WARN] Slow tick" },
  { sequence: 3, timestamp: "2026-08-17T12:02:00Z", text: "Exception: stopped" },
];

const sockets: OpenWebSocket[] = [];
const originalWebSocket = globalThis.WebSocket;
const scrollTo = vi.fn();

class OpenWebSocket {
  onopen: WebSocket["onopen"] = null;
  onmessage: WebSocket["onmessage"] = null;
  onclose: WebSocket["onclose"] = null;
  onerror: WebSocket["onerror"] = null;
  close = vi.fn();

  constructor() {
    sockets.push(this);
    queueMicrotask(() => this.onopen?.call(this as unknown as WebSocket, new Event("open")));
  }
}

Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: scrollTo, configurable: true });

afterEach(() => {
  sockets.length = 0;
  configureCsrfToken(() => undefined);
  Object.defineProperty(globalThis, "WebSocket", { value: originalWebSocket, configurable: true });
});

function renderConsole(currentSession = session) {
  Object.defineProperty(globalThis, "WebSocket", { value: OpenWebSocket, configurable: true });
  configureCsrfToken(() => currentSession.csrfToken);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}><ConsolePage session={currentSession} /></QueryClientProvider>);
  return { ...result, queryClient };
}

describe("ConsolePage", () => {
  it("filters, pauses ingestion, resumes, and preserves severity semantics", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/servers/test-server/console/history", () => HttpResponse.json({ lines })));
    renderConsole();

    expect(await screen.findByText("[Server thread/INFO]: Ready")).toBeVisible();
    expect(screen.getByText("connected", { exact: true })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "warning" }));
    expect(screen.queryByText("[Server thread/INFO]: Ready")).not.toBeInTheDocument();
    expect(screen.getByText("[WARN] Slow tick")).toHaveClass("text-[#d8b56d]");
    await user.click(screen.getByRole("button", { name: "error" }));
    expect(screen.getByText("Exception: stopped")).toHaveClass("text-[#e6867d]");
    await user.click(screen.getByRole("button", { name: "all" }));
    await user.type(screen.getByRole("searchbox", { name: "Search console" }), "slow");
    expect(screen.queryByText("Exception: stopped")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search console" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "off");
    sockets[0]?.onmessage?.call(sockets[0] as unknown as WebSocket, new MessageEvent("message", {
      data: JSON.stringify({ sequence: 4, timestamp: "2026-08-17T12:03:00Z", text: "live while paused" }),
    }));
    expect(screen.queryByText("live while paused")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return to live output" }));
    expect(await screen.findByText("live while paused")).toBeVisible();
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
    const log = screen.getByRole("log");
    log.focus();
    scrollTo.mockClear();
    sockets[0]?.onmessage?.call(sockets[0] as unknown as WebSocket, new MessageEvent("message", {
      data: JSON.stringify({ sequence: 5, timestamp: "2026-08-17T12:04:00Z", text: "live and focused" }),
    }));
    expect(await screen.findByText("live and focused")).toBeVisible();
    expect(scrollTo).toHaveBeenCalled();
    expect(log).toHaveFocus();
  });

  it("validates locally, executes with CSRF, invalidates broadly, and restores command history", async () => {
    const user = userEvent.setup();
    const requests: unknown[] = [];
    let csrfHeader: string | null = null;
    server.use(
      http.get("/api/v1/servers/test-server/console/history", () => HttpResponse.json({ lines })),
      http.post("/api/v1/servers/test-server/console/commands", async ({ request }) => {
        requests.push(await request.json());
        csrfHeader = request.headers.get("X-CSRF-Token");
        return HttpResponse.json({ response: "Command completed" });
      }),
    );
    const { queryClient } = renderConsole();
    const unrelatedQueryKey = ["synthetic-unrelated-cache", "detail"] as const;
    queryClient.setQueryData(unrelatedQueryKey, { cached: true });
    const command = await screen.findByLabelText("Minecraft command");

    fireEvent.change(command, { target: { value: "ø".repeat(2_049) } });
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Command must be at most 4,096 bytes.")).toBeVisible();
    expect(requests).toHaveLength(0);

    await user.clear(command);
    await user.type(command, "  say hello  ");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Command completed")).toBeVisible();
    expect(requests).toEqual([{ command: "say hello" }]);
    expect(csrfHeader as string | null).toBe("csrf-token");
    await waitFor(() => expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(true));
    await waitFor(() => expect(command).toHaveValue(""));
    await user.type(command, "{ArrowUp}");
    expect(command).toHaveValue("say hello");
  });

  it("owns a failed command once and clears stale errors and responses on a later draft", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(
      http.get("/api/v1/servers/test-server/console/history", () => HttpResponse.json({ lines })),
      http.post("/api/v1/servers/test-server/console/commands", () => {
        attempt += 1;
        return attempt === 1
          ? HttpResponse.json({ error: { code: "command_failed", message: "Minecraft did not accept the command." } }, { status: 502 })
          : HttpResponse.json({ response: "accepted" });
      }),
    );
    renderConsole();
    const command = await screen.findByLabelText("Minecraft command");
    await user.type(command, "say first");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Minecraft did not accept the command.")).toBeVisible();
    expect(screen.getAllByText("Minecraft did not accept the command.")).toHaveLength(1);

    await user.type(command, " again");
    expect(screen.queryByText("Minecraft did not accept the command.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("accepted")).toBeVisible();
    await user.type(command, "say later");
    expect(screen.queryByText("accepted")).not.toBeInTheDocument();
  });

  it("never renders malformed successful history or command responses", async () => {
    server.use(http.get("/api/v1/servers/test-server/console/history", () => HttpResponse.json({
      lines: [{ ...lines[0], sequence: -1, text: "<script>history unsafe</script>" }],
    })));
    const first = renderConsole();
    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText("<script>history unsafe</script>")).not.toBeInTheDocument();
    first.unmount();

    server.use(
      http.get("/api/v1/servers/test-server/console/history", () => HttpResponse.json({ lines })),
      http.post("/api/v1/servers/test-server/console/commands", () => HttpResponse.json({ response: { unsafe: "<script>command unsafe</script>" } })),
    );
    const user = userEvent.setup();
    renderConsole();
    const command = await screen.findByLabelText("Minecraft command");
    await user.type(command, "say safe request");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText("<script>command unsafe</script>")).not.toBeInTheDocument();
  });

  it("does not leak an older command result into a later draft", async () => {
    const user = userEvent.setup();
    let resolveFirst: ((response: Response) => void) | undefined;
    let requests = 0;
    server.use(
      http.get("/api/v1/servers/test-server/console/history", () => HttpResponse.json({ lines })),
      http.post("/api/v1/servers/test-server/console/commands", () => {
        requests += 1;
        if (requests === 1) return new Promise<Response>((resolve) => { resolveFirst = resolve; });
        return HttpResponse.json({ response: "new result" });
      }),
    );
    renderConsole();
    const command = await screen.findByLabelText("Minecraft command");
    await user.type(command, "say old");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();

    await user.clear(command);
    await user.type(command, "say new");
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    resolveFirst?.(HttpResponse.json({ error: { code: "command_failed", message: "stale failure" } }, { status: 502 }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    expect(screen.queryByText("stale failure")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("new result")).toBeVisible();
    await waitFor(() => expect(requests).toBe(2));
    expect(screen.getByText("new result")).toBeVisible();
  });

  it("shows history failure and retries to the empty state", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(http.get("/api/v1/servers/test-server/console/history", () => {
      attempt += 1;
      return attempt === 1
        ? HttpResponse.json({ error: { code: "history_failed", message: "History unavailable." } }, { status: 503 })
        : HttpResponse.json({ lines: [] });
    }));
    renderConsole();

    expect(screen.getByText("Loading bounded console history")).toBeVisible();
    expect(await screen.findByText("History unavailable.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No console lines match this view.")).toBeVisible();
  });

  it("keeps viewer command controls read-only", async () => {
    server.use(http.get("/api/v1/servers/test-server/console/history", () => HttpResponse.json({ lines })));
    renderConsole({ ...session, user: { ...session.user, role: "viewer" } });

    expect(await screen.findByText("Viewer access is read-only. Ask an administrator for the Operator role to submit Minecraft commands.")).toBeVisible();
    expect(screen.queryByLabelText("Minecraft command")).not.toBeInTheDocument();
  });
});
