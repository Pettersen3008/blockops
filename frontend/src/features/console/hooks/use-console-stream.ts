import { startTransition, useEffect, useState } from "react";
import { appendConsoleLine } from "../console-lines";
import type { ConsoleLine } from "../console-schema";
import { connectConsoleStream } from "../console-stream";
import type { ConsoleConnectionState } from "../console-stream";

export function useConsoleStream() {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [connection, setConnection] = useState<ConsoleConnectionState>("connecting");

  useEffect(() => connectConsoleStream(
    setConnection,
    (line) => startTransition(() => setLines((current) => appendConsoleLine(current, line))),
  ), []);

  return { connection, lines };
}
