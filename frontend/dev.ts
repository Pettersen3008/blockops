import index from "./index.html";

type SocketData = {
  buffered: (string | Buffer)[];
  upstream: WebSocket;
};

const apiOrigin = new URL(process.env.BLOCKOPS_API_ORIGIN ?? "http://127.0.0.1:8080");

function apiURL(request: Request) {
  const url = new URL(request.url);
  url.protocol = apiOrigin.protocol;
  url.hostname = apiOrigin.hostname;
  url.port = apiOrigin.port;
  return url;
}

async function proxyRequest(request: Request) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  return fetch(apiURL(request), {
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    headers,
    method: request.method,
  });
}

// Dial the API before completing the browser handshake, so a connection the API refuses
// (unauthenticated console stream) fails the handshake instead of opening and closing again.
async function connectUpstream(request: Request) {
  const headers: Record<string, string> = {};
  for (const name of ["cookie", "origin", "sec-websocket-protocol"]) {
    const value = request.headers.get(name);
    if (value !== null) headers[name] = value;
  }

  const upstream = new WebSocket(apiURL(request).href, { headers });
  const buffered: (string | Buffer)[] = [];
  upstream.onmessage = (event) => buffered.push(event.data);

  const connected = await new Promise<boolean>((resolve) => {
    upstream.onopen = () => resolve(true);
    upstream.onclose = () => resolve(false);
    upstream.onerror = () => resolve(false);
  });
  return connected ? { buffered, upstream } : null;
}

const server: ReturnType<typeof Bun.serve<SocketData>> = Bun.serve<SocketData>({
  development: { hmr: true },
  hostname: "127.0.0.1",
  port: 5173,
  routes: {
    "/api/*": async (request: Request) => {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return proxyRequest(request);

      const data = await connectUpstream(request);
      if (!data) return new Response("The BlockOps API refused the WebSocket upgrade", { status: 502 });
      if (server.upgrade(request, { data })) return undefined;

      data.upstream.close();
      return new Response("WebSocket upgrade failed", { status: 400 });
    },
    "/*": index,
  },
  websocket: {
    close(socket) {
      socket.data.upstream.close();
    },
    message(socket, message) {
      socket.data.upstream.send(message);
    },
    open(socket) {
      const { buffered, upstream } = socket.data;
      for (const frame of buffered) socket.send(frame);
      buffered.length = 0;
      upstream.onclose = (event) => socket.close(event.code || 1000, event.reason);
      upstream.onerror = () => socket.close(1011, "Upstream WebSocket failed");
      upstream.onmessage = (event) => socket.send(event.data);
    },
  },
});

console.log(`BlockOps web development server: ${server.url}`);
