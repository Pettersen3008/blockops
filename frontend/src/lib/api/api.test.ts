import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { api, configureCsrfToken, parseApiResponse } from "./api";
import { safeErrorMessage } from "./api-error";

afterEach(() => {
  configureCsrfToken(() => undefined);
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("attaches CSRF to mutations but not reads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    configureCsrfToken(() => "csrf-token");

    await api.get("/api/read");
    await api.post("/api/post");
    await api.put("/api/put");
    await api.delete("/api/delete");

    const headersFor = (index: number) => fetchMock.mock.calls[index]?.[1]?.headers as Headers;
    expect(headersFor(0).get("X-CSRF-Token")).toBeNull();
    expect(headersFor(1).get("X-CSRF-Token")).toBe("csrf-token");
    expect(headersFor(2).get("X-CSRF-Token")).toBe("csrf-token");
    expect(headersFor(3).get("X-CSRF-Token")).toBe("csrf-token");
  });

  it("rejects malformed success payloads without exposing their content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ secret: "do-not-render" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const data = await api.get("/api/test");
    expect(() => parseApiResponse(data, z.object({ ok: z.boolean() }))).toThrow(expect.objectContaining({
      code: "invalid_response",
      safeMessage: "BlockOps returned an invalid response.",
    }));
  });

  it("returns undefined for an empty response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const data = await api.delete("/api/test");
    expect(parseApiResponse(data, z.undefined())).toBeUndefined();
  });

  it("normalizes malformed error bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: "INVALID CODE", message: "\u0000unsafe" } }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    )));

    await expect(api.get("/api/test")).rejects.toMatchObject({
      status: 502,
      code: "request_failed",
      safeMessage: "Request failed with status 502.",
    });
  });

  it("does not expose arbitrary thrown error messages", () => {
    expect(safeErrorMessage(new Error("raw proxy response"))).toBe("Something went wrong.");
  });
});
