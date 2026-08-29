import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "bun:test";
import { configureCsrfToken } from "@/lib/api/api";
import { server } from "@/test/setup";
import { getOverview } from "./api/get-overview";
import { runServerAction } from "./api/run-server-action";

const unavailableOverview = {
  server: { available: false },
  metrics: { available: false },
  disk: { available: false },
  players: { available: false },
  recentWarnings: [],
};

afterEach(() => configureCsrfToken(() => undefined));

describe("overview endpoints", () => {
  it("keeps the GET contract at its endpoint and rejects malformed success", async () => {
    server.use(http.get("/api/v1/servers/test-server/overview", () => HttpResponse.json({ unsafe: "value" })));

    await expect(getOverview()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("posts the exact lifecycle body with CSRF and parses the response", async () => {
    configureCsrfToken(() => "csrf-token");
    let request: { body: unknown; csrf: string | null } | undefined;
    server.use(
      http.get("/api/v1/servers/test-server/overview", () => HttpResponse.json(unavailableOverview)),
      http.post("/api/v1/servers/test-server/actions", async ({ request: incoming }) => {
        request = { body: await incoming.json(), csrf: incoming.headers.get("X-CSRF-Token") };
        return HttpResponse.json({ status: "restart requested" }, { status: 202 });
      }),
    );

    await expect(runServerAction("restart")).resolves.toEqual({ status: "restart requested" });
    expect(request).toEqual({ body: { action: "restart" }, csrf: "csrf-token" });
  });
});
