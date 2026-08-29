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
- Responsive, keyboard-accessible light/dark interface and an embedded production build served by Go.

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

### Verify and select a tagged image

Each [GitHub release](https://github.com/Pettersen3008/blockops/releases) lists one multi-architecture image by digest. Install [Cosign](https://docs.sigstore.dev/cosign/system_config/installation/) and the [GitHub CLI](https://cli.github.com/), then replace the example version and digest with the release values:

```sh
VERSION=v1.2.3
IMAGE=ghcr.io/pettersen3008/blockops@sha256:REPLACE_WITH_RELEASE_DIGEST

cosign verify \
  --certificate-identity "https://github.com/Pettersen3008/blockops/.github/workflows/release.yml@refs/tags/$VERSION" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "$IMAGE"
```

Download the release evidence and verify its checksums on Linux:

```sh
gh release download "$VERSION" --repo Pettersen3008/blockops --dir "blockops-$VERSION"
(cd "blockops-$VERSION" && sha256sum --check SHA256SUMS)
test "$(cat "blockops-$VERSION"/*-image.txt)" = "$IMAGE"
```

On macOS, replace the `sha256sum` command with `shasum -a 256 --check SHA256SUMS`. The downloaded files contain the image index plus SPDX and SLSA provenance JSON for both `linux/amd64` and `linux/arm64`.

After both checks pass, copy the full `IMAGE` value into `.env` as `BLOCKOPS_IMAGE=ghcr.io/pettersen3008/blockops@sha256:...`. The digest keeps later deployments on the verified image even if a registry tag changes.

### Install beside an existing server

1. Copy the environment template and fill every required field:

   ```sh
   cp .env.example .env
   openssl rand -base64 32
   ```

   Put the generated value in `BLOCKOPS_ENCRYPTION_KEY`. Set `BLOCKOPS_MINECRAFT_CONTAINER` to the exact Docker container name and `BLOCKOPS_RCON_PASSWORD` to the server's existing RCON password. For a tagged release, set `BLOCKOPS_IMAGE` to the verified digest reference from the previous section. Keep `blockops:local` only when building this checkout. No production credentials are included in the repository.

2. Choose one of the two supported Minecraft data sources. `MINECRAFT_DATA_SOURCE` has no default, so BlockOps refuses to start rather than mounting an empty directory over your world.

   For an absolute host path, set `MINECRAFT_DATA_SOURCE=/srv/minecraft`. Start a tagged release with:

   ```sh
   docker compose pull
   docker compose up -d --no-build
   ```

   For an existing named volume, set `MINECRAFT_DATA_SOURCE` to its exact volume name, add `COMPOSE_FILE=compose.yaml:compose.minecraft-volume.yaml` to `.env`, and start a tagged release with:

   ```sh
   docker compose -f compose.yaml -f compose.minecraft-volume.yaml pull
   docker compose -f compose.yaml -f compose.minecraft-volume.yaml up -d --no-build
   ```

   The override file declares that volume `external`, so a name that does not exist fails loudly instead of creating an empty one. With `COMPOSE_FILE` set, later `docker compose ps`, `logs`, and `down` commands need no `-f` flags. Docker Desktop and Linux use the same two commands.

   To build this checkout instead, keep `BLOCKOPS_IMAGE=blockops:local` and replace the `pull` and `up` commands with `docker compose up -d --build`.

3. Join the existing Minecraft container to the private RCON network. BlockOps cannot reach a container it does not share a network with, on either platform. The first `docker compose up` creates the internal network `blockops-minecraft`; it publishes nothing and adds no host exposure.

   If your Minecraft server has its own Compose file, declare the network there so the attachment survives every recreation:

   ```yaml
   services:
     minecraft:
       networks: [default, blockops-minecraft]

   networks:
     blockops-minecraft:
       external: true
   ```

   Then `docker compose up -d` that stack. For a container not managed by Compose, attach it directly and re-run this after any recreation:

   ```sh
   docker network connect blockops-minecraft YOUR_MINECRAFT_CONTAINER
   ```

   If its name is not `minecraft`, set `BLOCKOPS_RCON_ADDRESS=YOUR_MINECRAFT_CONTAINER:25575`. Do not add a host port mapping for 25575.

4. Confirm both services are healthy and only the dashboard is published:

   ```sh
   docker compose ps
   ```

   `dashboard` and `docker-guard` both report `healthy`, and the only host port is `127.0.0.1:8080->8080/tcp`. The guard has its own health check against `http://127.0.0.1:2375/health`; the dashboard waits for it before starting.

5. Open the configured HTTPS origin through your reverse proxy or, for a loopback development check, set `BLOCKOPS_COOKIE_SECURE=false` and visit `http://127.0.0.1:8080`. Create the first administrator. Re-enable secure cookies before an HTTPS deployment.

6. Confirm Overview reports the container and RCON separately. If either is unavailable, verify the exact container name, shared network, RCON password, and mounted data source. BlockOps fails closed for consistency-sensitive operations.

### Reverse proxy notes

- Preserve the original `Host` header and WebSocket upgrades.
- Set `BLOCKOPS_PUBLIC_ORIGIN` to the exact external `https://` origin without a trailing slash.
- Add only the direct proxy CIDR(s) to `BLOCKOPS_TRUSTED_PROXIES`. Otherwise forwarded client-address headers are ignored.
- Keep the dashboard bound to loopback when the proxy runs on the host. For a containerized proxy, attach it to an explicit private network instead of exposing BlockOps publicly.
- Match proxy body-size and time-out limits to `BLOCKOPS_MAX_UPLOAD_BYTES` if world uploads are enabled.
- Set `BLOCKOPS_MAX_AUDIT_EXPORT_ROWS` between 1 and 100000 to cap each administrator CSV export. The default is 10000.

## Local development

Go 1.25.13+ and Bun 1.4.0+ are required.

```sh
mkdir -p runtime/minecraft runtime/backups
cp .env.example .env
make dev-api
```

In another terminal:

```sh
make dev-web
```

The frontend development server proxies `/api` and WebSockets to `127.0.0.1:8080`. Local development should set `BLOCKOPS_COOKIE_SECURE=false`. Docker and RCON may remain absent; their UI values will be explicitly unavailable.

Run deterministic checks with:

```sh
make test
make build
```

Deployment changes run `make compose-config`, which renders the Compose model and asserts loopback-only ingress, unpublished 2375 and 25575, read-only roots, dropped capabilities, per-service health checks, and the required mounts. CI runs the same assertions for both documented data sources.

With the development servers running, execute the real-browser smoke journey with `make test-e2e`. It is fully mocked and needs no Docker. Set `BLOCKOPS_E2E_CHROME_PATH` when using an already-installed Chromium/Chrome binary; CI installs Chromium and tests the assembled production server.

### Disposable real-server fixture

`make integration-up` starts the production dashboard and guard from `compose.yaml`, layered with `compose.integration.yaml`, against a real Paper server on the separate Compose project `blockops-integration`. It waits on all three health checks, so Minecraft's own readiness probe gates the command, and it prints the container logs if any service fails to become healthy.

`scripts/integration.sh` generates the RCON password and encryption key into `runtime/integration.env` when that file is absent, and deletes it on `down`. `runtime/` is gitignored, and the script redacts both values out of the failure logs it prints. It passes that file with `--env-file`, so your own `.env` cannot leak into the fixture.

`make integration-down` removes the project and its volumes, and touches nothing else. The Minecraft data volume, the RCON network, and the container name are all project-scoped, the dashboard publishes `127.0.0.1:8099`, and the game port publishes `127.0.0.1:25566`. Both ports are offset from the production defaults so the fixture cannot collide with a real server on the same host. Set `BLOCKOPS_PORT` or `BLOCKOPS_GAME_PORT` before `up` if either is taken.

The fixture is not hermetic. `itzg/minecraft-server` is pinned to a multi-architecture index digest and the Minecraft version is pinned, but a first boot resolves the Paper build from `api.papermc.io`, so Minecraft gets a plain egress network beside the internal RCON one. Nothing is published on it.

### Safe integration journey

With the fixture up, `make test-integration` drives the real dashboard in a browser: live server state, container image digest, resolved software and version, CPU, memory, disk, the player catalog, a connected console stream, the fixed safe command `list` with its audit event, and a consistent backup that is downloaded and verified to be a real gzip archive. It then asserts the console shows the full save-off, flush, save-on cycle, so a backup that strands the world in `save-off` fails the run.

The browser lanes never mix. `BLOCKOPS_E2E_INTEGRATION=true` selects the integration Playwright project and nothing else; without it only the mocked journey runs. The integration spec removes `page.route` and `page.routeWebSocket` from the page, so a handler added by mistake throws instead of quietly replacing real behavior with a fixture.

### Destructive integration journey

With a fresh fixture up, `make test-destructive` restarts, stops, and starts the configured container. It replaces the world with a generated safe ZIP, backs up a marker, changes it, restores the backup, and verifies the marker returned. It also submits a traversal ZIP and verifies the live world stayed unchanged.

The destructive lane requires `BLOCKOPS_E2E_DESTRUCTIVE=true`, `BLOCKOPS_E2E_INTEGRATION=true`, and the exact Compose project identity `blockops-integration`. The browser also verifies the configured container is `blockops-integration-minecraft` before changing state. Routine and pull-request commands never select this lane.

A focused backend regression test forces Docker to reject the replacement start and verifies BlockOps restores the prior world before its recovery start. The browser lane does not add a production fault-injection switch for that case.

## API and repository map

- [OpenAPI 3.1 specification](backend/internal/httpapi/openapi.yaml) — also served at `/api/openapi.yaml`.
- [`backend/`](backend) — Go API, persistence, integrations, archival operations, and embedded UI.
- [`frontend/`](frontend) — browser client.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — trust boundaries and runtime flow.
- [`docs/SECURITY.md`](docs/SECURITY.md) — controls, residual risks, and deployment checklist.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phase plan, open decisions, and rejected features.
- [`packages/ui`](packages/ui) — shared interface components.
- [`AGENTS.md`](AGENTS.md) — verification commands and the rules a change must not break.

The temporary name is centralized in [`frontend/src/config.ts`](frontend/src/config.ts) and [`backend/internal/config/config.go`](backend/internal/config/config.go), with Compose/image labels in the root deployment files.

## Dependencies

Runtime dependencies are intentionally narrow:

- `modernc.org/sqlite` provides an embedded, CGO-free state store suitable for the single-container model.
- `golang.org/x/crypto` provides Argon2id.
- `github.com/coder/websocket` provides a reviewed WebSocket implementation rather than custom framing.

## License

MIT. Minecraft is a trademark of Microsoft/Mojang. BlockOps is independent software and ships no Minecraft artwork, server binaries, or game assets.
