# BlockOps

BlockOps is an open-source, single-server control plane for a Dockerized Paper/Spigot-compatible Minecraft Java server. It provides live monitoring, a Minecraft console, player administration, safe world operations, local backups, dashboard roles, and an audit log without exposing a browser shell.

The current release is a strong single-server MVP. Missing integrations are shown as unavailable; the dashboard does not invent metrics or server state.

## What is implemented

- Overview with container state, software/version when RCON reports them, uptime, online players, CPU, memory, filesystem capacity, recent warnings, and last backup.
- Bounded `latest.log` console streaming over a reconnecting WebSocket, search/level filters, pause/resume, and RCON command history.
- Allowlist, kick, ban/pardon, and vanilla OP/de-OP operations.
- Consistent world download; staged and traversal-safe world ZIP replacement with rollback.
- Consistent local backup create/download/delete and administrator-only restore.
- Start/stop/restart of exactly one configured container through a narrow Docker guard sidecar.
- One-time administrator setup, Argon2id passwords, revocable server sessions, HttpOnly cookies, CSRF protection, login throttling, backend RBAC, security headers, trusted-proxy configuration, encrypted RCON credential rotation, and structured audit events.
- Responsive, keyboard-accessible light/dark React interface and an embedded production build served by Go.

BlockOps deliberately has no Docker exec, host shell, general file manager, plugin marketplace, arbitrary container target, or arbitrary host command endpoint.

## Roles

| Capability | Administrator | Operator | Viewer |
| --- | :---: | :---: | :---: |
| Monitoring, players, console output, backup catalog | ✓ | ✓ | ✓ |
| Minecraft commands and player actions | ✓ | ✓ | — |
| Create/delete/download backups and download world | ✓ | ✓ | — |
| Restart configured container | ✓ | ✓ | — |
| Start/stop configured container | ✓ | — | — |
| Users, security/integration settings, audit log | ✓ | — | — |
| Replace world or restore backup | ✓ | — | — |

Permissions are enforced by the Go API. The interface only mirrors them for usability.

## Deployment model

Use BlockOps over a private network such as Tailscale, or behind a trusted HTTPS reverse proxy. The Compose default binds the dashboard to host loopback. Do not publish RCON, the Docker guard, or the Docker socket.

The Docker guard is a second process from the same image. Only it mounts `/var/run/docker.sock`. Its HTTP surface accepts inspect, stats, start, stop, and restart for the configured container name; it has no exec, create, remove, image, volume, or arbitrary-target handler. The dashboard container runs as UID/GID `10001:10001`, drops all capabilities, has a read-only root filesystem, and never mounts the Docker socket.

### Prerequisites

- Docker Engine with Compose v2.
- An existing Minecraft Java container using a persistent named volume or bind mount.
- RCON enabled in the server's `server.properties` with a strong password. The RCON port must be reachable only on the private Docker network.
- The Minecraft data source must be readable and writable by UID/GID 10001 for world replacement. Align volume ownership or host ACLs before enabling uploads/restores.

### Install beside an existing server

1. Copy the environment template and fill every required field:

   ```sh
   cp .env.example .env
   openssl rand -base64 32
   ```

   Put the generated value in `BLOCKOPS_ENCRYPTION_KEY`. Set `BLOCKOPS_MINECRAFT_CONTAINER` to the exact Docker container name, `BLOCKOPS_RCON_PASSWORD` to the server's existing RCON password, and `MINECRAFT_DATA_SOURCE` to its named volume or absolute bind path. No production credentials are included in the repository.

2. Build and start BlockOps:

   ```sh
   docker compose up -d --build
   ```

3. Join the existing Minecraft container to the private RCON network:

   ```sh
   docker network connect blockops-minecraft YOUR_MINECRAFT_CONTAINER
   ```

   If its name is not `minecraft`, set `BLOCKOPS_RCON_ADDRESS=YOUR_MINECRAFT_CONTAINER:25575`. Do not add a host port mapping for 25575.

4. Open the configured HTTPS origin through your reverse proxy or, for a loopback development check, set `BLOCKOPS_COOKIE_SECURE=false` and visit `http://127.0.0.1:8080`. Create the first administrator. Re-enable secure cookies before an HTTPS deployment.

5. Confirm Overview reports the container and RCON separately. If either is unavailable, verify the exact container name, shared network, RCON password, and mounted data source. BlockOps fails closed for consistency-sensitive operations.

### Reverse proxy notes

- Preserve the original `Host` header and WebSocket upgrades.
- Set `BLOCKOPS_PUBLIC_ORIGIN` to the exact external `https://` origin without a trailing slash.
- Add only the direct proxy CIDR(s) to `BLOCKOPS_TRUSTED_PROXIES`. Otherwise forwarded client-address headers are ignored.
- Keep the dashboard bound to loopback when the proxy runs on the host. For a containerized proxy, attach it to an explicit private network instead of exposing BlockOps publicly.
- Match proxy body-size and time-out limits to `BLOCKOPS_MAX_UPLOAD_BYTES` if world uploads are enabled.

## Local development

Go 1.25.13+, Node.js 24+, and npm are required.

```sh
mkdir -p runtime/minecraft runtime/backups
cp .env.example .env
make dev-api
```

In another terminal:

```sh
make dev-web
```

The Vite server proxies `/api` and WebSockets to `127.0.0.1:8080`. Local development should set `BLOCKOPS_COOKIE_SECURE=false`. Docker and RCON may remain absent; their UI values will be explicitly unavailable.

Run deterministic checks with:

```sh
make test
make build
```

With the development servers running, execute the real-browser smoke journey with `make test-e2e`. Set `BLOCKOPS_E2E_CHROME_PATH` when using an already-installed Chromium/Chrome binary; CI installs Chromium and tests the assembled production server.

## API and repository map

- [OpenAPI 3.1 specification](backend/internal/httpapi/openapi.yaml) — also served at `/api/openapi.yaml`.
- [`backend/`](backend) — Go API, persistence, integrations, archival operations, and embedded UI.
- [`frontend/`](frontend) — strict TypeScript React/Vite client using TanStack Query.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — trust boundaries and runtime flow.
- [`docs/FRONTEND_EVOLUTION.md`](docs/FRONTEND_EVOLUTION.md) — frontend architecture decisions and incremental migration plan.
- [`docs/SECURITY.md`](docs/SECURITY.md) — controls, residual risks, and deployment checklist.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — deliberately deferred features.
- [`docs/DELIVERY_BRIEF.md`](docs/DELIVERY_BRIEF.md) — observable acceptance criteria.

The temporary name is centralized in [`frontend/src/config.ts`](frontend/src/config.ts) and [`backend/internal/config/config.go`](backend/internal/config/config.go), with Compose/image labels in the root deployment files.

## Dependencies

Runtime dependencies are intentionally narrow:

- `modernc.org/sqlite` provides an embedded, CGO-free state store suitable for the single-container model.
- `golang.org/x/crypto` provides Argon2id.
- `github.com/coder/websocket` provides a reviewed WebSocket implementation rather than custom framing.
- React is the UI runtime; TanStack Query owns server state and prevents duplicate request plumbing; Lucide supplies consistent accessible SVG icons.
- Vite, TypeScript, Vitest, and Playwright are build/test tooling only.

## License

MIT. Minecraft is a trademark of Microsoft/Mojang. BlockOps is independent software and ships no Minecraft artwork, server binaries, or game assets.
