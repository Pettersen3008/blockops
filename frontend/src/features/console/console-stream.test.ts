import { describe, expect, it, vi } from "bun:test";
import { connectConsoleStream, reconnectDelay } from "./console-stream";

function createFakeSocket() {
  return {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    close: vi.fn(),
  } as unknown as WebSocket;
}

function streamHarness() {
  const sockets: WebSocket[] = [];
  const scheduled: Array<{ callback: () => void; delay: number; id: number }> = [];
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
        const id = scheduled.length + 1;
        scheduled.push({ callback, delay, id });
        return id;
      },
      cancelSchedule,
    },
  );
  return { cancelSchedule, cleanup, lines, scheduled, sockets, states };
}

function close(socket: WebSocket) {
  socket.onclose?.call(socket, new CloseEvent("close"));
}

describe("console stream", () => {
  it("accepts only string JSON frames that pass runtime validation", () => {
    const stream = streamHarness();
    const socket = stream.sockets[0]!;
    socket.onmessage?.call(socket, new MessageEvent("message", { data: JSON.stringify({ sequence: 1, timestamp: "2026-08-17T12:00:00Z", text: "ready" }) }));
    socket.onmessage?.call(socket, new MessageEvent("message", { data: new Blob(["unsafe"]) }));
    socket.onmessage?.call(socket, new MessageEvent("message", { data: "not json" }));
    socket.onmessage?.call(socket, new MessageEvent("message", { data: JSON.stringify({ sequence: -1, timestamp: "2026-08-17T12:00:00Z", text: "unsafe" }) }));

    expect(stream.lines).toEqual([{ sequence: 1, timestamp: "2026-08-17T12:00:00Z", text: "ready" }]);
    stream.cleanup();
  });

  it("progresses exponential reconnects, resets after open, and caps at ten seconds", () => {
    const stream = streamHarness();
    expect(stream.states).toEqual(["connecting"]);
    close(stream.sockets[0]!);
    expect(stream.scheduled[0]?.delay).toBe(500);
    stream.scheduled[0]?.callback();
    close(stream.sockets[1]!);
    expect(stream.scheduled[1]?.delay).toBe(1_000);

    for (let index = 1; index < 7; index += 1) {
      stream.scheduled[index]?.callback();
      close(stream.sockets[index + 1]!);
    }
    expect(stream.scheduled.map(({ delay }) => delay)).toEqual([500, 1_000, 2_000, 4_000, 8_000, 10_000, 10_000, 10_000]);

    stream.scheduled.at(-1)?.callback();
    const opened = stream.sockets.at(-1)!;
    opened.onopen?.call(opened, new Event("open"));
    close(opened);
    expect(stream.scheduled.at(-1)?.delay).toBe(500);
    stream.cleanup();
  });

  it("lets close own one reconnect after an error", () => {
    const stream = streamHarness();
    const socket = stream.sockets[0]!;
    const onClose = socket.onclose;
    socket.onerror?.call(socket, new Event("error"));
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(stream.scheduled).toHaveLength(0);
    onClose?.call(socket, new CloseEvent("close"));
    onClose?.call(socket, new CloseEvent("close"));
    expect(stream.scheduled).toHaveLength(1);
    stream.cleanup();
  });

  it("cancels a pending timer and cannot reconnect after cleanup", () => {
    const stream = streamHarness();
    close(stream.sockets[0]!);
    const pending = stream.scheduled[0]!;
    stream.cleanup();

    expect(stream.cancelSchedule).toHaveBeenCalledWith(pending.id);
    expect(stream.states.at(-1)).toBe("disconnected");
    pending.callback();
    expect(stream.sockets).toHaveLength(1);
  });

  it("detaches callbacks and closes the active socket on cleanup", () => {
    const stream = streamHarness();
    const socket = stream.sockets[0]!;
    stream.cleanup();

    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(socket.onerror).toBeNull();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(stream.states).toEqual(["connecting", "disconnected"]);
  });

  it("calculates bounded reconnect delays", () => {
    expect(reconnectDelay(1)).toBe(500);
    expect(reconnectDelay(2)).toBe(1_000);
    expect(reconnectDelay(20)).toBe(10_000);
  });
});
