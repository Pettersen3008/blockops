import { startTransition, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { executeConsoleCommand, getConsoleHistory } from "./console-api";
import { consoleKeys } from "./console-keys";
import type { ConsoleLine } from "./console-schemas";
import { connectConsoleStream } from "./console-stream";
import type { ConsoleConnectionState } from "./console-stream";

export function useConsoleHistory() {
  return useQuery({ queryKey: consoleKeys.history(), queryFn: getConsoleHistory });
}

export function useConsoleStream() {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [connection, setConnection] = useState<ConsoleConnectionState>("connecting");

  useEffect(() => connectConsoleStream(
    setConnection,
    (line) => startTransition(() => setLines((current) => appendConsoleLine(current, line))),
  ), []);

  return { connection, lines };
}

export function useExecuteConsoleCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: executeConsoleCommand,
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function appendConsoleLine(lines: ConsoleLine[], line: ConsoleLine): ConsoleLine[] {
  return [...lines, line].slice(-2_000);
}

export function mergeConsoleLines(history: ConsoleLine[], live: ConsoleLine[]): ConsoleLine[] {
  const bySequence = new Map<number, ConsoleLine>();
  for (const line of [...history, ...live]) bySequence.set(line.sequence, line);
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence).slice(-2_000);
}
