import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/features/auth";
import { configureCsrfToken } from "@/lib/api/api";
import { WorldsPage } from "./worlds-page";

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

afterEach(() => {
  configureCsrfToken(() => undefined);
  vi.unstubAllGlobals();
});

function renderWorlds() {
  configureCsrfToken(() => session.csrfToken);
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <WorldsPage session={session} />
    </QueryClientProvider>,
  );
}

describe("WorldsPage", () => {
  it("rejects invalid local file metadata before upload", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWorlds();
    await user.upload(
      screen.getByLabelText(/Choose a world ZIP/),
      new File(["not zip"], "world.txt", { type: "text/plain" }),
    );

    expect(screen.getByText("World uploads must use a .zip filename.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Replace current world" })).toBeDisabled();
  });

  it("keeps destructive confirmation and safely rejects malformed upload responses", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ status: "unexpected" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    renderWorlds();
    await user.upload(
      screen.getByLabelText(/Choose a world ZIP/),
      new File(["zip data"], "world.zip", { type: "application/zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Replace current world" }));
    expect(screen.getByRole("heading", { name: "Replace the current world?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Replace world" }));

    expect(await screen.findByText("BlockOps returned an invalid response.")).toBeInTheDocument();
  });
});
