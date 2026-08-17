import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { httpRequest } from "./httpClient";
import { safeErrorMessage } from "./ApiError";

afterEach(() => vi.unstubAllGlobals());

describe("httpRequest", () => {
  it("rejects malformed success payloads without exposing their content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ secret: "do-not-render" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    await expect(httpRequest("/api/test", z.object({ ok: z.boolean() }))).rejects.toMatchObject({
      code: "invalid_response",
      safeMessage: "BlockOps returned an invalid response.",
    });
  });

  it("normalizes malformed error bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: "INVALID CODE", message: "\u0000unsafe" } }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    )));

    await expect(httpRequest("/api/test", z.unknown())).rejects.toMatchObject({
      status: 502,
      code: "request_failed",
      safeMessage: "Request failed with status 502.",
    });
  });

  it("does not expose arbitrary thrown error messages", () => {
    expect(safeErrorMessage(new Error("raw proxy response"))).toBe("Something went wrong.");
  });
});
