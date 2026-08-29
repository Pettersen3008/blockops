package store

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// ErrSchemaTooNew means a newer BlockOps wrote this database. Downgrading would
// run old code against unknown columns, so startup stops instead.
var ErrSchemaTooNew = errors.New("database schema is newer than this build")

// Migrations run once each, in version order, one transaction per version. A
// failure rolls back and leaves the prior schema usable.
type migration struct {
	version    int
	statements string
}

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

var migrations = []migration{{version: 1, statements: schemaVersion1}}

func (s *Store) migrate(ctx context.Context) error {
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
	for _, pending := range migrations {
		if pending.version <= applied {
			continue
		}
		if err := s.applyMigration(ctx, pending); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) applyMigration(ctx context.Context, pending migration) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration %d: %w", pending.version, err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, pending.statements); err != nil {
		return fmt.Errorf("apply migration %d: %w", pending.version, err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)`, pending.version, formatTime(time.Now().UTC())); err != nil {
		return fmt.Errorf("record migration %d: %w", pending.version, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration %d: %w", pending.version, err)
	}
	return nil
}

// SchemaVersion reports the highest applied migration.
func (s *Store) SchemaVersion(ctx context.Context) (int, error) {
	var version int
	if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(version),0) FROM schema_migrations`).Scan(&version); err != nil {
		return 0, fmt.Errorf("read schema version: %w", err)
	}
	return version, nil
}
