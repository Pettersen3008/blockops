import { describe, expect, it } from "bun:test";
import { formatBytes, formatDuration } from "./formatters";

describe("metric formatting", () => {
  it("does not invent unavailable values", () => {
    expect(formatBytes(undefined)).toBe("Unavailable");
    expect(formatDuration(undefined)).toBe("Unavailable");
  });

  it("formats bounded operational values", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatDuration(3_900)).toBe("1h 5m");
  });
});
