import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/features/auth";
import { configureCsrfToken } from "@/lib/api/api";
import { PlayersPage } from "./players-page";

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

const players = [
  { name: "Alex", online: false, allowlisted: false, banned: false, operator: false },
  { name: "Steve", online: true, allowlisted: true, banned: false, operator: false },
];

afterEach(() => {
  configureCsrfToken(() => undefined);
  vi.unstubAllGlobals();
});

function renderPlayers(fetchMock: ReturnType<typeof vi.fn>, currentSession = session) {
  vi.stubGlobal("fetch", fetchMock);
  configureCsrfToken(() => currentSession.csrfToken);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PlayersPage session={currentSession} />
    </QueryClientProvider>,
  );
}

describe("PlayersPage", () => {
  it("searches players and submits a validated reason action", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ response: "Banned Steve" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ players }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    });
    renderPlayers(fetchMock);

    expect(await screen.findByRole("heading", { name: "Steve" })).toBeVisible();
    await user.type(screen.getByPlaceholderText("Search known players"), "ste");
    expect(screen.queryByRole("heading", { name: "Alex" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ban" }));
    expect(screen.getByRole("heading", { name: "Ban Steve?" })).toBeVisible();
    await user.type(screen.getByLabelText("Reason (optional)"), "Repeated griefing");
    await user.click(screen.getByRole("button", { name: "Ban player" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/players/actions",
      expect.objectContaining({ method: "POST" }),
    ));
    const actionCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(actionCall?.[1]?.body))).toEqual({ action: "ban", name: "Steve", reason: "Repeated griefing" });
    expect((actionCall?.[1]?.headers as Headers).get("X-CSRF-Token")).toBe("csrf-token");
  });

  it("rejects malformed catalog data safely", async () => {
    renderPlayers(vi.fn().mockResolvedValue(new Response(JSON.stringify({
      players: [{ ...players[0], name: "invalid player" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText("invalid player")).not.toBeInTheDocument();
  });

  it("keeps viewer controls read-only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ players }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    renderPlayers(fetchMock, { ...session, user: { ...session.user, role: "viewer" } });

    expect(await screen.findByText("Viewer access is read-only.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Ban" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add to allowlist")).not.toBeInTheDocument();
  });
});
