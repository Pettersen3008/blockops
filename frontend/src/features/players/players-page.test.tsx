import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import type { Session } from "@/features/auth";
import { configureCsrfToken } from "@/lib/api/api";
import { server } from "@/test/setup";
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

const overviewQueryKey = ["overview", "detail"] as const;

afterEach(() => {
  configureCsrfToken(() => undefined);
});

function renderPlayers(currentSession = session) {
  configureCsrfToken(() => currentSession.csrfToken);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <PlayersPage session={currentSession} />
    </QueryClientProvider>,
  );

  return queryClient;
}

describe("PlayersPage", () => {
  it("searches players and invalidates players and overview after a validated kick", async () => {
    const user = userEvent.setup();
    const requests: unknown[] = [];
    let csrfHeader: string | null = null;
    let catalogRequests = 0;
    server.use(
      http.get("/api/v1/players", () => {
        catalogRequests += 1;
        return HttpResponse.json({ players });
      }),
      http.post("/api/v1/players/actions", async ({ request }) => {
        requests.push(await request.json());
        csrfHeader = request.headers.get("X-CSRF-Token");
        return HttpResponse.json({ response: "Kicked Steve" });
      }),
    );
    const queryClient = renderPlayers();
    queryClient.setQueryData(overviewQueryKey, { status: "cached" });

    expect(await screen.findByRole("heading", { name: "Steve" })).toBeVisible();
    await user.type(screen.getByPlaceholderText("Search known players"), "ste");
    expect(screen.queryByRole("heading", { name: "Alex" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kick" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Kick Steve?" })).toBeVisible();
    const reason = within(dialog).getByRole("textbox", { name: "Reason" });
    expect(reason).toBeRequired();
    await user.click(within(dialog).getByRole("button", { name: "Kick player" }));
    expect(await within(dialog).findByText("Reason is required.")).toBeVisible();
    expect(requests).toHaveLength(0);

    await user.type(reason, "Repeated griefing");
    await user.click(within(dialog).getByRole("button", { name: "Kick player" }));

    await waitFor(() => expect(requests).toEqual([
      { action: "kick", name: "Steve", reason: "Repeated griefing" },
    ]));
    expect(csrfHeader).toBe("csrf-token");
    await waitFor(() => expect(catalogRequests).toBeGreaterThan(1));
    await waitFor(() => expect(queryClient.getQueryState(overviewQueryKey)?.isInvalidated).toBe(true));
  });

  it("returns focus to the action trigger when the dialog closes", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/players", () => HttpResponse.json({ players })));
    renderPlayers();

    const kick = await screen.findByRole("button", { name: "Kick" });
    await user.click(kick);
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(kick).toHaveFocus());
  });

  it("validates the allowlist form and clears it only after a successful action", async () => {
    const user = userEvent.setup();
    const requests: unknown[] = [];
    server.use(
      http.get("/api/v1/players", () => HttpResponse.json({ players })),
      http.post("/api/v1/players/actions", async ({ request }) => {
        requests.push(await request.json());
        return HttpResponse.json({ response: "Allowlisted Herobrine" });
      }),
    );
    renderPlayers();

    await screen.findByRole("heading", { name: "Steve" });
    const name = screen.getByRole("textbox", { name: "Add to allowlist" });
    await user.type(name, "bad name");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Use a valid Java username with 1–16 letters, numbers, or underscores.")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.clear(name);
    await user.type(name, "Herobrine");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("heading", { name: "Allowlist Herobrine?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(name).toHaveValue("Herobrine");

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add to allowlist" }));

    await waitFor(() => expect(requests).toEqual([
      { action: "allowlist-add", name: "Herobrine", reason: "" },
    ]));
    await waitFor(() => expect(name).toHaveValue(""));
  });

  it("rejects malformed catalog data safely", async () => {
    server.use(http.get("/api/v1/players", () => HttpResponse.json({
      players: [{ ...players[0], name: "invalid player" }],
    })));
    renderPlayers();

    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText("invalid player")).not.toBeInTheDocument();
  });

  it("keeps viewer controls read-only", async () => {
    server.use(http.get("/api/v1/players", () => HttpResponse.json({ players })));
    renderPlayers({ ...session, user: { ...session.user, role: "viewer" } });

    expect(await screen.findByText("Viewer access is read-only.")).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ban" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add to allowlist")).not.toBeInTheDocument();
  });
});
