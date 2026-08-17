# BlockOps delivery brief

## Readiness verdict

- **Ready.** The product brief defines the target operator, trust boundaries, deployment shape, roles, MVP scope, and explicit exclusions. Integration behavior that depends on the host is represented as unavailable instead of fabricated.

## Problem statement

Self-hosted Minecraft administrators need a focused control plane for routine operations without giving dashboard users host shell or unrestricted Docker access. Existing generic panels often expose too much host capability or mix monitoring and destructive actions without clear authorization.

## Use case

- **Actor:** An administrator, operator, or viewer of one Paper/Spigot-compatible Java server.
- **Goal:** Observe server health and carry out only the Minecraft and lifecycle operations permitted by the actor's role.
- **Desired outcome:** Routine administration is safe, auditable, mobile-friendly, and deployable beside an existing Dockerized server.

## Intended behavior

- A first-run flow creates the only initial administrator without shipping credentials.
- Authenticated users see live state and explicit unavailable states for integrations that cannot be reached.
- Operators use RCON-backed Minecraft commands and constrained container lifecycle actions; no input is ever passed to a host shell.
- Administrators manage dashboard users, integration secrets, world replacement, and backup restore.
- Every privileged attempt records actor, source address, target, time, outcome, and redacted detail.
- World and backup operations remain inside configured volume roots and reject traversal, links, oversized input, and malformed archives.

## Scope

### In scope

- One Java server, Docker Compose, RCON, a shared Minecraft data mount, SQLite state, one local backup mount, and three dashboard roles.
- Overview, live console, player controls, world download/replacement, local backups, audit log, users, and integration settings.

### Out of scope

- New-world creation, multiple servers or nodes, marketplaces, a general file manager, automatic upgrades, Bedrock Dedicated Server, LuckPerms, remote backup providers, billing, and browser shell access.

## Acceptance criteria

1. **First run and authentication**
   - Trigger: A fresh installation is opened and an administrator submits a valid username and strong password.
   - Expected: One administrator is created, the setup route closes, Argon2id stores the password, and a secure session starts without exposing its token to JavaScript.
   - Verification: API tests cover one-time setup, password policy, login throttling, cookie flags, expiry, logout, and revocation.
2. **Authorization and CSRF**
   - Trigger: A viewer, operator, or administrator attempts a protected mutation.
   - Expected: The backend applies the documented role policy and rejects missing or invalid CSRF tokens.
   - Verification: Table-driven API tests exercise allowed and denied role/action pairs and CSRF failures.
3. **Monitoring**
   - Trigger: An authenticated user opens Overview.
   - Expected: Docker, RCON, player, disk, warning, uptime, and backup data are shown when available; failures are labeled unavailable and no data is invented.
   - Verification: Service tests plus browser checks with integrations unavailable and available.
4. **Minecraft console**
   - Trigger: An operator submits a command or a user watches the console.
   - Expected: Commands go only through RCON, console lines arrive over a reconnecting WebSocket from a bounded sanitized log buffer, and submissions are audited with sensitive values redacted.
   - Verification: RCON protocol tests, buffer tests, API tests, and browser reconnect/command scenarios.
5. **Player administration**
   - Trigger: An operator adds/removes an allowlist entry, kicks, bans, pardons, ops, or de-ops a named player.
   - Expected: A validated, fixed command shape is sent through RCON, disruptive actions require UI confirmation, and outcomes are audited.
   - Verification: Command construction and authorization tests plus browser confirmation checks.
6. **Backups**
   - Trigger: An operator creates/deletes a backup or an administrator restores one.
   - Expected: Creation uses `save-off`, `save-all flush`, and `save-on`; archives are bounded to configured world roots; restore stops and restarts the configured container; failures leave a useful audit record.
   - Verification: Archive/restore unit tests use temporary directories; integration-dependent portions report unavailable when absent.
7. **World operations**
   - Trigger: An administrator downloads the world or uploads a replacement ZIP.
   - Expected: Downloads are consistent archives; uploads reject unsafe paths and links, require a recognizable world, stop the server, preserve a rollback copy until success, and restart the configured container.
   - Verification: Malicious archive tests, successful replacement test, and role/API tests.
8. **Container lifecycle**
   - Trigger: An operator restarts, or an administrator starts/stops/restarts, the configured Minecraft container.
   - Expected: Only the configured container is addressed through the private Docker API proxy; arbitrary container names or host commands are impossible.
   - Verification: Client URL/operation tests and authorization tests.
9. **Dashboard quality**
   - Trigger: A user navigates with mouse, keyboard, or a mobile viewport in either theme.
   - Expected: Seven requested sections, semantic controls, focus visibility, meaningful loading/empty/error states, and clear destructive confirmations are present.
   - Verification: Type/build checks and browser QA on desktop and mobile.
10. **Deployment and delivery**
    - Trigger: CI or an operator builds the project.
    - Expected: Tests and production builds pass; the final multi-stage image runs as non-root; RCON and the Docker proxy are not published; operational and security guidance is documented.
    - Verification: Go tests/race test, frontend test/type/build, Docker Compose config, image inspection when Docker is available, and workflow review.

## Assumptions

- The Minecraft container persists Paper-style world directories under one mounted data root.
- `latest.log` is available below that data root for console streaming.
- The host operator supplies RCON and encryption secrets outside source control.
- TLS is terminated by a trusted reverse proxy or private-network ingress in production.

## Open questions

- None block the MVP. Operators can override the container name, world name, upload limit, trusted proxies, and public origin through documented environment variables.

## Risks and dependencies

- The Docker API is intrinsically privileged. A separate socket proxy reduces exposed endpoints, remains private, and the dashboard additionally fixes the container target.
- RCON is plaintext on its transport. It must stay on the private Compose network and use a strong secret.
- Very large worlds require matching proxy upload/time-out settings and enough free space for staging plus rollback.
- Consistency commands require a healthy RCON connection; the application fails closed instead of creating a potentially inconsistent archive.
