import { describe, expect, it } from "vitest";
import { overviewSchema } from "./overview-schema";

const unavailable = { available: false, message: "Integration unavailable." };
const baseOverview = {
  server: unavailable,
  metrics: unavailable,
  disk: unavailable,
  players: unavailable,
  recentWarnings: [],
};

describe("overviewSchema", () => {
  it("accepts explicit unavailable and bounded available states", () => {
    expect(overviewSchema.safeParse(baseOverview).success).toBe(true);
    expect(overviewSchema.safeParse({
      server: { available: true, value: { state: "online", uptimeSeconds: 60 } },
      metrics: { available: true, value: { cpuPercent: 12.5, memoryUsageBytes: 1, memoryLimitBytes: 2 } },
      disk: { available: true, value: { usedBytes: 3, totalBytes: 4 } },
      players: { available: true, value: { online: 1, max: 20, names: ["Steve"] } },
      recentWarnings: [{ sequence: 1, timestamp: "2026-08-24T10:00:00Z", text: "[WARN] test" }],
    }).success).toBe(true);
  });

  it.each([
    ["missing available value", { ...baseOverview, server: { available: true } }],
    ["negative metric", { ...baseOverview, metrics: { available: true, value: { cpuPercent: -1, memoryUsageBytes: 1, memoryLimitBytes: 2 } } }],
    ["non-finite metric", { ...baseOverview, metrics: { available: true, value: { cpuPercent: Infinity, memoryUsageBytes: 1, memoryLimitBytes: 2 } } }],
    ["unsafe integer", { ...baseOverview, disk: { available: true, value: { usedBytes: Number.MAX_SAFE_INTEGER + 1, totalBytes: 2 } } }],
    ["invalid Java name", { ...baseOverview, players: { available: true, value: { online: 1, max: 20, names: ["name-is-over-16-chars"] } } }],
    ["more than five warnings", { ...baseOverview, recentWarnings: Array.from({ length: 6 }, (_, sequence) => ({ sequence, timestamp: "2026-08-24T10:00:00Z", text: "[WARN] test" })) }],
  ])("rejects %s", (_label, input) => {
    expect(overviewSchema.safeParse(input).success).toBe(false);
  });
});
