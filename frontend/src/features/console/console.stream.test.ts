import { describe, expect, it, vi } from "vitest";
import { connectConsoleStream, reconnectDelay } from "./console.stream";

function createFakeSocket() {
  return {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    close: vi.fn(),
  } as unknown as WebSocket;
}

describe("console stream", () => {
  it("validates messages, reconnects with backoff, and cleans up", () => {
    const sockets: WebSocket[] = [];
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const states: string[] = [];
    const lines: unknown[] = [];
    const cancelSchedule = vi.fn();
    const cleanup = connectConsoleStream(
      (state) => states.push(state),
      (line) => lines.push(line),
      {
        url: "ws://blockops.test/api/v1/console/ws",
        createSocket: () => {
          const socket = createFakeSocket();
          sockets.push(socket);
          return socket;
        },
        schedule: (callback, delay) => {
          scheduled.push({ callback, delay });
          return 42;
        },
        cancelSchedule,
      },
    );

    expect(states).toEqual(["connecting"]);
    sockets[0]?.onopen?.call(sockets[0], new Event("open"));
    sockets[0]?.onmessage?.call(sockets[0], new MessageEvent("message", { data: JSON.stringify({ sequence: 1, timestamp: "2026-08-17T12:00:00Z", text: "ready" }) }));
    sockets[0]?.onmessage?.call(sockets[0], new MessageEvent("message", { data: JSON.stringify({ sequence: -1, text: "unsafe" }) }));
    expect(states).toEqual(["connecting", "connected"]);
    expect(lines).toHaveLength(1);

    sockets[0]?.onclose?.call(sockets[0], new CloseEvent("close"));
    expect(states.at(-1)).toBe("reconnecting");
    expect(scheduled[0]?.delay).toBe(500);
    scheduled[0]?.callback();
    expect(sockets).toHaveLength(2);

    cleanup();
    expect(cancelSchedule).toHaveBeenCalledWith(42);
    expect(sockets[1]?.close).toHaveBeenCalled();
    expect(states.at(-1)).toBe("disconnected");
  });

  it("caps exponential backoff", () => {
    expect(reconnectDelay(1)).toBe(500);
    expect(reconnectDelay(2)).toBe(1_000);
    expect(reconnectDelay(20)).toBe(10_000);
  });
});
