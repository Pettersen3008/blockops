import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import type { Session } from "@/features/auth";
import { configureCsrfToken } from "@/lib/api/api";
import { server } from "@/test/setup";
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

const unrelatedQueryKey = ["unrelated-feature", "detail"] as const;

afterEach(() => {
  configureCsrfToken(() => undefined);
});

function renderWorlds(currentSession = session) {
  configureCsrfToken(() => currentSession.csrfToken);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <WorldsPage session={currentSession} />
    </QueryClientProvider>,
  );

  return queryClient;
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

  it("uploads the selected ZIP, clears its surface, and invalidates cached views", async () => {
    const user = userEvent.setup();
    let upload: { contentType: string | null; csrf: string | null } | undefined;
    server.use(
      http.put("/api/v1/world", async ({ request }) => {
        upload = {
          contentType: request.headers.get("Content-Type"),
          csrf: request.headers.get("X-CSRF-Token"),
        };
        return HttpResponse.json({ status: "replaced" });
      }),
    );
    const queryClient = renderWorlds();
    queryClient.setQueryData(unrelatedQueryKey, { status: "cached" });

    await user.upload(
      screen.getByLabelText(/Choose a world ZIP/),
      new File(["zip data"], "world.zip", { type: "application/zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Replace current world" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Replace the current world?" })).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Replace world" }));

    expect(await screen.findByText("World replacement completed and the configured server was started.")).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("world.zip")).not.toBeInTheDocument();
    expect(upload).toEqual({ contentType: "application/zip", csrf: "csrf-token" });
    expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(true);
  });

  it("keeps the selected ZIP and confirmation open when the response is malformed", async () => {
    const user = userEvent.setup();
    server.use(http.put("/api/v1/world", () => HttpResponse.json({ status: "unexpected" })));
    renderWorlds();

    await user.upload(
      screen.getByLabelText(/Choose a world ZIP/),
      new File(["zip data"], "world.zip", { type: "application/zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Replace current world" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Replace world" }));

    expect(await screen.findByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("world.zip")).toBeVisible();
  });

  it("returns focus to the replacement trigger when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderWorlds();
    await user.upload(
      screen.getByLabelText(/Choose a world ZIP/),
      new File(["zip data"], "world.zip", { type: "application/zip" }),
    );
    const replaceTrigger = screen.getByRole("button", { name: "Replace current world" });

    await user.click(replaceTrigger);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(replaceTrigger).toHaveFocus());
  });

  it("keeps replacement controls hidden without permission", () => {
    renderWorlds({ ...session, user: { ...session.user, role: "operator" } });

    expect(screen.getByText("Only administrators can upload or replace world data.")).toBeVisible();
    expect(screen.queryByLabelText(/Choose a world ZIP/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replace current world" })).not.toBeInTheDocument();
  });
});
