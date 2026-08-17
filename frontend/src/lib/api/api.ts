import type { z } from "zod";
import { ApiError, apiErrorFromResponse } from "./api-error";

type CsrfTokenGetter = () => string | undefined;

interface MutationOptions {
  body?: unknown;
}

let getCsrfToken: CsrfTokenGetter = () => undefined;

export function configureCsrfToken(getter: CsrfTokenGetter) {
  getCsrfToken = getter;
}

export const api = {
  get: (path: string) => request("GET", path),
  post: (path: string, options?: MutationOptions) => request("POST", path, options),
  put: (path: string, options?: MutationOptions) => request("PUT", path, options),
  delete: (path: string) => request("DELETE", path),
};

export function parseApiResponse<T>(data: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  throw new ApiError(0, "invalid_response", "BlockOps returned an invalid response.");
}

async function request(method: "GET" | "POST" | "PUT" | "DELETE", path: string, options?: MutationOptions) {
  const headers = new Headers({ Accept: "application/json" });
  const body = requestBody(options?.body, headers);
  if (method !== "GET") {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(path, {
    method,
    headers,
    body,
    credentials: "same-origin",
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  if (response.status === 204) return undefined;

  try {
    return await response.json() as unknown;
  } catch {
    throw new ApiError(response.status, "invalid_response", "BlockOps returned an unreadable response.");
  }
}

function requestBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (body instanceof Blob) {
    headers.set("Content-Type", body.type || "application/octet-stream");
    return body;
  }
  headers.set("Content-Type", "application/json");
  return JSON.stringify(body);
}
