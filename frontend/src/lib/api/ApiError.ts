import { z } from "zod";

const errorBodySchema = z.object({
  error: z.object({
    code: z.string().regex(/^[a-z0-9_]{1,64}$/).optional(),
    message: z.string().trim().min(1).max(240).regex(/^[^\u0000-\u001f\u007f]*$/u).optional(),
  }).optional(),
});

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly safeMessage: string;

  constructor(status: number, code: string, safeMessage: string) {
    super(safeMessage);
    this.name = "ApiError";
    this.status = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
    this.code = /^[a-z0-9_]{1,64}$/.test(code) ? code : "request_failed";
    this.safeMessage = safeMessage;
  }
}

export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const parsed = errorBodySchema.safeParse(body);
  return new ApiError(
    response.status,
    parsed.success ? parsed.data.error?.code ?? "request_failed" : "request_failed",
    parsed.success
      ? parsed.data.error?.message ?? `Request failed with status ${response.status}.`
      : `Request failed with status ${response.status}.`,
  );
}

export function safeErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.safeMessage : "Something went wrong.";
}
