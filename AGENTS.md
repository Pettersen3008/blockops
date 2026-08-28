# AGENTS.md

BlockOps is a Go control plane with an embedded React dashboard for one Dockerized
Minecraft server. Read this before any change. Frontend rules live in
[`frontend/AGENTS.md`](frontend/AGENTS.md).

## Verify before you claim done

| Lane | Command | Required for |
| --- | --- | --- |
| Backend | `cd backend && go test -race ./... && go vet ./...` | Any Go or API change |
| Frontend | `bun run --cwd frontend verify` | Any frontend change |
| Browser | Production Go binary plus the relevant Playwright spec | User-visible workflows |
| Compose | `docker compose config --quiet` | Deployment changes |
| Repository | `git diff --check` | Everything |

`make test` and `make build` cover the first two lanes. Remote CI, real-server
behavior, and destructive flows must be reported separately. Passing unit tests
do not stand in for them.

## The boundary that must not break

The browser cannot address RCON, the Docker Engine, SQLite, or world files
directly. Every phase of this product keeps it that way.

- Minecraft input travels the RCON path only. No host shell, no `os/exec`, no
  Docker exec, no arbitrary container name, no outbound URL fetch, no general
  file browsing.
- Everything crossing a trust boundary is untrusted until parsed: request bodies,
  RCON output, archive entries, upstream responses. Parse at the boundary.
- Paths derive from validated configuration, never from request data. Archive
  extraction rejects absolute and traversal paths, links, devices, and unsupported
  file types.
- Only the Docker guard mounts the socket, and only for the configured container.
- Server authorization is the enforcement point. UI visibility is a mirror of it.
- Secrets never reach the browser, structured logs, or audit details.

Full model in [`docs/SECURITY.md`](docs/SECURITY.md), runtime ownership and
consistency protocols in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Update
both, plus `backend/internal/httpapi/openapi.yaml`, when behavior or boundaries
change.

## Add one smallest runnable check

Every branch, parser, migration, destructive path, and security decision gets one.
Not one test per branch of everything else.

## Report

Every non-trivial change reports what changed, why it is the simplest design that
works, new files and their one job, state and cache behavior changes, tests added,
commands run, **what was not verified**, and what old code was deleted. Never write
"production ready" without evidence.
