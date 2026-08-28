import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "bun:test";
import type { Session, User } from "@/features/auth";
import { configureCsrfToken } from "@/lib/api/api";
import { server } from "@/test/setup";
import { SettingsPage } from "./settings-page";

const session: Session = {
  user: { id: "admin-1", username: "admin", role: "administrator", disabled: false, createdAt: "2026-08-17T12:00:00Z" },
  csrfToken: "csrf-token",
  expiresAt: "2026-08-18T00:00:00Z",
};
const settings = {
  rcon: { address: "minecraft:25575", configured: true, source: "environment", credentialUpdatesEnabled: true },
  deployment: { minecraftContainer: "minecraft", worldName: "world", cookieSecure: true, trustedProxyCount: 1, maxUploadBytes: 1024 },
};
const viewer: User = { id: "viewer-1", username: "viewer", role: "viewer", disabled: false, createdAt: "2026-08-17T12:00:00Z" };
const disabledUser: User = { id: "disabled-1", username: "disabled-user", role: "operator", disabled: true, createdAt: "2026-08-16T12:00:00Z" };

// D-2c promises broad invalidation. A synthetic key proves that breadth without coupling
// this test to another feature's key vocabulary.
const unrelatedQueryKey = ["unrelated-feature", "detail"] as const;

afterEach(() => configureCsrfToken(() => undefined));

function useQueryResponses(users: User[] = [session.user, viewer, disabledUser]) {
  server.use(
    http.get("/api/v1/settings", () => HttpResponse.json(settings)),
    http.get("/api/v1/users", () => HttpResponse.json({ users })),
  );
}

function renderSettings() {
  configureCsrfToken(() => session.csrfToken);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage session={session} />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("SettingsPage", () => {
  it("shows loading, integration and deployment facts, users, and the empty state", async () => {
    let releaseSettings: (() => void) | undefined;
    const settingsReady = new Promise<void>((resolve) => { releaseSettings = resolve; });
    server.use(
      http.get("/api/v1/settings", async () => {
        await settingsReady;
        return HttpResponse.json({ ...settings, rcon: { ...settings.rcon, configured: false, credentialUpdatesEnabled: false } });
      }),
      http.get("/api/v1/users", () => HttpResponse.json({ users: [] })),
    );
    renderSettings();
    expect(screen.getByRole("status")).toHaveTextContent("Loading protected settings");
    releaseSettings?.();

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.getByText("missing", { exact: true })).toBeVisible();
    expect(screen.getByText(/Credential updates are locked/)).toBeVisible();
    expect(screen.getByText("Never", { exact: true })).toBeVisible();
    expect(screen.getByText("Not available", { exact: true })).toBeVisible();
    expect(screen.getByRole("heading", { name: "No users" })).toBeVisible();
  });

  it.each([
    ["settings", "Settings are temporarily unavailable."],
    ["users", "Users are temporarily unavailable."],
  ] as const)("retries a %s failure independently", async (failedRequest, message) => {
    let requests = 0;
    server.use(
      http.get("/api/v1/settings", () => {
        if (failedRequest !== "settings") return HttpResponse.json(settings);
        requests += 1;
        return requests === 1 ? HttpResponse.json({ error: { message } }, { status: 503 }) : HttpResponse.json(settings);
      }),
      http.get("/api/v1/users", () => {
        if (failedRequest !== "users") return HttpResponse.json({ users: [session.user] });
        requests += 1;
        return requests === 1 ? HttpResponse.json({ error: { message } }, { status: 503 }) : HttpResponse.json({ users: [session.user] });
      }),
    );
    const user = userEvent.setup();
    renderSettings();
    expect(await screen.findByText(message)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeVisible();
    expect(requests).toBe(2);
  });

  it.each(["settings", "users"] as const)("rejects malformed %s data without rendering untrusted fields", async (boundary) => {
    server.use(
      http.get("/api/v1/settings", () => HttpResponse.json(boundary === "settings" ? {
        ...settings,
        deployment: { ...settings.deployment, minecraftContainer: "<script>unsafe-settings</script>", maxUploadBytes: -1 },
      } : settings)),
      http.get("/api/v1/users", () => HttpResponse.json({
        users: boundary === "users" ? [{ ...viewer, username: "<script>unsafe-user</script>" }] : [session.user],
      })),
    );
    renderSettings();
    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText(boundary === "settings" ? "<script>unsafe-settings</script>" : "<script>unsafe-user</script>")).not.toBeInTheDocument();
  });

  it("validates and creates a user, then broadly invalidates cached views", async () => {
    const requests: unknown[] = [];
    let csrf: string | null = null;
    useQueryResponses();
    server.use(http.post("/api/v1/users", async ({ request }) => {
      requests.push(await request.json());
      csrf = request.headers.get("X-CSRF-Token");
      return HttpResponse.json({ ...viewer, id: "new-admin", username: "second-admin", role: "administrator" }, { status: 201 });
    }));
    const user = userEvent.setup();
    const queryClient = renderSettings();
    queryClient.setQueryData(unrelatedQueryKey, { status: "cached" });
    await screen.findByRole("heading", { name: "Users and roles" });

    await user.click(screen.getByRole("button", { name: "Create user" }));
    expect(screen.getByText(/Username must be 3–32 characters/)).toBeVisible();
    expect(screen.getByText("Password is required.")).toBeVisible();
    expect(requests).toHaveLength(0);

    await user.type(screen.getByLabelText("Username", { exact: true }), "second-admin");
    await user.type(screen.getByLabelText("Temporary password"), "Strong passphrase 42!");
    await user.selectOptions(screen.getByLabelText("Role"), "administrator");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() => expect(requests).toEqual([{ username: "second-admin", password: "Strong passphrase 42!", role: "administrator" }]));
    expect(csrf as string | null).toBe("csrf-token");
    await waitFor(() => expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(true));
    expect(screen.getByLabelText("Username", { exact: true })).toHaveValue("");
    expect(screen.getByLabelText("Temporary password")).toHaveValue("");
    expect(screen.getByLabelText("Role")).toHaveValue("viewer");
  });

  it("keeps create form values when a successful response is malformed", async () => {
    useQueryResponses();
    server.use(http.post("/api/v1/users", () => HttpResponse.json({ ...viewer, username: "<script>unsafe-created-user</script>" }, { status: 201 })));
    const user = userEvent.setup();
    renderSettings();
    await screen.findByRole("heading", { name: "Users and roles" });
    await user.type(screen.getByLabelText("Username", { exact: true }), "new-viewer");
    await user.type(screen.getByLabelText("Temporary password"), "Strong passphrase 42!");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.getByLabelText("Username", { exact: true })).toHaveValue("new-viewer");
    expect(screen.getByLabelText("Temporary password")).toHaveValue("Strong passphrase 42!");
    expect(screen.queryByText("<script>unsafe-created-user</script>")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Username", { exact: true }), "2");
    expect(screen.queryByText("BlockOps returned an invalid response.")).not.toBeInTheDocument();
  });

  it("validates RCON credentials and never renders or retains the submitted secret", async () => {
    const requests: unknown[] = [];
    useQueryResponses();
    server.use(http.put("/api/v1/settings/rcon", async ({ request }) => {
      requests.push(await request.json());
      return HttpResponse.json({ ...settings.rcon, source: "encrypted database" });
    }));
    const user = userEvent.setup();
    renderSettings();
    await screen.findByRole("heading", { name: "RCON credentials" });
    const address = screen.getByLabelText("RCON address");
    const password = screen.getByLabelText("New RCON password");

    await user.clear(address);
    await user.type(address, "missing-port");
    await user.type(password, "short");
    await user.click(screen.getByRole("button", { name: "Update credentials" }));
    expect(screen.getByText("RCON address must use host:port format.")).toBeVisible();
    expect(screen.getByText("RCON password must be at least 8 characters.")).toBeVisible();
    expect(requests).toHaveLength(0);

    await user.clear(address);
    await user.type(address, "minecraft:25575");
    await user.clear(password);
    await user.type(password, "new-secret-pass");
    await user.click(screen.getByRole("button", { name: "Update credentials" }));
    await waitFor(() => expect(requests).toEqual([{ address: "minecraft:25575", password: "new-secret-pass" }]));
    expect(await screen.findByText("Encrypted RCON credentials updated.")).toBeVisible();
    expect(password).toHaveValue("");
    expect(screen.queryByText("new-secret-pass", { exact: true })).not.toBeInTheDocument();
  });

  it("keeps RCON inputs when a successful response is malformed", async () => {
    useQueryResponses();
    server.use(http.put("/api/v1/settings/rcon", () => HttpResponse.json({
      address: "<script>unsafe-rcon</script>", configured: "yes", source: "untrusted", credentialUpdatesEnabled: true,
    })));
    const user = userEvent.setup();
    renderSettings();
    await screen.findByRole("heading", { name: "RCON credentials" });
    const password = screen.getByLabelText("New RCON password");
    await user.type(password, "new-secret-pass");
    await user.click(screen.getByRole("button", { name: "Update credentials" }));

    expect(await screen.findByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(password).toHaveValue("new-secret-pass");
    expect(screen.queryByText("<script>unsafe-rcon</script>")).not.toBeInTheDocument();
    await user.type(password, "2");
    expect(screen.queryByText("BlockOps returned an invalid response.")).not.toBeInTheDocument();
  });

  it("preserves self-protection and disabled-user controls", async () => {
    useQueryResponses();
    renderSettings();
    expect(await screen.findByText("(you)")).toBeVisible();
    expect(screen.getByText("disabled", { exact: true })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Disable" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Revoke sessions" })).toHaveLength(3);
  });

  it("cancels disable confirmation and restores focus to its dangerous trigger", async () => {
    useQueryResponses();
    const user = userEvent.setup();
    renderSettings();
    const trigger = await screen.findByRole("button", { name: "Disable" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Disable viewer?" })).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("disables another user with CSRF and never exposes a control for the current user", async () => {
    let csrf: string | null = null;
    useQueryResponses();
    server.use(http.delete("/api/v1/users/viewer-1", ({ request }) => {
      csrf = request.headers.get("X-CSRF-Token");
      return new HttpResponse(null, { status: 204 });
    }));
    const user = userEvent.setup();
    renderSettings();
    const disable = await screen.findByRole("button", { name: "Disable" });

    await user.click(disable);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Disable user" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(csrf as string | null).toBe("csrf-token");
    expect(screen.getAllByRole("button", { name: "Disable" })).toHaveLength(1);
  });

  it("revokes sessions, broadly invalidates, closes its surface, and restores focus", async () => {
    let csrf: string | null = null;
    useQueryResponses();
    server.use(http.post("/api/v1/users/viewer-1/revoke-sessions", ({ request }) => {
      csrf = request.headers.get("X-CSRF-Token");
      return new HttpResponse(null, { status: 204 });
    }));
    const user = userEvent.setup();
    const queryClient = renderSettings();
    queryClient.setQueryData(unrelatedQueryKey, { status: "cached" });
    const trigger = (await screen.findAllByRole("button", { name: "Revoke sessions" })).at(1);
    if (!trigger) throw new Error("Expected the viewer revoke trigger.");
    await user.click(trigger);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke sessions" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(csrf as string | null).toBe("csrf-token");
    await waitFor(() => expect(queryClient.getQueryState(unrelatedQueryKey)?.isInvalidated).toBe(true));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("owns a malformed revoke response in its dialog and clears it before another action", async () => {
    useQueryResponses();
    server.use(http.post("/api/v1/users/viewer-1/revoke-sessions", () => HttpResponse.json({ unsafe: "untrusted-mutation" })));
    const user = userEvent.setup();
    renderSettings();
    const revokeViewer = (await screen.findAllByRole("button", { name: "Revoke sessions" })).at(1);
    if (!revokeViewer) throw new Error("Expected the viewer revoke trigger.");
    await user.click(revokeViewer);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke sessions" }));

    expect(await screen.findByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.getAllByText("BlockOps returned an invalid response.")).toHaveLength(1);
    expect(screen.queryByText("untrusted-mutation")).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Disable" }));
    expect(screen.getByRole("heading", { name: "Disable viewer?" })).toBeVisible();
    expect(screen.queryByText("BlockOps returned an invalid response.")).not.toBeInTheDocument();
  });

  it("does not let a late mutation failure leak into a later confirmation", async () => {
    let releaseFailure: (() => void) | undefined;
    const responseReady = new Promise<void>((resolve) => { releaseFailure = resolve; });
    useQueryResponses();
    server.use(http.post("/api/v1/users/viewer-1/revoke-sessions", async () => {
      await responseReady;
      return HttpResponse.json({ error: { message: "Late revoke failure." } }, { status: 503 });
    }));
    const user = userEvent.setup();
    renderSettings();
    const revokeViewer = (await screen.findAllByRole("button", { name: "Revoke sessions" })).at(1);
    if (!revokeViewer) throw new Error("Expected the viewer revoke trigger.");
    await user.click(revokeViewer);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke sessions" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Working…" })).toBeDisabled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close dialog" }));
    await user.click(screen.getByRole("button", { name: "Disable" }));
    expect(screen.getByRole("heading", { name: "Disable viewer?" })).toBeVisible();

    releaseFailure?.();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Disable viewer?" })).toBeVisible());
    expect(screen.queryByText("Late revoke failure.")).not.toBeInTheDocument();
  });
});
