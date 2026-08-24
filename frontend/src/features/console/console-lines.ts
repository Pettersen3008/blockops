import type { ConsoleLine } from "./console-schema";

const CLIENT_LINE_LIMIT = 2_000;

export function appendConsoleLine(lines: ConsoleLine[], line: ConsoleLine): ConsoleLine[] {
  return [...lines, line].slice(-CLIENT_LINE_LIMIT);
}

export function mergeConsoleLines(history: ConsoleLine[], live: ConsoleLine[]): ConsoleLine[] {
  const bySequence = new Map<number, ConsoleLine>();
  for (const line of history) bySequence.set(line.sequence, line);
  for (const line of live) bySequence.set(line.sequence, line);

  return [...bySequence.values()]
    .sort((left, right) => left.sequence - right.sequence)
    .slice(-CLIENT_LINE_LIMIT);
}
