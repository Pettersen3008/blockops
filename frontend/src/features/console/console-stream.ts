import { consoleLineSchema } from "./console-schema";
import type { ConsoleLine } from "./console-schema";

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
    timer = undefined;
    onConnection(attempt === 0 ? "connecting" : "reconnecting");
    const nextSocket = createSocket(url);
    socket = nextSocket;
    nextSocket.onopen = () => {
      if (stopped || socket !== nextSocket) return;
      attempt = 0;
      onConnection("connected");
    };
    nextSocket.onmessage = (event) => {
      if (stopped || socket !== nextSocket) return;
      if (typeof event.data !== "string") return;
      try {
        const parsed = consoleLineSchema.safeParse(JSON.parse(event.data));
        if (parsed.success) onLine(parsed.data);
      } catch {
        // Malformed or non-JSON integration data never enters React state.
      }
    };
    nextSocket.onclose = () => {
      if (stopped || socket !== nextSocket || timer !== undefined) return;
      nextSocket.onopen = null;
      nextSocket.onmessage = null;
      nextSocket.onclose = null;
      nextSocket.onerror = null;
      socket = undefined;
      attempt += 1;
      onConnection("reconnecting");
      timer = schedule(connect, reconnectDelay(attempt));
    };
    nextSocket.onerror = () => {
      if (!stopped && socket === nextSocket) nextSocket.close();
    };
  };

  connect();
  return () => {
    stopped = true;
    if (timer !== undefined) {
      cancelSchedule(timer);
      timer = undefined;
    }
    if (socket) {
      const activeSocket = socket;
      socket = undefined;
      activeSocket.onopen = null;
      activeSocket.onmessage = null;
      activeSocket.onclose = null;
      activeSocket.onerror = null;
      activeSocket.close();
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
