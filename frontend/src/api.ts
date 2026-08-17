import type {
  AuditEvent,
  ConsoleLine,
  Player,
  SettingsData,
} from "./types";
import type { Backup } from "@/features/backups";
import type { Role, User } from "@/features/auth";
import { ApiError, apiErrorFromResponse, safeErrorMessage } from "@/lib/api/ApiError";

async function request<T>(
  path: string,
  init: RequestInit = {},
  csrfToken?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  consoleHistory: () =>
    request<{ lines: ConsoleLine[] }>("/api/v1/console/history"),
  executeCommand: (csrf: string, command: string) =>
    request<{ response: string }>(
      "/api/v1/console/commands",
      { method: "POST", body: JSON.stringify({ command }) },
      csrf,
    ),
  players: () => request<{ players: Player[] }>("/api/v1/players"),
  playerAction: (
    csrf: string,
    action: string,
    name: string,
    reason = "",
  ) =>
    request<{ response: string }>(
      "/api/v1/players/actions",
      { method: "POST", body: JSON.stringify({ action, name, reason }) },
      csrf,
    ),
  backups: () => request<{ backups: Backup[] }>("/api/v1/backups"),
  createBackup: (csrf: string) =>
    request<Backup>("/api/v1/backups", { method: "POST" }, csrf),
  deleteBackup: (csrf: string, id: string) =>
    request<void>(`/api/v1/backups/${encodeURIComponent(id)}`, { method: "DELETE" }, csrf),
  restoreBackup: (csrf: string, id: string) =>
    request<{ status: string }>(
      `/api/v1/backups/${encodeURIComponent(id)}/restore`,
      { method: "POST" },
      csrf,
    ),
  replaceWorld: async (csrf: string, file: File) => {
    const response = await fetch("/api/v1/world", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/zip", "X-CSRF-Token": csrf },
      body: file,
    });
    if (!response.ok) {
      throw await apiErrorFromResponse(response);
    }
  },
  audit: () => request<{ events: AuditEvent[] }>("/api/v1/audit?limit=200"),
  users: () => request<{ users: User[] }>("/api/v1/users"),
  createUser: (csrf: string, username: string, password: string, role: Role) =>
    request<User>(
      "/api/v1/users",
      { method: "POST", body: JSON.stringify({ username, password, role }) },
      csrf,
    ),
  disableUser: (csrf: string, id: string) =>
    request<void>(`/api/v1/users/${encodeURIComponent(id)}`, { method: "DELETE" }, csrf),
  revokeSessions: (csrf: string, id: string) =>
    request<void>(
      `/api/v1/users/${encodeURIComponent(id)}/revoke-sessions`,
      { method: "POST" },
      csrf,
    ),
  settings: () => request<SettingsData>("/api/v1/settings"),
  updateRCON: (csrf: string, address: string, password: string) =>
    request<SettingsData["rcon"]>(
      "/api/v1/settings/rcon",
      { method: "PUT", body: JSON.stringify({ address, password }) },
      csrf,
    ),
};

export function errorMessage(error: unknown): string {
  return safeErrorMessage(error);
}

export { ApiError };
