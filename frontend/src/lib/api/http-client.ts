import type { z } from "zod";
import { ApiError, apiErrorFromResponse } from "./api-error";

interface HttpRequestOptions extends RequestInit {
  csrfToken?: string;
}

export async function httpRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: HttpRequestOptions = {},
): Promise<T> {
  const { csrfToken, ...init } = options;
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);

  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (!response.ok) throw await apiErrorFromResponse(response);

  if (response.status === 204) {
    const empty = schema.safeParse(undefined);
    if (empty.success) return empty.data;
    throw new ApiError(response.status, "invalid_response", "BlockOps returned an invalid response.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, "invalid_response", "BlockOps returned an unreadable response.");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(response.status, "invalid_response", "BlockOps returned an invalid response.");
  }
  return parsed.data;
}
