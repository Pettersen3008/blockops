import { describe, expect, it } from "vitest";
import { appendConsoleLine, mergeConsoleLines } from "./console.hooks";
import type { ConsoleLine } from "./console.schemas";

const line = (sequence: number): ConsoleLine => ({ sequence, timestamp: "2026-08-17T12:00:00Z", text: `line ${sequence}` });

describe("console line bounds", () => {
  it("keeps only the latest 2,000 live lines", () => {
    const lines = Array.from({ length: 2_000 }, (_, index) => line(index + 1));
    const result = appendConsoleLine(lines, line(2_001));
    expect(result).toHaveLength(2_000);
    expect(result[0]?.sequence).toBe(2);
    expect(result.at(-1)?.sequence).toBe(2_001);
  });

  it("deduplicates overlapping history and live lines", () => {
    expect(mergeConsoleLines([line(1), line(2)], [line(2), line(3)]).map((item) => item.sequence)).toEqual([1, 2, 3]);
  });
});
