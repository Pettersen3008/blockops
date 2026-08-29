# Phase 2 decisions

[`ROADMAP.md`](ROADMAP.md) gates Phase 2 tickets on five decisions. This file settles them. It records schemas, the migration and rollback story, the threat model, and the two artifacts that already run in the repository.

Two things this file does not do. It does not add auth screens, provisioning, or a second server; those are tickets written after this document is reviewed. It does not change any running behaviour except the migration mechanism in D2-02, which ships with this document because its proof required implementing it.

## D2-01: resource model

### Authority

A principal holds one global bit and a set of per-server grants.

- **Fleet owner** manages users, nodes, server creation, fleet-wide audit, and installation settings. Today's `administrator` role becomes this bit.
- **Per-server grants** carry `administrator`, `operator`, or `viewer` on one server. The three role names and their permission sets survive, so the frontend mirror keeps its vocabulary.

The fleet owner resolves to an implicit `administrator` grant on every server rather than to a branch that skips the check. One evaluation path exists. This concentrates authority in the owner on purpose: the owner can grant itself the same access in one audited click, so refusing it would add a step without adding a boundary. Separation of duty means dropping the implicit grant and requiring an explicit self-grant, which changes one clause in `Authorize`.

Rejected: keeping `administrator` global and scoping only the lower roles. That leaves two shapes of permission check, and the global bypass is the confused-deputy surface the threat model has to defend. Also rejected: per-server grants with no global tier, because user management, node enrollment, and server creation then need a synthetic fleet resource to hang off.

### Evaluation input

`auth.Authorize(Principal, Request) Decision` in [`backend/internal/auth/scope.go`](../backend/internal/auth/scope.go) takes the whole input: the principal's ID, fleet bit, and grants, and the request's server ID, server lifecycle state, and permission string. It is the negative authorization prototype the roadmap requires. `backend/internal/auth/scope_test.go` runs it against two users and two servers, covering URL substitution, invented server IDs, fleet permissions smuggled through server routes, role limits inside a granted server, misspelled permissions, and mutations against a server being deleted.

Four rules the prototype fixes:

- Permissions are enumerated per role, including `administrator`. A permission string that no table lists denies. Today `auth.Allows` returns true for any string when the role is administrator, and only the Docker client's action allow-list stops an arbitrary value from reaching the daemon.
- Fleet permissions carry no server ID and server permissions require one. Neither crosses.
- `Decision` separates `Allowed` from `Visible`. A principal with no grant cannot learn the server exists, so the handler answers `404`. A principal with a grant whose role is too small gets `403`. Unknown and unassigned server IDs are indistinguishable from outside.
- Reads stay available while a server is suspended or being deleted. Everything else needs `active`.

### Lifecycle and identity

Servers move through `provisioning`, `active`, `suspended`, `deleting`, and `failed`. Nodes move through `pending`, `active`, `suspended`, and `revoked`. IDs are the existing 16-byte hex form from `store.NewID`, opaque and never derived from a name. Each server also carries a slug for URLs a human types, unique and mutable, never used for authorization.

### Route shape

`/api/v1/servers/{serverId}/...` for everything scoped to a server. `/api/v1/fleet/...` for users, nodes, installation settings, and fleet audit. The unprefixed paths are removed in the same change, with no aliases: there are no API tokens yet, so the only consumer is the frontend shipped from the same image, and an alias would mean two paths to one resource while per-server authorization is being introduced.

| Today | Phase 2 |
| --- | --- |
| `GET /api/v1/overview` | `GET /api/v1/servers/{serverId}/overview` |
| `GET /api/v1/console/history`, `/console/ws`, `POST /console/commands` | `.../servers/{serverId}/console/...` |
| `GET /api/v1/players`, `POST /api/v1/players/actions` | `.../servers/{serverId}/players...` |
| `GET` and `POST /api/v1/backups`, `/backups/{id}/...` | `.../servers/{serverId}/backups...` |
| `GET /api/v1/world/download`, `PUT /api/v1/world` | `.../servers/{serverId}/world...` |
| `POST /api/v1/server/actions` | `POST /api/v1/servers/{serverId}/actions` |
| `GET /api/v1/settings`, `PUT /api/v1/settings/rcon` | `.../servers/{serverId}/settings...` |
| `GET /api/v1/audit`, `/audit/export` | `/api/v1/fleet/audit...` and `.../servers/{serverId}/audit...` |
| `GET` and `POST /api/v1/users`, `/users/{id}/...` | `/api/v1/fleet/users...` |

The server action body keeps its `action` field limited to `start`, `stop`, and `restart`. The permission string is derived from a validated enum rather than concatenated from the request body.

### Schema

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending','active','suspended','revoked')),
  docker_base_url TEXT NOT NULL,
  certificate_fingerprint TEXT,
  certificate_serial TEXT,
  enrolled_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE servers (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  node_id TEXT NOT NULL REFERENCES nodes(id),
  state TEXT NOT NULL CHECK (state IN ('provisioning','active','suspended','deleting','failed')),
  container_name TEXT NOT NULL,
  data_dir TEXT NOT NULL,
  backup_dir TEXT NOT NULL,
  world_name TEXT NOT NULL,
  rcon_address TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (node_id, container_name)
);

CREATE TABLE server_secrets (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (server_id, name)
);

CREATE TABLE server_grants (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('administrator','operator','viewer')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, server_id)
);
CREATE INDEX idx_server_grants_server ON server_grants(server_id);
```

`users` gains `fleet_owner INTEGER NOT NULL DEFAULT 0` and loses `role`. Both cascades matter: deleting a user or a server removes its grants in the same transaction, so a revoked assignment cannot outlive its subject.

`backups` gains `server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE` and its `filename UNIQUE` constraint becomes `UNIQUE (server_id, filename)`.

### Adopting the current server

Migration 2 turns the configured single server into stored server one without touching its Docker target, credentials, backups, or audit history.

1. Insert a `nodes` row named `local`, state `active`, `docker_base_url` from `BLOCKOPS_DOCKER_URL`, no certificate. Local Docker access keeps the guard boundary it has today and never enrolls.
2. Insert one `servers` row with a generated ID, slug `default`, `container_name` from `BLOCKOPS_MINECRAFT_CONTAINER`, and `data_dir`, `backup_dir`, `world_name`, `rcon_address` from the same variables that drive the running process. State `active`.
3. Move the encrypted RCON password from `app_settings` into `server_secrets` under that server ID, ciphertext unchanged. The existing `secrets` package and `BLOCKOPS_ENCRYPTION_KEY` keep working, so no re-entry is required.
4. Rebuild `users` without `role` and with `fleet_owner`. SQLite cannot drop a column a `CHECK` constraint mentions, so this is the twelve-step table rebuild: create the new table, copy, drop the old, rename, recreate indexes. It runs inside the migration's transaction, with `foreign_keys` off and `legacy_alter_table` on around it. Deferring foreign keys is not enough: with them enabled, `DROP TABLE users` runs an implicit delete that cascades every session away, and the modern `ALTER TABLE RENAME` rewrites the references in `sessions` that already point where the rebuild wants them. `migrate` restores both pragmas and runs `foreign_key_check` before the store serves anything.
5. Insert one `server_grants` row per existing user, carrying the role that user held, granted by `migration`. Every existing `administrator` also gets `fleet_owner = 1`.
6. Backfill `backups.server_id` with the adopted server.

After migration 2, an operator who never adds a second server sees the same dashboard against the same container, with URLs that carry a server ID.

Environment variables stay the source of truth for the adopted server only until the Phase 3 provisioning ticket makes stored rows authoritative. Until then, a mismatch between a variable and the stored row is a startup error rather than a silent overwrite, so an operator cannot repoint a stored server by editing Compose.

## D2-02: versioned migrations

**Decided and implemented.** [`backend/internal/store/migrate.go`](../backend/internal/store/migrate.go) replaces the idempotent schema that ran on every open.

- A `schema_migrations(version, applied_at)` ledger records what ran.
- `migrations` is an ordered slice of `(version, statements)`. Each pending version runs in its own transaction and records itself in that same transaction, so a failure rolls back and leaves the prior schema usable.
- Startup refuses a database whose highest applied version exceeds the newest version the binary knows, returning `ErrSchemaTooNew`. A downgrade fails loudly instead of running old code against unknown columns.
- Version 1 is the pre-versioning schema verbatim, still written with `IF NOT EXISTS`. An existing installation adopts version 1 without changing a table, and a fresh database lands on the identical shape.

No dependency was added. An ordered list of SQL strings is the whole mechanism, and it stays that way until an ordered list is measurably inadequate.

One behaviour changed. The P1-05 audit timestamp normalization used to run on every open; it now runs once, as part of version 1. `TestOpenGivenPreVersioningDatabaseWhenMigratingThenAdoptsVersionOneWithDataIntact` opens a database built the way a pre-versioning binary built it and asserts users, sessions, audit events, backups, and the encrypted setting survive, that the ledger reaches version 1, and that a second open applies nothing further. `TestOpenGivenSchemaFromANewerBuildWhenOpeningThenRefuses` covers the downgrade guard.

### Rollback

SQLite has no backwards migration and Phase 2 will not write one. The story is:

- A failed migration rolls back to the previous version, which the previous binary still runs.
- A successful migration is one way. An operator who downgrades the binary afterwards hits `ErrSchemaTooNew` and must restore the database file copied before the upgrade.
- Taking that copy is a release step, recorded in [`RELEASE.md`](RELEASE.md). The database is one file and the control plane is the only writer, so a copy taken while stopped is consistent.

## D2-03: principals

Four kinds of principal, each with its own record and authentication path.

```sql
CREATE TABLE oidc_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (issuer, subject)
);

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash BLOB NOT NULL UNIQUE,
  scope_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
```

- **Local users** are the existing `users` table: username, Argon2id hash, and later MFA. A human is one row no matter how they authenticate.
- **OIDC identities** are keyed by `(issuer, subject)`, never by email or username, because both are reassignable at the provider. An identity links to a user; it is not a user.
- **API tokens** store only a SHA-256 hash and always name an owning user. A token's scope narrows its owner's grants and never exceeds them, so revoking a human's grant instantly narrows every token they issued. This is why there is no second grant table. Tokens expire; an expiry is required at creation.
- **Browser sessions** stay the existing `sessions` rows, each linked to exactly one human.
- **Nodes** are not user principals. They authenticate with client certificates, hold no grants, and the evaluator refuses them for user permissions.

`sessions` gains `authenticated_at TEXT NOT NULL`, set at login and at every reauthentication. These actions require an authentication within the last ten minutes, re-prompting for password and MFA otherwise: transferring fleet ownership, changing MFA, regenerating recovery codes, approving a node enrollment, deleting a server, creating an API token, and reading sensitive server files. Reauthentication updates the timestamp on the current session only.

Phase 2 implements local users, sessions, tokens, and the grant model. The `oidc_identities` and MFA tables are designed here but created by the migration that first writes to them, because an empty reserved table is scaffolding.

## D2-04: node enrollment

Phase 6 consumes this. It is settled now because the CA owner determines the principal model and the audit identity above it.

- **The control plane owns the CA.** It generates an ECDSA P-256 root at first start and stores the key encrypted with `BLOCKOPS_ENCRYPTION_KEY`, in the database, so a database backup covers it. Losing that key means re-enrolling every node, which is recoverable and is documented as such. No CA material ever reaches the browser.
- **Enrollment tokens** are 256 bits from `crypto/rand`, stored hashed, bound to one node name, single use, and valid for fifteen minutes. The plaintext is shown once at creation.
- **The node generates its own key** and sends a CSR. The control plane never sees a node private key.
- **Certificate subject** is the node ID as CN and as a URI SAN. Validity is 90 days. A node renews at two thirds of its life, and the old certificate stays valid until it expires, so rotation needs no coordinated restart.
- **Revocation is a database read, not a CRL.** Every node connection checks the node row's state and that the presented certificate serial matches the row. Suspending or revoking a node takes effect on the next connection with no restart and no distribution delay.
- **Clock skew** tolerance is five minutes on `notBefore`. Enrollment refuses if the node's clock differs from the control plane by more than sixty seconds, because token expiry is the only thing standing between a leaked token and an enrolled attacker.
- **Fingerprint verification.** The node prints its CSR fingerprint on its own console. The operator compares it in the dashboard and approves. Approval is a reauthenticated fleet-owner action and is audited with both the fingerprint and the certificate serial.

## D2-05: audit and job identity

Fields are added before fleet work starts producing events, so history written from now on is already attributable.

```sql
ALTER TABLE audit_events ADD COLUMN principal_kind TEXT NOT NULL DEFAULT 'user';
ALTER TABLE audit_events ADD COLUMN principal_id TEXT;
ALTER TABLE audit_events ADD COLUMN server_id TEXT;
ALTER TABLE audit_events ADD COLUMN node_id TEXT;
ALTER TABLE audit_events ADD COLUMN request_id TEXT;
ALTER TABLE audit_events ADD COLUMN job_id TEXT;
ALTER TABLE audit_events ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;
CREATE INDEX idx_audit_server ON audit_events(server_id, occurred_at DESC, id DESC);
```

- `principal_kind` is `user`, `token`, `node`, or `system`. `principal_id` is the ID of that record. Together they are the identity authority.
- `username` keeps its current meaning as display history. A renamed or deleted user does not rewrite what the log said at the time.
- No foreign keys point at `servers`, `nodes`, or `users` from this table. Deleting a server must not delete or block its history.
- `request_id` ties every event from one HTTP request together. `job_id` and `attempt` tie retries of one background operation together, which is what Phase 7 recovery needs to tell a retry from a new failure.
- Rows written before the migration keep `server_id` null. They predate multi-server and attributing them to the adopted server would be a fabrication. The audit interface shows them as fleet-scoped history.
- Immutability is enforced by `BEFORE UPDATE` and `BEFORE DELETE` triggers on `audit_events` that raise. Migrations that must touch the table drop the triggers and recreate them inside their own transaction, which is the only place that is allowed.

Per-server audit reading uses the new index and the existing `(occurred_at DESC, id DESC)` cursor, so P1-05's pagination contract is unchanged.

## Threat model

**Horizontal privilege escalation.** A user changes a server ID in a URL, a request body, or a WebSocket query. `Authorize` resolves the grant for the exact ID in the route and answers `404` with no grant, so neither existence nor state leaks. The prototype test asserts this for URL substitution, invented IDs, and cross-user reads. The route shape carries the server ID in exactly one place, so no handler has to reconcile two sources.

**Confused deputy.** A low-privileged principal persuades the control plane to act with its own authority. Three defences: the fleet owner's authority is an implicit grant inside the one evaluation path rather than a bypass around it; permissions are enumerated per role so an unrecognised permission string denies; and the server action permission comes from a validated enum instead of string concatenation on request input.

**Token amplification.** An API token outliving or exceeding its owner. A token names its owner, its scope intersects the owner's grants at evaluation time, and it carries a required expiry. Disabling the user cascades to the token rows and narrows the intersection to nothing on the next request.

**Enumeration.** Listing servers returns only granted rows. Unknown and unassigned IDs return the same `404`. Slugs are never used for authorization, so guessing a readable slug reveals nothing.

**Revocation lag.** Every grant, session, token, and node check reads the database on the request path. There is no in-process authorization cache, so revocation takes effect on the next request without a restart, which is the Phase 2 exit criterion. Any future cache needs its own decision.

**Node impersonation.** Enrollment tokens are single use, short lived, and hashed at rest. Certificates are checked against the node row's serial on every connection. An attacker holding an old certificate for a revoked node fails the row check even before expiry.

**Downgrade and schema confusion.** A newer database refuses to open under an older binary. A failed migration rolls back whole. Neither leaves a half-applied schema for old code to misread.

**Browser trust.** Frontend permission state stays a usability mirror. Every route and every handler re-evaluates server side, and the prototype is the single implementation both sides describe.

## Exit criteria and where they land

| Roadmap exit criterion | Settled by |
| --- | --- |
| Users cannot enumerate or operate unassigned servers by changing URLs or bodies | D2-01 evaluation input, `Visible` versus `Allowed`, prototype test |
| Revoking a session, token, certificate, or assignment takes effect without a restart | D2-03 cascades and intersection, D2-04 row-checked revocation, no authorization cache |
| Browser permissions stay a usability mirror of backend policy | D2-01 route shape and server-side evaluation on every handler |
| Recovery flows cannot bypass MFA or transfer ownership silently | D2-03 reauthentication window and its audited action list |

## Questions the ticket round settled

- **A slug is never reused.** Deletion keeps the row and its slug, so audit history and backup filenames stay resolvable and a new server cannot inherit a retired name's history. P2-01.
- **Fleet and per-server audit share one export limit.** Both reach the same streaming path, and `BLOCKOPS_MAX_AUDIT_EXPORT_ROWS` protects that path rather than either caller. P2-05.
- **`provisioning` and `failed` servers are visible to their grant holders.** Reads already survive every non-active state, and hiding a server whose creation failed hides the only place to read why. P2-03.
