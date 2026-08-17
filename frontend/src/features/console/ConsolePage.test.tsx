import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/features/auth";
import { ConsolePage } from "./ConsolePage";

const session: Session = {
  user: { id: "admin-1", username: "admin", role: "administrator", disabled: false, createdAt: "2026-08-17T12:00:00Z" },
  csrfToken: "csrf-token",
  expiresAt: "2026-08-18T00:00:00Z",
};

const lines = [
  { sequence: 1, timestamp: "2026-08-17T12:00:00Z", text: "[Server thread/INFO]: Ready" },
  { sequence: 2, timestamp: "2026-08-17T12:01:00Z", text: "[WARN] Slow tick" },
];

const sockets: OpenWebSocket[] = [];

class OpenWebSocket {
  onopen: WebSocket["onopen"] = null;
  onmessage: WebSocket["onmessage"] = null;
  onclose: WebSocket["onclose"] = null;
  onerror: WebSocket["onerror"] = null;

  constructor() {
    sockets.push(this);
    queueMicrotask(() => this.onopen?.call(this as unknown as WebSocket, new Event("open")));
  }

  close() {}
}

Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: vi.fn(), configurable: true });

afterEach(() => {
  sockets.length = 0;
  vi.unstubAllGlobals();
});

function renderConsole(fetchMock: ReturnType<typeof vi.fn>, currentSession = session) {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", OpenWebSocket);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><ConsolePage session={currentSession} /></QueryClientProvider>);
}

describe("ConsolePage", () => {
  it("filters, pauses, executes commands, and restores command history", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? Promise.resolve(new Response(JSON.stringify({ response: "Command completed" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      : Promise.resolve(new Response(JSON.stringify({ lines }), { status: 200, headers: { "Content-Type": "application/json" } })));
    renderConsole(fetchMock);

    expect(await screen.findByText("[Server thread/INFO]: Ready")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "warning" }));
    expect(screen.queryByText("[Server thread/INFO]: Ready")).not.toBeInTheDocument();
    expect(screen.getByText("[WARN] Slow tick")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "off");
    sockets[0]?.onmessage?.call(sockets[0] as unknown as WebSocket, new MessageEvent("message", {
      data: JSON.stringify({ sequence: 3, timestamp: "2026-08-17T12:02:00Z", text: "[WARN] live while paused" }),
    }));
    expect(screen.queryByText("[WARN] live while paused")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return to live output" }));
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
    expect(await screen.findByText("[WARN] live while paused")).toBeVisible();

    const command = screen.getByLabelText("Minecraft command");
    await user.type(command, "say hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/RCON response:/)).toBeVisible();
    expect(screen.getByText("Command completed")).toBeVisible();
    await waitFor(() => expect(command).toHaveValue(""));
    await user.type(command, "{ArrowUp}");
    expect(command).toHaveValue("say hello");

    const commandCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(commandCall?.[1]?.body))).toEqual({ command: "say hello" });
    expect((commandCall?.[1]?.headers as Headers).get("X-CSRF-Token")).toBe("csrf-token");
  });

  it("keeps viewer command controls read-only", async () => {
    renderConsole(vi.fn().mockResolvedValue(new Response(JSON.stringify({ lines }), { status: 200, headers: { "Content-Type": "application/json" } })), {
      ...session,
      user: { ...session.user, role: "viewer" },
    });

    expect(await screen.findByText("Viewer access is read-only. Ask an administrator for the Operator role to submit Minecraft commands.")).toBeVisible();
    expect(screen.queryByLabelText("Minecraft command")).not.toBeInTheDocument();
  });

  it("rejects malformed history safely", async () => {
    renderConsole(vi.fn().mockResolvedValue(new Response(JSON.stringify({ lines: [{ ...lines[0], sequence: -1, text: "<script>unsafe</script>" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText("<script>unsafe</script>")).not.toBeInTheDocument();
  });
});
