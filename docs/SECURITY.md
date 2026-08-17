# Security model and deployment checklist

Security is part of the BlockOps release boundary. This document describes implemented controls and residual deployment risk; it is not a claim that exposing an administration panel directly to the public internet is safe.

## Implemented controls

- One-time transactional administrator creation; no default credential.
- Argon2id password hashes (64 MiB, 3 iterations, parallelism 2) and a 12–256 character policy using at least three character categories.
- 256-bit opaque session tokens from `crypto/rand`, SHA-256 token identifiers in SQLite, fixed expiry, explicit logout, account-wide revocation, disabled-account checks, `HttpOnly`, `SameSite=Lax`, and production-configurable `Secure` cookies.
- Per-session CSRF token on every cookie-authenticated mutation, same-origin checks for setup/login, and strict WebSocket origin validation.
- Per-source-and-username login attempt windows with generic credential failures and equivalent Argon2 work for unknown users.
- Backend roles on every protected route. Administrator-only controls cover users, audit, security settings, world replacement, restore, start/stop, and credential rotation.
- Strict request/body/header/time limits, JSON unknown-field rejection, stable error envelopes, panic recovery, no CORS, CSP without `unsafe-inline`/`unsafe-eval`, clickjacking denial, `nosniff`, referrer, and permissions headers.
- Explicit trusted-proxy CIDRs. Forwarded client addresses are ignored unless the direct peer is trusted.
- Parameterized SQL, random public IDs, bounded audit queries, and structured JSON application logs.
- Sensitive console commands are redacted in audit details; passwords and session tokens are never logged.
- AES-256-GCM encryption with purpose-bound associated data for stored RCON credentials. The encryption key remains external.
- Fixed RCON destination, no outbound URL fetch feature, no dynamic code evaluation, no raw HTML rendering, no auth tokens in Web Storage, and no third-party browser scripts.
- A custom Docker guard is the only socket holder. Its private HTTP routes are fixed to the configured container and required operations. The dashboard has no Docker socket mount.
- Archive containment, link/device rejection, generated server-side filenames, staging outside the web root, size bounds, fixed world roots, and attachment-only downloads.
- Non-root dashboard image, dropped capabilities, read-only root filesystem, private internal networks, reproducible lockfiles, race tests, `govulncheck`, npm audit, and Dependabot in CI.

## Required production settings

- Terminate TLS at a private ingress/reverse proxy and set `BLOCKOPS_COOKIE_SECURE=true`.
- Set `BLOCKOPS_PUBLIC_ORIGIN` to the exact HTTPS origin.
- Keep the dashboard on loopback/private networks. Never publish ports 2375, 25575, or `/var/run/docker.sock`.
- Generate a unique `BLOCKOPS_ENCRYPTION_KEY` and a strong, unique RCON password. Do not reuse dashboard passwords.
- Add only direct proxy CIDRs to `BLOCKOPS_TRUSTED_PROXIES` and preserve the original host.
- Protect `.env`, SQLite, backup, and Minecraft volumes with host permissions and encrypted storage appropriate to your threat model.
- Back up the BlockOps SQLite volume separately if dashboard identity/audit history matters. World backups alone do not contain it.
- Pin released container digests in higher-assurance environments and review Dependabot/security advisories before upgrades.
- Test restore on a non-production copy. Monitor free space for archive staging plus rollback.

## Residual risks

- Docker socket access is root-equivalent. The guard dramatically narrows the network API but a memory-safety or logic flaw in the guard, its Go runtime, or Docker Engine remains high impact. Keep it private, patched, and unavailable to other workloads.
- RCON is plaintext and password-based. It must remain on a private Docker network; network peers can otherwise observe credentials and commands.
- A dashboard compromise can perform every operation available to the compromised role. Use Viewer by default, Operator only for operators, short sessions, unique passwords, and private-network access.
- Local backups share the host. Host loss or compromise can remove both current worlds and backups. Remote providers are intentionally deferred; copy archives out-of-band for disaster recovery.
- MFA/passkeys are not in this MVP. They are preferable but were not added as a partial custom implementation. Network access control is therefore especially important.
- ZIP upload limits apply to compressed input and a separate expansion factor. Very large legitimate worlds may need a carefully reviewed limit increase and matching proxy settings.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, or private server data. Until a dedicated security mailbox exists, open a minimal private GitHub security advisory for the repository owner. Include the affected version, impact, reproduction conditions, and a non-destructive proof. Maintainers should acknowledge, reproduce, patch, and coordinate disclosure before publishing details.

