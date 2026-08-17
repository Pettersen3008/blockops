import { consoleLineSchema } from "./console-schemas";
import type { ConsoleLine } from "./console-schemas";

export type ConsoleConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

interface StreamOptions {
  createSocket?: (url: string) => WebSocket;
  url?: string;
  schedule?: (callback: () => void, delay: number) => number;
  cancelSchedule?: (timer: number) => void;
}

export function connectConsoleStream(
  onConnection: (state: ConsoleConnectionState) => void,
  onLine: (line: ConsoleLine) => void,
  options: StreamOptions = {},
) {
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url));
  const schedule = options.schedule ?? ((callback, delay) => window.setTimeout(callback, delay));
  const cancelSchedule = options.cancelSchedule ?? ((timer) => window.clearTimeout(timer));
  const url = options.url ?? consoleWebSocketUrl();
  let socket: WebSocket | undefined;
  let timer: number | undefined;
  let stopped = false;
  let attempt = 0;

  const connect = () => {
    if (stopped) return;
    onConnection(attempt === 0 ? "connecting" : "reconnecting");
    const nextSocket = createSocket(url);
    socket = nextSocket;
    nextSocket.onopen = () => {
      attempt = 0;
      onConnection("connected");
    };
    nextSocket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const parsed = consoleLineSchema.safeParse(JSON.parse(event.data));
        if (parsed.success) onLine(parsed.data);
      } catch {
        // Malformed or non-JSON integration data never enters React state.
      }
    };
    nextSocket.onclose = () => {
      if (stopped) return;
      attempt += 1;
      onConnection("reconnecting");
      timer = schedule(connect, reconnectDelay(attempt));
    };
    nextSocket.onerror = () => nextSocket.close();
  };

  connect();
  return () => {
    stopped = true;
    if (timer !== undefined) cancelSchedule(timer);
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
    onConnection("disconnected");
  };
}

export function reconnectDelay(attempt: number): number {
  return Math.min(10_000, 500 * 2 ** Math.min(Math.max(attempt - 1, 0), 5));
}

function consoleWebSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/v1/console/ws`;
}
