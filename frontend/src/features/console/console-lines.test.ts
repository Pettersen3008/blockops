import { describe, expect, it } from "bun:test";
import { appendConsoleLine, mergeConsoleLines } from "./console-lines";
import type { ConsoleLine } from "./console-schema";

const line = (sequence: number, text = `line ${sequence}`): ConsoleLine => ({ sequence, timestamp: "2026-08-17T12:00:00Z", text });

describe("console line bounds", () => {
  it("keeps only the latest 2,000 live lines", () => {
    const lines = Array.from({ length: 2_000 }, (_, index) => line(index + 1));
    const result = appendConsoleLine(lines, line(2_001));
    expect(result).toHaveLength(2_000);
    expect(result[0]?.sequence).toBe(2);
    expect(result.at(-1)?.sequence).toBe(2_001);
  });

  it("deduplicates overlap, prefers live data, sorts, and bounds deterministically", () => {
    const history = [line(2, "history"), line(1)];
    const live = [line(2, "live"), ...Array.from({ length: 2_000 }, (_, index) => line(index + 3))];
    const result = mergeConsoleLines(history, live);
    expect(result).toHaveLength(2_000);
    expect(result[0]?.sequence).toBe(3);
    expect(result.at(-1)?.sequence).toBe(2_002);
    expect(mergeConsoleLines(history, [line(2, "live")])[1]?.text).toBe("live");
  });
});
