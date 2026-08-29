package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// ErrSchemaTooNew means a newer BlockOps wrote this database. Downgrading would
// run old code against unknown columns, so startup stops instead.
var ErrSchemaTooNew = errors.New("database schema is newer than this build")

// Migrations run once each, in version order, one transaction per version. A
// failure rolls back and leaves the prior schema usable. A migration that has to
// read configuration to fill new columns supplies adopt as well as statements.
type migration struct {
	version    int
	statements string
	adopt      func(context.Context, *sql.Tx, Adoption) error
}

// Adoption describes the single configured server the environment already runs.
// Migration 2 writes it into the fleet tables, and every later open checks the
// stored row still matches it.
type Adoption struct {
	DockerBaseURL string
	ContainerName string
	DataDir       string
	BackupDir     string
	WorldName     string
	RCONAddress   string
}

// The adopted node and server keep fixed names so a second open can find the row
// migration 2 wrote. A slug is permanent: a deleted server keeps its row so audit
// history and backup filenames stay resolvable and the name cannot be reclaimed.
const (
	adoptedNodeName   = "local"
	adoptedServerSlug = "default"
)

// Version 1 is the schema the pre-versioning builds applied on every open. It
// keeps IF NOT EXISTS so an existing installation adopts version 1 without
// changing a table, and a fresh database lands on the identical shape.
const schemaVersion1 = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrator','operator','viewer')),
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash BLOB PRIMARY KEY,
  csrf_token TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  user_id TEXT,
  username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  source_ip TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','failure','denied')),
  details_json TEXT NOT NULL DEFAULT '{}'
);
UPDATE audit_events
SET occurred_at = substr(occurred_at, 1, 19) || '.000000000Z'
WHERE length(occurred_at) = 20 AND substr(occurred_at, 20, 1) = 'Z';
DROP INDEX IF EXISTS idx_audit_occurred;
CREATE INDEX IF NOT EXISTS idx_audit_order ON audit_events(occurred_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`

// Version 2 adds the fleet tables from decision D2-01. The rebuilds of users and
// backups live in adoptConfiguredServer, because both need the adopted server ID.
const schemaVersion2 = `
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
CREATE INDEX idx_server_grants_server ON server_grants(server_id);`

// Version 3 adds the D2-05 identity columns and makes the table append-only. No
// column references servers, nodes, or users: deleting a server must not delete
// or block its history. Rows written before this migration keep a null
// server_id, because attributing them to the adopted server would be a
// fabrication, and the interface reads them as fleet history.
const schemaVersion3 = `
ALTER TABLE audit_events ADD COLUMN principal_kind TEXT NOT NULL DEFAULT 'user';
ALTER TABLE audit_events ADD COLUMN principal_id TEXT;
ALTER TABLE audit_events ADD COLUMN server_id TEXT;
ALTER TABLE audit_events ADD COLUMN node_id TEXT;
ALTER TABLE audit_events ADD COLUMN request_id TEXT;
ALTER TABLE audit_events ADD COLUMN job_id TEXT;
ALTER TABLE audit_events ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;
CREATE INDEX idx_audit_server ON audit_events(server_id, occurred_at DESC, id DESC);
CREATE TRIGGER audit_events_immutable_update BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;
CREATE TRIGGER audit_events_immutable_delete BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;`

var migrations = []migration{
	{version: 1, statements: schemaVersion1},
	{version: 2, statements: schemaVersion2, adopt: adoptConfiguredServer},
	{version: 3, statements: schemaVersion3},
}

// adoptConfiguredServer turns the environment's single server into stored server
// one, in the order D2-01 fixes, without touching its Docker target, credentials,
// backups, or audit history.
func adoptConfiguredServer(ctx context.Context, tx *sql.Tx, adopt Adoption) error {
	nodeID, err := NewID()
	if err != nil {
		return err
	}
	serverID, err := NewID()
	if err != nil {
		return err
	}
	now := formatTime(time.Now().UTC())
	steps := []struct {
		query string
		args  []any
	}{
		// Local Docker access keeps the guard boundary it has today and never enrolls,
		// so the node carries no certificate.
		{`INSERT INTO nodes(id,name,state,docker_base_url,created_at) VALUES(?,?,'active',?,?)`,
			[]any{nodeID, adoptedNodeName, adopt.DockerBaseURL, now}},
		{`INSERT INTO servers(id,slug,name,node_id,state,container_name,data_dir,backup_dir,world_name,rcon_address,created_at)
		  VALUES(?,?,?,?,'active',?,?,?,?,?,?)`,
			[]any{serverID, adoptedServerSlug, adopt.ContainerName, nodeID, adopt.ContainerName, adopt.DataDir, adopt.BackupDir, adopt.WorldName, adopt.RCONAddress, now}},
		// The ciphertext moves byte for byte, so no encryption key is needed here and
		// the operator re-enters nothing. The secret keeps the settings key it was
		// encrypted under, because that string is also the cipher's associated data.
		{`INSERT INTO server_secrets(server_id,name,ciphertext,updated_at)
		  SELECT ?,key,value,updated_at FROM app_settings WHERE key=?`,
			[]any{serverID, RCONSecretName}},
		{`DELETE FROM app_settings WHERE key=?`, []any{RCONSecretName}},
		// Grants are read off the old users table before the rebuild drops role.
		{`INSERT INTO server_grants(user_id,server_id,role,granted_by,granted_at)
		  SELECT id,?,role,'migration',? FROM users`, []any{serverID, now}},
		{`CREATE TABLE users_new (
		  id TEXT PRIMARY KEY,
		  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
		  password_hash TEXT NOT NULL,
		  fleet_owner INTEGER NOT NULL DEFAULT 0,
		  disabled INTEGER NOT NULL DEFAULT 0,
		  created_at TEXT NOT NULL
		)`, nil},
		{`INSERT INTO users_new(id,username,password_hash,fleet_owner,disabled,created_at)
		  SELECT id,username,password_hash,role='administrator',disabled,created_at FROM users`, nil},
		{`DROP TABLE users`, nil},
		{`ALTER TABLE users_new RENAME TO users`, nil},
		{`CREATE TABLE backups_new (
		  id TEXT PRIMARY KEY,
		  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
		  filename TEXT NOT NULL,
		  size_bytes INTEGER NOT NULL,
		  created_at TEXT NOT NULL,
		  created_by TEXT NOT NULL,
		  status TEXT NOT NULL,
		  UNIQUE (server_id, filename)
		)`, nil},
		{`INSERT INTO backups_new(id,server_id,filename,size_bytes,created_at,created_by,status)
		  SELECT id,?,filename,size_bytes,created_at,created_by,status FROM backups`, []any{serverID}},
		{`DROP TABLE backups`, nil},
		{`ALTER TABLE backups_new RENAME TO backups`, nil},
	}
	for _, step := range steps {
		if _, err := tx.ExecContext(ctx, step.query, step.args...); err != nil {
			return fmt.Errorf("adopt configured server: %w", err)
		}
	}
	return nil
}

func (s *Store) migrate(ctx context.Context, adopt Adoption) error {
	if _, err := s.db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
)`); err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}
	var applied int
	if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(version),0) FROM schema_migrations`).Scan(&applied); err != nil {
		return fmt.Errorf("read schema version: %w", err)
	}
	latest := migrations[len(migrations)-1].version
	if applied > latest {
		return fmt.Errorf("%w: database is at version %d, this build understands version %d", ErrSchemaTooNew, applied, latest)
	}
	if applied == latest {
		return nil
	}
	// SQLite's table rebuild needs both pragmas off. With foreign keys on, DROP
	// TABLE users would cascade every session away; with the modern ALTER TABLE,
	// renaming the replacement back over the dropped name rewrites references that
	// already point where we want them.
	if err := s.setPragmas(ctx, "OFF", "ON"); err != nil {
		return err
	}
	for _, pending := range migrations {
		if pending.version <= applied {
			continue
		}
		if err := s.applyMigration(ctx, pending, adopt); err != nil {
			return err
		}
	}
	if err := s.setPragmas(ctx, "ON", "OFF"); err != nil {
		return err
	}
	var orphan int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_foreign_key_check`).Scan(&orphan); err != nil {
		return fmt.Errorf("check foreign keys after migration: %w", err)
	}
	if orphan != 0 {
		return fmt.Errorf("migration left %d rows with a dangling reference", orphan)
	}
	return nil
}

func (s *Store) setPragmas(ctx context.Context, foreignKeys, legacyAlterTable string) error {
	for _, pragma := range []string{"PRAGMA foreign_keys = " + foreignKeys, "PRAGMA legacy_alter_table = " + legacyAlterTable} {
		if _, err := s.db.ExecContext(ctx, pragma); err != nil {
			return fmt.Errorf("set %s: %w", pragma, err)
		}
	}
	return nil
}

func (s *Store) applyMigration(ctx context.Context, pending migration, adopt Adoption) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration %d: %w", pending.version, err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, pending.statements); err != nil {
		return fmt.Errorf("apply migration %d: %w", pending.version, err)
	}
	if pending.adopt != nil {
		if err := pending.adopt(ctx, tx, adopt); err != nil {
			return fmt.Errorf("apply migration %d: %w", pending.version, err)
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)`, pending.version, formatTime(time.Now().UTC())); err != nil {
		return fmt.Errorf("record migration %d: %w", pending.version, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration %d: %w", pending.version, err)
	}
	return nil
}

// loadAdoptedServer reads the server migration 2 wrote and refuses to start when
// the environment has been repointed underneath it. Variables stay authoritative
// for the adopted server until Phase 3 makes stored rows the source of truth, so
// a difference is an operator mistake rather than an update to apply.
func (s *Store) loadAdoptedServer(ctx context.Context, adopt Adoption) (string, error) {
	var id string
	stored := Adoption{}
	err := s.db.QueryRowContext(ctx, `SELECT s.id,n.docker_base_url,s.container_name,s.data_dir,s.backup_dir,s.world_name,s.rcon_address
	  FROM servers s JOIN nodes n ON n.id = s.node_id WHERE s.slug = ?`, adoptedServerSlug).
		Scan(&id, &stored.DockerBaseURL, &stored.ContainerName, &stored.DataDir, &stored.BackupDir, &stored.WorldName, &stored.RCONAddress)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errors.New("adopted server row is missing")
	}
	if err != nil {
		return "", fmt.Errorf("load adopted server: %w", err)
	}
	mismatches := []struct {
		variable string
		stored   string
		want     string
	}{
		{"BLOCKOPS_DOCKER_URL", stored.DockerBaseURL, adopt.DockerBaseURL},
		{"BLOCKOPS_MINECRAFT_CONTAINER", stored.ContainerName, adopt.ContainerName},
		{"BLOCKOPS_MINECRAFT_DATA_DIR", stored.DataDir, adopt.DataDir},
		{"BLOCKOPS_BACKUP_DIR", stored.BackupDir, adopt.BackupDir},
		{"BLOCKOPS_WORLD_NAME", stored.WorldName, adopt.WorldName},
		{"BLOCKOPS_RCON_ADDRESS", stored.RCONAddress, adopt.RCONAddress},
	}
	for _, field := range mismatches {
		if field.stored != field.want {
			return "", fmt.Errorf("%s is %q but the adopted server stores %q: restore the variable or migrate the server deliberately", field.variable, field.want, field.stored)
		}
	}
	return id, nil
}

// SchemaVersion reports the highest applied migration.
func (s *Store) SchemaVersion(ctx context.Context) (int, error) {
	var version int
	if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(version),0) FROM schema_migrations`).Scan(&version); err != nil {
		return 0, fmt.Errorf("read schema version: %w", err)
	}
	return version, nil
}
