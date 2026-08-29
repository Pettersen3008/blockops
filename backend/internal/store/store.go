package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var (
	ErrNotFound       = errors.New("not found")
	ErrAlreadyExists  = errors.New("already exists")
	ErrLastFleetOwner = errors.New("cannot remove the final active fleet owner")
)

type Store struct {
	db *sql.DB
	// ponytail: the adopted server every resource query is scoped to. Routes now
	// carry a server ID and ServerAccess resolves it, so the only ID that can pass
	// authorization is this one. Phase 3 creates a second server, and that is when
	// the resource queries take the ID from the caller instead.
	serverID string
}

// RCONSecretName is the server_secrets row holding the encrypted RCON
// credentials. It keeps the app_settings key it was encrypted under, because that
// string is also the cipher's associated data and migration 2 moved the
// ciphertext unchanged.
const RCONSecretName = "integration.rcon.v1"

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	FleetOwner   bool      `json:"fleetOwner"`
	Disabled     bool      `json:"disabled"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Session struct {
	IDHash          []byte
	CSRFToken       string
	User            User
	CreatedAt       time.Time
	AuthenticatedAt time.Time
	ExpiresAt       time.Time
}

type AuditEvent struct {
	ID         string         `json:"id"`
	OccurredAt time.Time      `json:"occurredAt"`
	UserID     string         `json:"userId,omitempty"`
	Username   string         `json:"username,omitempty"`
	Action     string         `json:"action"`
	Target     string         `json:"target"`
	SourceIP   string         `json:"sourceIp"`
	Outcome    string         `json:"outcome"`
	Details    map[string]any `json:"details,omitempty"`

	// D2-05 identity. PrincipalKind and PrincipalID are the identity authority;
	// Username above is display history, so renaming a user never rewrites what
	// the log said at the time. RequestID ties one HTTP request's events
	// together, JobID and Attempt one background operation's retries.
	PrincipalKind PrincipalKind `json:"principalKind"`
	PrincipalID   string        `json:"principalId,omitempty"`
	ServerID      string        `json:"serverId,omitempty"`
	NodeID        string        `json:"nodeId,omitempty"`
	RequestID     string        `json:"requestId,omitempty"`
	JobID         string        `json:"jobId,omitempty"`
	Attempt       int           `json:"attempt,omitempty"`
}

// PrincipalKind names which record PrincipalID points at.
type PrincipalKind string

const (
	PrincipalUser   PrincipalKind = "user"
	PrincipalToken  PrincipalKind = "token"
	PrincipalNode   PrincipalKind = "node"
	PrincipalSystem PrincipalKind = "system"
)

type AuditOutcome string

const (
	AuditOutcomeAll     AuditOutcome = ""
	AuditOutcomeSuccess AuditOutcome = "success"
	AuditOutcomeFailure AuditOutcome = "failure"
	AuditOutcomeDenied  AuditOutcome = "denied"
)

type AuditFilter struct {
	Search  string
	Outcome AuditOutcome
}

type AuditCursor struct {
	OccurredAt time.Time
	ID         string
}

type AuditQuery struct {
	Filter AuditFilter
	Before *AuditCursor
	Limit  int
	// ServerID empty reads the whole fleet. Set, it reads one server and never
	// returns the pre-migration rows, whose server_id is null.
	ServerID string
}

type AuditPage struct {
	Events []AuditEvent
	Next   *AuditCursor
}

type Backup struct {
	ID        string    `json:"id"`
	Filename  string    `json:"-"`
	SizeBytes int64     `json:"sizeBytes"`
	CreatedAt time.Time `json:"createdAt"`
	CreatedBy string    `json:"createdBy"`
	Status    string    `json:"status"`
}

func Open(ctx context.Context, path string, adopt Adoption) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(0)
	store := &Store{db: db}
	if err := store.migrate(ctx, adopt); err != nil {
		db.Close()
		return nil, err
	}
	store.serverID, err = store.loadAdoptedServer(ctx, adopt)
	if err != nil {
		db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error { return s.db.Close() }

// AdoptedServerID is the server every session is scoped to until the fleet
// interface lands. The dashboard reads it to address the scoped routes.
func (s *Store) AdoptedServerID() string { return s.serverID }

func NewID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate identifier: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}

func TokenHash(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

func classifyConflict(operation string, err error) error {
	if err == nil {
		return nil
	}
	if strings.Contains(strings.ToLower(err.Error()), "unique constraint") {
		return ErrAlreadyExists
	}
	return fmt.Errorf("%s: %w", operation, err)
}

func formatTime(value time.Time) string { return value.UTC().Format(time.RFC3339Nano) }

func formatAuditTime(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000000000Z")
}

func parseTime(value string) time.Time {
	parsed, _ := time.Parse(time.RFC3339Nano, value)
	return parsed
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
