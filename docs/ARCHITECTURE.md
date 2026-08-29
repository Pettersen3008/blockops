# Architecture

BlockOps is a single deployable dashboard plus a narrowly scoped Docker guard sidecar. The browser cannot address RCON, the Docker Engine, SQLite, or world files directly.

```mermaid
flowchart LR
  B["Administrator browser"] -->|"HTTPS + session cookie + CSRF"| A["BlockOps dashboard\nGo API + embedded web UI"]
  A -->|"parameterized SQL"| S[("SQLite /data")]
  A -->|"fixed Minecraft commands"| R["RCON on private network"]
  A -->|"tail latest.log / staged archives"| M[("Minecraft data volume")]
  A -->|"local tar.gz"| K[("Backup volume")]
  A -->|"fixed subset HTTP"| G["BlockOps Docker guard"]
  G -->|"inspect/stats/start/stop/restart\nconfigured name only"| D["Docker socket"]
```

## Trust boundaries

1. **Browser to API:** All request data is untrusted. JSON bodies are size-bounded and reject unknown fields. Cookie sessions are opaque and HttpOnly; mutations require a per-session CSRF token. Server authorization is independent from UI visibility.
2. **API to RCON:** The API accepts Minecraft command text but sends it only through the RCON protocol. Player actions construct fixed command shapes after Java username/reason validation. No package imports `os/exec` and no host shell exists.
3. **API to world volume:** Paths derive from a validated configured world name, never request paths. ZIP/tar extraction rejects absolute/traversal paths, links, devices, unsupported file types, multiple worlds, and expanded-size limits. Replacement occurs in a same-filesystem staging directory with rollback.
4. **API to Docker guard:** The dashboard calls a fixed base URL and a configured container name. The guard independently checks that name and implements only the five required Docker operations. Only the guard mounts the socket.
5. **Secrets:** RCON credentials start in the environment. Browser-driven rotation is available only when a 32-byte external encryption key is configured; the resulting AES-256-GCM value is stored in SQLite and never returned to the browser or structured logs.

## Runtime ownership

- The main process owns HTTP server shutdown, hourly expired-session cleanup, and the console-tail goroutine through a signal-cancelled context.
- The console server ring contains 2,000 sanitized lines. Each WebSocket subscriber has a bounded channel; slow subscribers drop lines instead of applying unbounded memory pressure.
- The browser console also caps itself at 2,000 lines and defers search filtering.
- One mutex serializes backup, download, restore, and world-replacement operations to prevent overlapping save modes or directory swaps.
- Docker inspect and stats calls keep a 12-second client limit. Start, stop, and restart use a 45-second client limit because Docker receives a 30-second graceful-stop budget; the guard keeps a bounded 50-second response window around those calls.
- SQLite uses WAL, foreign keys, a busy timeout, and one connection to match the single-instance MVP. Multiple dashboard replicas are not supported.

## Consistency protocols

- If the container is running, backup/download sends `save-off`, then `save-all flush`, creates the archive, and attempts `save-on` with a fresh recovery context even if the request is cancelled.
- If the container is stopped, files are archived directly.
- Restore/replacement validates and extracts before downtime, stops the fixed container, renames current world directories into a rollback directory, installs staged directories, and starts the container. On installation or start failure, it removes the partial replacement, restores prior directories, and attempts a start.

## State model

SQLite stores users, password hashes, sessions, audit events, backup catalog entries, and encrypted integration settings. Minecraft remains authoritative for player lists and vanilla permissions. Docker remains authoritative for lifecycle and resource metrics. BlockOps does not duplicate unavailable integration data with fabricated values.
