import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditPage } from "./AuditPage";

const event = {
  id: "0123456789abcdef0123456789abcdef",
  occurredAt: "2026-08-17T12:00:00Z",
  username: "admin",
  action: "auth.setup",
  target: "admin",
  sourceIp: "127.0.0.1",
  outcome: "success",
  details: { role: "administrator" },
};

afterEach(() => vi.unstubAllGlobals());

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderAudit(fetchMock: ReturnType<typeof vi.fn>, initialEntry = "/audit") {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuditPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AuditPage", () => {
  it("restores URL filters and keeps changes in the URL", async () => {
    const user = userEvent.setup();
    renderAudit(vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [event] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })), "/audit?q=auth.setup&outcome=success");

    expect(await screen.findByRole("cell", { name: "auth.setup" })).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search audit events" })).toHaveValue("auth.setup");
    expect(screen.getByRole("button", { name: "success" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "failure" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/audit?q=auth.setup&outcome=failure"));
    expect(screen.getByRole("heading", { name: "No matching audit events" })).toBeVisible();
  });

  it("normalizes an invalid URL outcome and rejects malformed API data safely", async () => {
    renderAudit(vi.fn().mockResolvedValue(new Response(JSON.stringify({
      events: [{ ...event, action: "<script>unsafe</script>", outcome: "unknown" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })), "/audit?outcome=unexpected");

    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText("<script>unsafe</script>")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/audit?outcome=all"));
  });
});
