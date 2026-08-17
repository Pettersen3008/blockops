import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/features/auth";
import { SettingsPage } from "./SettingsPage";

const session: Session = {
  user: { id: "admin-1", username: "admin", role: "administrator", disabled: false, createdAt: "2026-08-17T12:00:00Z" },
  csrfToken: "csrf-token",
  expiresAt: "2026-08-18T00:00:00Z",
};

const settings = {
  rcon: { address: "minecraft:25575", configured: true, source: "environment", credentialUpdatesEnabled: true },
  deployment: { minecraftContainer: "minecraft", worldName: "world", cookieSecure: true, trustedProxyCount: 1, maxUploadBytes: 1024 },
};

const viewer = { id: "viewer-1", username: "viewer", role: "viewer", disabled: false, createdAt: "2026-08-17T12:00:00Z" };

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderSettings(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><SettingsPage session={session} /></QueryClientProvider>);
}

function baselineFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const path = String(input);
  if (path === "/api/v1/settings") return Promise.resolve(jsonResponse(settings));
  if (path === "/api/v1/users" && init?.method === "POST") return Promise.resolve(jsonResponse(viewer, 201));
  if (path === "/api/v1/users") return Promise.resolve(jsonResponse({ users: [session.user, viewer] }));
  if (path === "/api/v1/settings/rcon") return Promise.resolve(jsonResponse({ ...settings.rcon, source: "encrypted database" }));
  if (init?.method === "DELETE" || init?.method === "POST") return Promise.resolve(new Response(null, { status: 204 }));
  return Promise.reject(new Error(`Unexpected request: ${path}`));
}

describe("SettingsPage", () => {
  it("shows safe field errors before creating a validated user", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(baselineFetch);
    renderSettings(fetchMock);
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Create user" }));
    expect(screen.getByText(/Username must be 3–32 characters/)).toBeVisible();
    expect(screen.getByText("Password is required.")).toBeVisible();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    await user.type(screen.getByLabelText("Username", { exact: true }), "second-admin");
    await user.type(screen.getByLabelText("Temporary password"), "Strong passphrase 42!");
    await user.selectOptions(screen.getByLabelText("Role"), "administrator");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/users", expect.objectContaining({ method: "POST" })));
    const createCall = fetchMock.mock.calls.find(([path, init]) => String(path) === "/api/v1/users" && init?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({ username: "second-admin", password: "Strong passphrase 42!", role: "administrator" });
    expect((createCall?.[1]?.headers as Headers).get("X-CSRF-Token")).toBe("csrf-token");
  });

  it("validates RCON fields and invalidates settings after an update", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(baselineFetch);
    renderSettings(fetchMock);
    await screen.findByRole("heading", { name: "RCON credentials" });

    const address = screen.getByLabelText("RCON address");
    const password = screen.getByLabelText("New RCON password");
    await user.clear(address);
    await user.type(address, "missing-port");
    await user.type(password, "short");
    await user.click(screen.getByRole("button", { name: "Update credentials" }));
    expect(screen.getByText("RCON address must use host:port format.")).toBeVisible();
    expect(screen.getByText("RCON password must be at least 8 characters.")).toBeVisible();

    await user.clear(address);
    await user.type(address, "minecraft:25575");
    await user.clear(password);
    await user.type(password, "new-secret-pass");
    await user.click(screen.getByRole("button", { name: "Update credentials" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/settings/rcon", expect.objectContaining({ method: "PUT" })));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => String(path) === "/api/v1/settings")).toHaveLength(2));
  });

  it("confirms a user disable mutation with CSRF", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(baselineFetch);
    renderSettings(fetchMock);
    expect((await screen.findAllByText("viewer", { exact: true })).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Disable" }));
    expect(screen.getByRole("heading", { name: "Disable viewer?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Disable user" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/users/viewer-1", expect.objectContaining({ method: "DELETE" })));
    const disableCall = fetchMock.mock.calls.find(([path, init]) => String(path) === "/api/v1/users/viewer-1" && init?.method === "DELETE");
    expect((disableCall?.[1]?.headers as Headers).get("X-CSRF-Token")).toBe("csrf-token");
  });

  it("rejects malformed settings without rendering their values", async () => {
    renderSettings(vi.fn((input: RequestInfo | URL) => String(input) === "/api/v1/settings"
      ? Promise.resolve(jsonResponse({ ...settings, deployment: { ...settings.deployment, minecraftContainer: "<script>unsafe</script>", maxUploadBytes: -1 } }))
      : Promise.resolve(jsonResponse({ users: [session.user] }))));

    expect(await screen.findByRole("heading", { name: "Couldn’t load this view" })).toBeVisible();
    expect(screen.getByText("BlockOps returned an invalid response.")).toBeVisible();
    expect(screen.queryByText("<script>unsafe</script>")).not.toBeInTheDocument();
  });
});
