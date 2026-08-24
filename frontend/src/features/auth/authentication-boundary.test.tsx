import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useOutletContext } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HttpResponse, http } from "msw";
import { server } from "@/test/setup";
import { AuthenticationBoundary } from "./authentication-boundary";
import type { Session } from "./auth-schemas";

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

/** Proves the session reached the routed page, not just that something rendered. */
function Dashboard() {
  const routeSession = useOutletContext<Session>();
  return <p>Signed in as {routeSession.user.username}</p>;
}

function renderBoundary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AuthenticationBoundary />}>
            <Route index element={<Dashboard />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return queryClient;
}

describe("AuthenticationBoundary", () => {
  it("keeps the dashboard up when a background session refetch fails", async () => {
    let sessionRequests = 0;
    server.use(
      http.get("/api/v1/setup", () => HttpResponse.json({ required: false })),
      http.get("/api/v1/auth/session", () => {
        sessionRequests += 1;
        if (sessionRequests === 1) return HttpResponse.json(session);
        return HttpResponse.json(
          { error: { code: "internal_error", message: "Something went wrong." } },
          { status: 500 },
        );
      }),
    );
    const queryClient = renderBoundary();

    expect(await screen.findByText("Signed in as admin")).toBeVisible();

    // What a player action does: D-2c invalidates every query, including this one.
    await queryClient.invalidateQueries();
    await waitFor(() => expect(sessionRequests).toBeGreaterThan(1));

    expect(screen.getByText("Signed in as admin")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("shows a full-screen error when the session never loads", async () => {
    server.use(
      http.get("/api/v1/setup", () => HttpResponse.json({ required: false })),
      http.get("/api/v1/auth/session", () => HttpResponse.json(
        { error: { code: "internal_error", message: "Something went wrong." } },
        { status: 500 },
      )),
    );
    renderBoundary();

    expect(await screen.findByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByText("Signed in as admin")).not.toBeInTheDocument();
  });

  it("shows the login screen when the server says the session is gone", async () => {
    server.use(
      http.get("/api/v1/setup", () => HttpResponse.json({ required: false })),
      http.get("/api/v1/auth/session", () => HttpResponse.json(
        { error: { code: "unauthenticated", message: "Sign in to continue." } },
        { status: 401 },
      )),
    );
    renderBoundary();

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByText("Signed in as admin")).not.toBeInTheDocument();
  });
});
