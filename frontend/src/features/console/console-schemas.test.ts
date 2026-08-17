import { describe, expect, it } from "vitest";
import { consoleCommandSchema, consoleHistorySchema, consoleLineSchema } from "./console-schemas";

const line = { sequence: 1, timestamp: "2026-08-17T12:00:00Z", text: "[Server thread/INFO]: Ready" };

describe("console schemas", () => {
  it("validates bounded history and WebSocket lines", () => {
    expect(consoleLineSchema.safeParse(line).success).toBe(true);
    expect(consoleHistorySchema.safeParse({ lines: [line] }).success).toBe(true);
    expect(consoleLineSchema.safeParse({ ...line, sequence: -1 }).success).toBe(false);
    expect(consoleLineSchema.safeParse({ ...line, timestamp: "yesterday" }).success).toBe(false);
    expect(consoleHistorySchema.safeParse({ lines: Array.from({ length: 1_001 }, () => line) }).success).toBe(false);
  });

  it("trims commands while rejecting empty, multiline, and oversized input", () => {
    expect(consoleCommandSchema.parse("  say hello  ")).toBe("say hello");
    expect(consoleCommandSchema.safeParse(" \n say hello").success).toBe(false);
    expect(consoleCommandSchema.safeParse("   ").success).toBe(false);
    expect(consoleCommandSchema.safeParse("ø".repeat(2_049)).success).toBe(false);
  });
});
