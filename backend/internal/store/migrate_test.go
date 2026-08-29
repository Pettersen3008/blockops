package store

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestOpenGivenPreVersioningDatabaseWhenMigratingThenAdoptsTheFleetSchemaWithDataIntact(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "blockops.db")
	writeLegacyDatabase(t, path)

	database, err := Open(ctx, path, testAdoption)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	version, err := database.SchemaVersion(ctx)
	if err != nil || version != 3 {
		t.Fatalf("SchemaVersion() = %d, %v", version, err)
	}
	user, err := database.UserByUsername(ctx, "admin")
	if err != nil || user.Role != "administrator" || !user.FleetOwner {
		t.Fatalf("UserByUsername() = %+v, %v", user, err)
	}
	viewer, err := database.UserByUsername(ctx, "watcher")
	if err != nil || viewer.Role != "viewer" || viewer.FleetOwner {
		t.Fatalf("UserByUsername(watcher) = %+v, %v", viewer, err)
	}
	session, err := database.SessionByToken(ctx, "legacy-token", time.Now().UTC())
	if err != nil || session.User.ID != "user-1" {
		t.Fatalf("SessionByToken() = %+v, %v", session, err)
	}
	page, err := database.ListAudit(ctx, AuditQuery{Limit: 10})
	if err != nil || len(page.Events) != 1 || page.Events[0].Action != "server.restart" {
		t.Fatalf("ListAudit() = %+v, %v", page, err)
	}
	backups, err := database.ListBackups(ctx)
	if err != nil || len(backups) != 1 || backups[0].Filename != "legacy.zip" {
		t.Fatalf("ListBackups() = %+v, %v", backups, err)
	}
	secret, err := database.ServerSecret(ctx, RCONSecretName)
	if err != nil || secret != "encrypted-blob" {
		t.Fatalf("ServerSecret() = %q, %v", secret, err)
	}
	if _, err := database.Setting(ctx, RCONSecretName); !errors.Is(err, ErrNotFound) {
		t.Fatalf("credentials left behind in app_settings: %v", err)
	}

	reopened, err := Open(ctx, path, testAdoption)
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	defer reopened.Close()
	// Counted against the migration list, because the point is that reopening
	// applies nothing new, not that the list is any particular length.
	applied := 0
	if err := reopened.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&applied); err != nil || applied != len(migrations) {
		t.Fatalf("applied migrations = %d, %v", applied, err)
	}
}

func TestOpenGivenAnAdoptedServerWhenAVariableChangesThenRefusesToStart(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "blockops.db")
	database, err := Open(ctx, path, testAdoption)
	if err != nil {
		t.Fatal(err)
	}
	database.Close()

	repointed := testAdoption
	repointed.ContainerName = "someone-elses-server"
	if _, err := Open(ctx, path, repointed); err == nil || !strings.Contains(err.Error(), "BLOCKOPS_MINECRAFT_CONTAINER") {
		t.Fatalf("Open() error = %v", err)
	}
}

func TestOpenGivenSchemaFromANewerBuildWhenOpeningThenRefuses(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "blockops.db")
	database, err := Open(ctx, path, testAdoption)
	if err != nil {
		t.Fatal(err)
	}
	future := migrations[len(migrations)-1].version + 1
	if _, err := database.db.ExecContext(ctx, `INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)`, future, formatTime(time.Now().UTC())); err != nil {
		t.Fatal(err)
	}
	database.Close()

	if _, err := Open(ctx, path, testAdoption); !errors.Is(err, ErrSchemaTooNew) {
		t.Fatalf("Open() error = %v", err)
	}
}

func writeLegacyDatabase(t *testing.T, path string) {
	t.Helper()
	db, err := sql.Open("sqlite", path+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	now := formatTime(time.Now().UTC())
	if _, err := db.Exec(schemaVersion1); err != nil {
		t.Fatal(err)
	}
	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,?,?)`, []any{"user-1", "admin", "hash", "administrator", now}},
		{`INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,?,?)`, []any{"user-2", "watcher", "hash", "viewer", now}},
		{`INSERT INTO sessions(id_hash,csrf_token,user_id,created_at,expires_at) VALUES(?,?,?,?,?)`, []any{TokenHash("legacy-token"), "csrf", "user-1", now, formatTime(time.Now().UTC().Add(time.Hour))}},
		{`INSERT INTO audit_events(id,occurred_at,user_id,username,action,target,source_ip,outcome,details_json) VALUES(?,?,?,?,?,?,?,?,?)`, []any{"audit-1", formatAuditTime(time.Now().UTC()), "user-1", "admin", "server.restart", "minecraft", "127.0.0.1", "success", "{}"}},
		{`INSERT INTO backups(id,filename,size_bytes,created_at,created_by,status) VALUES(?,?,?,?,?,?)`, []any{"backup-1", "legacy.zip", 1024, now, "admin", "complete"}},
		{`INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?)`, []any{RCONSecretName, "encrypted-blob", now}},
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
}

var testAdoption = Adoption{
	DockerBaseURL: "http://docker-proxy:2375",
	ContainerName: "minecraft",
	DataDir:       "/minecraft",
	BackupDir:     "/backups",
	WorldName:     "world",
	RCONAddress:   "minecraft:25575",
}
