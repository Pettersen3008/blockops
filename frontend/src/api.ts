import type {
  ConsoleLine,
} from "./types";
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
};

export function errorMessage(error: unknown): string {
  return safeErrorMessage(error);
}

export { ApiError };
