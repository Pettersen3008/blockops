import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/features/auth";
import { OverviewPage } from "./OverviewPage";

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

afterEach(() => vi.unstubAllGlobals());

function renderOverview(responseBody: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
    JSON.stringify(responseBody),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <OverviewPage session={session} />
    </QueryClientProvider>,
  );
}

describe("OverviewPage", () => {
  it("renders unavailable states and restores the confirmation after cancel", async () => {
    const user = userEvent.setup();
    renderOverview(unavailableOverview);

    expect(await screen.findByRole("heading", { name: "Integration unavailable" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Graceful restart" }));
    expect(screen.getByRole("heading", { name: "Restart the Minecraft server?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Restart the Minecraft server?" })).not.toBeInTheDocument();
  });

  it("turns malformed overview data into a safe error state", async () => {
    renderOverview({ ...unavailableOverview, recentWarnings: [{ text: "missing required fields" }] });

    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText("missing required fields")).not.toBeInTheDocument();
  });
});
