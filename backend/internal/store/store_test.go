package store

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

func TestInitialUserSessionAndAuditLifecycle(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "blockops.db"), testAdoption)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	required, err := database.NeedsSetup(ctx)
	if err != nil || !required {
		t.Fatalf("NeedsSetup() = %v, %v", required, err)
	}
	user := User{ID: "user-1", Username: "admin", PasswordHash: "hash", Role: "administrator", CreatedAt: time.Now().UTC()}
	if err := database.CreateInitialUser(ctx, user); err != nil {
		t.Fatal(err)
	}
	if err := database.CreateInitialUser(ctx, user); !errors.Is(err, ErrAlreadyExists) {
		t.Fatalf("second initial user error = %v", err)
	}
	token := "opaque-session-token"
	now := time.Now().UTC()
	if err := database.CreateSession(ctx, Session{IDHash: TokenHash(token), CSRFToken: "csrf", CreatedAt: now, ExpiresAt: now.Add(time.Hour)}, user.ID); err != nil {
		t.Fatal(err)
	}
	session, err := database.SessionByToken(ctx, token, now)
	if err != nil || session.User.Username != "admin" || session.CSRFToken != "csrf" {
		t.Fatalf("SessionByToken() = %+v, %v", session, err)
	}
	if err := database.RevokeSession(ctx, token, now); err != nil {
		t.Fatal(err)
	}
	if _, err := database.SessionByToken(ctx, token, now); !errors.Is(err, ErrNotFound) {
		t.Fatalf("revoked session error = %v", err)
	}
	if err := database.WriteAudit(ctx, AuditEvent{UserID: user.ID, Username: user.Username, Action: "test.action", Target: "server", SourceIP: "127.0.0.1", Outcome: "success", Details: map[string]any{"safe": true}}); err != nil {
		t.Fatal(err)
	}
	page, err := database.ListAudit(ctx, AuditQuery{Limit: 10})
	if err != nil || len(page.Events) != 1 || page.Events[0].Action != "test.action" {
		t.Fatalf("ListAudit() = %+v, %v", page, err)
	}
}

func TestGivenTheOnlyFleetOwnerWhenDisablingOrDemotingThenRefuses(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "blockops.db"), testAdoption)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	owner := User{ID: "owner", Username: "owner", PasswordHash: "hash", Role: "administrator", FleetOwner: true, CreatedAt: time.Now().UTC()}
	if err := database.CreateInitialUser(ctx, owner); err != nil {
		t.Fatal(err)
	}

	if err := database.SetFleetOwner(ctx, owner.ID, false); !errors.Is(err, ErrLastFleetOwner) {
		t.Fatalf("SetFleetOwner() error = %v", err)
	}
	if err := database.DisableUser(ctx, owner.ID); !errors.Is(err, ErrLastFleetOwner) {
		t.Fatalf("DisableUser() error = %v", err)
	}
	stored, err := database.UserByID(ctx, owner.ID)
	if err != nil || !stored.FleetOwner || stored.Disabled {
		t.Fatalf("owner after refused changes = %+v, %v", stored, err)
	}
}

func TestGivenAServerGrantWhenRevokedThenTheNextAccessReadLosesIt(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "blockops.db"), testAdoption)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	user := User{ID: "operator", Username: "operator", PasswordHash: "hash", Role: "operator", CreatedAt: time.Now().UTC()}
	if err := database.CreateInitialUser(ctx, user); err != nil {
		t.Fatal(err)
	}
	if _, err := database.db.ExecContext(ctx, `UPDATE servers SET state='failed' WHERE id=?`, database.AdoptedServerID()); err != nil {
		t.Fatal(err)
	}
	servers, err := database.ListServers(ctx, user.ID, false)
	if err != nil || len(servers) != 1 || servers[0].State != "failed" {
		t.Fatalf("assigned failed servers = %+v, %v", servers, err)
	}

	if err := database.RevokeServerGrant(ctx, database.AdoptedServerID(), user.ID); err != nil {
		t.Fatal(err)
	}
	access, err := database.ServerAccess(ctx, database.AdoptedServerID(), user.ID)
	if err != nil || access.Role != "" {
		t.Fatalf("ServerAccess() = %+v, %v", access, err)
	}
	servers, err = database.ListServers(ctx, user.ID, false)
	if err != nil || len(servers) != 0 {
		t.Fatalf("unassigned servers = %+v, %v", servers, err)
	}
	servers, err = database.ListServers(ctx, user.ID, true)
	if err != nil || len(servers) != 1 || servers[0].State != "failed" {
		t.Fatalf("fleet owner servers = %+v, %v", servers, err)
	}
}

func TestGivenASessionWhenReauthenticatedThenOnlyThatSessionGetsTheNewTime(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "blockops.db"), testAdoption)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	user := User{ID: "owner", Username: "owner", PasswordHash: "hash", Role: "administrator", FleetOwner: true, CreatedAt: time.Now().UTC()}
	if err := database.CreateInitialUser(ctx, user); err != nil {
		t.Fatal(err)
	}
	created := time.Now().UTC().Add(-time.Hour)
	for _, token := range []string{"first", "second"} {
		if err := database.CreateSession(ctx, Session{IDHash: TokenHash(token), CSRFToken: token, CreatedAt: created, AuthenticatedAt: created, ExpiresAt: created.Add(2 * time.Hour)}, user.ID); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now().UTC()
	if err := database.ReauthenticateSession(ctx, "first", now); err != nil {
		t.Fatal(err)
	}
	first, err := database.SessionByToken(ctx, "first", now)
	if err != nil {
		t.Fatal(err)
	}
	second, err := database.SessionByToken(ctx, "second", now)
	if err != nil {
		t.Fatal(err)
	}
	if !first.AuthenticatedAt.Equal(now) || !second.AuthenticatedAt.Equal(created) {
		t.Fatalf("authenticated times = first %v, second %v", first.AuthenticatedAt, second.AuthenticatedAt)
	}
}

func TestListAuditGivenTiedTimestampsAndFiltersWhenPagingThenTraversesWithoutDuplicates(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "blockops.db"), testAdoption)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	exactSecond := time.Date(2026, time.August, 29, 12, 0, 0, 0, time.UTC)
	events := []AuditEvent{
		{ID: "00000000000000000000000000000004", OccurredAt: exactSecond.Add(time.Nanosecond), Action: "backup.create", Target: "world", SourceIP: "127.0.0.1", Outcome: "success"},
		{ID: "00000000000000000000000000000003", OccurredAt: exactSecond, Action: "backup.restore", Target: "world", SourceIP: "127.0.0.1", Outcome: "failure"},
		{ID: "00000000000000000000000000000002", OccurredAt: exactSecond, Action: "backup.create", Target: "world", SourceIP: "127.0.0.1", Outcome: "failure", Details: map[string]any{"pattern": "100%_literal"}},
		{ID: "00000000000000000000000000000001", OccurredAt: exactSecond, Action: "server.stop", Target: "minecraft", SourceIP: "127.0.0.1", Outcome: "failure"},
	}
	for _, event := range events {
		if err := database.WriteAudit(ctx, event); err != nil {
			t.Fatal(err)
		}
	}

	filter := AuditFilter{Search: "backup", Outcome: AuditOutcomeFailure}
	first, err := database.ListAudit(ctx, AuditQuery{Filter: filter, Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.WriteAudit(ctx, AuditEvent{ID: "00000000000000000000000000000005", OccurredAt: exactSecond.Add(2 * time.Nanosecond), Action: "backup.delete", Target: "world", SourceIP: "127.0.0.1", Outcome: "failure"}); err != nil {
		t.Fatal(err)
	}
	second, err := database.ListAudit(ctx, AuditQuery{Filter: filter, Before: first.Next, Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if got := []string{first.Events[0].ID, second.Events[0].ID}; !slices.Equal(got, []string{events[1].ID, events[2].ID}) {
		t.Fatalf("paged IDs = %v", got)
	}
	if first.Next == nil || second.Next != nil {
		t.Fatalf("cursors = first %v, second %v", first.Next, second.Next)
	}
	literal, err := database.ListAudit(ctx, AuditQuery{Filter: AuditFilter{Search: "%_"}, Limit: 10})
	if err != nil || len(literal.Events) != 1 || literal.Events[0].ID != events[2].ID {
		t.Fatalf("literal search page = %+v, %v", literal, err)
	}
}

func TestOpenGivenLegacyExactSecondAuditTimeWhenMigratingThenNormalizesOrdering(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "blockops.db")
	legacy, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.ExecContext(ctx, schemaVersion1); err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		id       string
		occurred string
	}{
		{id: "00000000000000000000000000000001", occurred: "2026-08-29T12:00:00Z"},
		{id: "00000000000000000000000000000002", occurred: "2026-08-29T12:00:00.000000001Z"},
	} {
		if _, err := legacy.ExecContext(ctx, `INSERT INTO audit_events(id,occurred_at,action,target,source_ip,outcome) VALUES(?,?,?,?,?,?)`, row.id, row.occurred, "test", "server", "127.0.0.1", "success"); err != nil {
			t.Fatal(err)
		}
	}
	if err := legacy.Close(); err != nil {
		t.Fatal(err)
	}
	database, err := Open(ctx, path, testAdoption)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	page, err := database.ListAudit(ctx, AuditQuery{Limit: 10})
	if err != nil || len(page.Events) != 2 || page.Events[0].ID != "00000000000000000000000000000002" {
		t.Fatalf("migrated page = %+v, %v", page, err)
	}
	var occurred string
	if err := database.db.QueryRowContext(ctx, `SELECT occurred_at FROM audit_events WHERE id=?`, "00000000000000000000000000000001").Scan(&occurred); err != nil || occurred != "2026-08-29T12:00:00.000000000Z" {
		t.Fatalf("migrated timestamp = %q, %v", occurred, err)
	}
}

func TestWriteAuditGivenAWrittenEventWhenUpdatingOrDeletingItThenTheTableRefuses(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "blockops.db"), testAdoption)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.WriteAudit(ctx, AuditEvent{Action: "server.stop", Target: "minecraft", SourceIP: "127.0.0.1", Outcome: "success"}); err != nil {
		t.Fatal(err)
	}

	for _, statement := range []string{`UPDATE audit_events SET outcome='success'`, `DELETE FROM audit_events`} {
		if _, err := database.db.ExecContext(ctx, statement); err == nil {
			t.Fatalf("%s succeeded against an append-only table", statement)
		}
	}
}

func TestListAuditGivenEventsOnTwoServersWhenTraversingOneThenReadsOnlyItsOwnHistory(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "blockops.db"), testAdoption)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	exactSecond := time.Date(2026, time.August, 29, 12, 0, 0, 0, time.UTC)
	// Tied timestamps across servers, plus a pre-migration row whose null server_id
	// reads as fleet history and belongs to neither server.
	events := []AuditEvent{
		{ID: "00000000000000000000000000000004", ServerID: "server-a", OccurredAt: exactSecond, Action: "server.stop", Target: "a", SourceIP: "127.0.0.1", Outcome: "success"},
		{ID: "00000000000000000000000000000003", ServerID: "server-b", OccurredAt: exactSecond, Action: "server.stop", Target: "b", SourceIP: "127.0.0.1", Outcome: "success"},
		{ID: "00000000000000000000000000000002", ServerID: "server-a", OccurredAt: exactSecond, Action: "server.start", Target: "a", SourceIP: "127.0.0.1", Outcome: "success"},
		{ID: "00000000000000000000000000000001", OccurredAt: exactSecond, Action: "auth.login", Target: "session", SourceIP: "127.0.0.1", Outcome: "success"},
	}
	for _, event := range events {
		if err := database.WriteAudit(ctx, event); err != nil {
			t.Fatal(err)
		}
	}

	seen := []string{}
	var cursor *AuditCursor
	for {
		page, err := database.ListAudit(ctx, AuditQuery{ServerID: "server-a", Before: cursor, Limit: 1})
		if err != nil {
			t.Fatal(err)
		}
		for _, event := range page.Events {
			seen = append(seen, event.ID)
		}
		if page.Next == nil {
			break
		}
		cursor = page.Next
	}
	if !slices.Equal(seen, []string{events[0].ID, events[2].ID}) {
		t.Fatalf("server-a traversal = %v", seen)
	}
}
