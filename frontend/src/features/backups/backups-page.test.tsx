import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/features/auth";
import { configureCsrfToken } from "@/lib/api/api";
import { BackupsPage } from "./backups-page";

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

const backup = {
  id: "0123456789abcdef0123456789abcdef",
  sizeBytes: 1024,
  createdAt: "2026-08-17T12:00:00Z",
  createdBy: "admin",
  status: "ready",
};

afterEach(() => {
  configureCsrfToken(() => undefined);
  vi.unstubAllGlobals();
});

function renderBackups(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  configureCsrfToken(() => session.csrfToken);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BackupsPage session={session} />
    </QueryClientProvider>,
  );
}

describe("BackupsPage", () => {
  it("confirms and executes a validated deletion", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify({ backups: [backup] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    });
    renderBackups(fetchMock);

    expect(await screen.findByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      `/api/v1/backups/${backup.id}/download`,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("heading", { name: "Delete this backup?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete backup" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/backups/${backup.id}`,
      expect.objectContaining({ method: "DELETE" }),
    ));
    const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect((deleteCall?.[1]?.headers as Headers).get("X-CSRF-Token")).toBe("csrf-token");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Delete this backup?" })).not.toBeInTheDocument());
  });

  it("rejects a malformed catalog without rendering its values", async () => {
    renderBackups(vi.fn().mockResolvedValue(new Response(JSON.stringify({
      backups: [{ ...backup, id: "unsafe/id" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText("unsafe/id")).not.toBeInTheDocument();
  });
});
