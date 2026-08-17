package store

import (
	"context"
	"errors"
	"path/filepath"
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
	events, err := database.ListAudit(ctx, 10)
	if err != nil || len(events) != 1 || events[0].Action != "test.action" {
		t.Fatalf("ListAudit() = %+v, %v", events, err)
	}
}
