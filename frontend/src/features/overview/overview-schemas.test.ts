import { describe, expect, it } from "vitest";
import { overviewSchema } from "./overview-schemas";

const unavailable = { available: false, message: "Integration unavailable." };

describe("overviewSchema", () => {
  it("accepts explicit unavailable states", () => {
    expect(overviewSchema.safeParse({
      server: unavailable,
      metrics: unavailable,
      disk: unavailable,
      players: unavailable,
      recentWarnings: [],
    }).success).toBe(true);
  });

  it("requires a validated value when a metric is available", () => {
    expect(overviewSchema.safeParse({
      server: { available: true },
      metrics: unavailable,
      disk: unavailable,
      players: unavailable,
      recentWarnings: [],
    }).success).toBe(false);
  });
});
