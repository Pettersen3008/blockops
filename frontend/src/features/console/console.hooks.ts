import { startTransition, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { overviewKeys } from "@/features/overview/keys";
import { playerKeys } from "@/features/players/keys";
import { consoleApi } from "./console.api";
import { consoleKeys } from "./console.keys";
import type { ConsoleLine } from "./console.schemas";
import { connectConsoleStream } from "./console.stream";
import type { ConsoleConnectionState } from "./console.stream";

export function useConsoleHistory() {
  return useQuery({ queryKey: consoleKeys.history(), queryFn: consoleApi.history });
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

export function useExecuteConsoleCommand(csrfToken: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: string) => consoleApi.execute(csrfToken, command),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: consoleKeys.all });
      void queryClient.invalidateQueries({ queryKey: overviewKeys.all });
      void queryClient.invalidateQueries({ queryKey: playerKeys.all });
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
