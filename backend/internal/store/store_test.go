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
	database, err := Open(ctx, filepath.Join(t.TempDir(), "blockops.db"))
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

func TestListAuditGivenTiedTimestampsAndFiltersWhenPagingThenTraversesWithoutDuplicates(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "blockops.db"))
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
	database, err := Open(ctx, path)
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
