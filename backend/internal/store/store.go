package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var (
	ErrNotFound      = errors.New("not found")
	ErrAlreadyExists = errors.New("already exists")
)

type Store struct {
	db *sql.DB
	// ponytail: the adopted server every query is scoped to. P2-02 puts the server
	// ID on the request and this field goes away.
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
	IDHash    []byte
	CSRFToken string
	User      User
	CreatedAt time.Time
	ExpiresAt time.Time
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
}

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

func (s *Store) NeedsSetup(ctx context.Context) (bool, error) {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return false, fmt.Errorf("count users: %w", err)
	}
	return count == 0, nil
}

func (s *Store) CreateInitialUser(ctx context.Context, user User) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin initial user transaction: %w", err)
	}
	defer tx.Rollback()
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return fmt.Errorf("count initial users: %w", err)
	}
	if count != 0 {
		return ErrAlreadyExists
	}
	if err := s.insertUser(ctx, tx, user, user.ID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit initial user: %w", err)
	}
	return nil
}

func (s *Store) CreateUser(ctx context.Context, user User, grantedBy string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin user transaction: %w", err)
	}
	defer tx.Rollback()
	if err := s.insertUser(ctx, tx, user, grantedBy); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit user: %w", err)
	}
	return nil
}

// insertUser writes the account and the grant that carries its role together, so
// an account can never exist with no access to the server it was created for.
func (s *Store) insertUser(ctx context.Context, tx *sql.Tx, user User, grantedBy string) error {
	created := formatTime(user.CreatedAt)
	if _, err := tx.ExecContext(ctx, `INSERT INTO users(id,username,password_hash,fleet_owner,created_at) VALUES(?,?,?,?,?)`,
		user.ID, user.Username, user.PasswordHash, user.FleetOwner, created); err != nil {
		return classifyConflict("insert user", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO server_grants(user_id,server_id,role,granted_by,granted_at) VALUES(?,?,?,?,?)`,
		user.ID, s.serverID, user.Role, grantedBy, created); err != nil {
		return classifyConflict("insert user grant", err)
	}
	return nil
}

// userColumns reads the role off the grant on the adopted server, so the one
// place a role is stored is the grant table.
const userColumns = `SELECT u.id,u.username,u.password_hash,COALESCE(g.role,''),u.fleet_owner,u.disabled,u.created_at
  FROM users u LEFT JOIN server_grants g ON g.user_id = u.id AND g.server_id = ?`

func (s *Store) UserByUsername(ctx context.Context, username string) (User, error) {
	return scanUser(s.db.QueryRowContext(ctx, userColumns+` WHERE u.username = ?`, s.serverID, username))
}

func (s *Store) UserByID(ctx context.Context, id string) (User, error) {
	return scanUser(s.db.QueryRowContext(ctx, userColumns+` WHERE u.id = ?`, s.serverID, id))
}

type rowScanner interface{ Scan(...any) error }

func scanUser(row rowScanner) (User, error) {
	var user User
	var disabled, fleetOwner int
	var created string
	if err := row.Scan(&user.ID, &user.Username, &user.PasswordHash, &user.Role, &fleetOwner, &disabled, &created); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrNotFound
		}
		return User{}, fmt.Errorf("scan user: %w", err)
	}
	user.FleetOwner = fleetOwner != 0
	user.Disabled = disabled != 0
	user.CreatedAt = parseTime(created)
	return user, nil
}

func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx, userColumns+` ORDER BY u.username COLLATE NOCASE`, s.serverID)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()
	users := make([]User, 0)
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, rows.Err()
}

// ActiveFleetOwnerCount guards the last account that can administer the
// installation. Disabling it would leave nobody able to restore access.
func (s *Store) ActiveFleetOwnerCount(ctx context.Context) (int, error) {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE fleet_owner=1 AND disabled=0`).Scan(&count); err != nil {
		return 0, fmt.Errorf("count fleet owners: %w", err)
	}
	return count, nil
}

func (s *Store) DisableUser(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE users SET disabled = 1 WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("disable user: %w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return ErrNotFound
	}
	return s.RevokeUserSessions(ctx, id)
}

func (s *Store) CreateSession(ctx context.Context, session Session, userID string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessions(id_hash,csrf_token,user_id,created_at,expires_at) VALUES(?,?,?,?,?)`, session.IDHash, session.CSRFToken, userID, formatTime(session.CreatedAt), formatTime(session.ExpiresAt))
	if err != nil {
		return fmt.Errorf("create session: %w", err)
	}
	return nil
}

func (s *Store) SessionByToken(ctx context.Context, token string, now time.Time) (Session, error) {
	row := s.db.QueryRowContext(ctx, `
SELECT s.id_hash,s.csrf_token,s.created_at,s.expires_at,u.id,u.username,u.password_hash,COALESCE(g.role,''),u.fleet_owner,u.disabled,u.created_at
FROM sessions s JOIN users u ON u.id=s.user_id
LEFT JOIN server_grants g ON g.user_id=u.id AND g.server_id=?
WHERE s.id_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.disabled=0`, s.serverID, TokenHash(token), formatTime(now))
	var session Session
	var sessionCreated, expires, userCreated string
	var disabled, fleetOwner int
	if err := row.Scan(&session.IDHash, &session.CSRFToken, &sessionCreated, &expires, &session.User.ID, &session.User.Username, &session.User.PasswordHash, &session.User.Role, &fleetOwner, &disabled, &userCreated); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Session{}, ErrNotFound
		}
		return Session{}, fmt.Errorf("get session: %w", err)
	}
	session.CreatedAt = parseTime(sessionCreated)
	session.ExpiresAt = parseTime(expires)
	session.User.FleetOwner = fleetOwner != 0
	session.User.Disabled = disabled != 0
	session.User.CreatedAt = parseTime(userCreated)
	return session, nil
}

func (s *Store) RevokeSession(ctx context.Context, token string, now time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET revoked_at=? WHERE id_hash=? AND revoked_at IS NULL`, formatTime(now), TokenHash(token))
	if err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	return nil
}

func (s *Store) RevokeUserSessions(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL`, formatTime(time.Now().UTC()), userID)
	if err != nil {
		return fmt.Errorf("revoke user sessions: %w", err)
	}
	return nil
}

func (s *Store) PurgeExpiredSessions(ctx context.Context, now time.Time) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL`, formatTime(now))
	if err != nil {
		return fmt.Errorf("purge sessions: %w", err)
	}
	return nil
}

func (s *Store) WriteAudit(ctx context.Context, event AuditEvent) error {
	if event.ID == "" {
		var err error
		event.ID, err = NewID()
		if err != nil {
			return err
		}
	}
	if event.OccurredAt.IsZero() {
		event.OccurredAt = time.Now().UTC()
	}
	details, err := json.Marshal(event.Details)
	if err != nil {
		return fmt.Errorf("encode audit details: %w", err)
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO audit_events(id,occurred_at,user_id,username,action,target,source_ip,outcome,details_json) VALUES(?,?,?,?,?,?,?,?,?)`, event.ID, formatAuditTime(event.OccurredAt), nullable(event.UserID), event.Username, event.Action, event.Target, event.SourceIP, event.Outcome, string(details))
	if err != nil {
		return fmt.Errorf("write audit event: %w", err)
	}
	return nil
}

func (s *Store) ListAudit(ctx context.Context, query AuditQuery) (AuditPage, error) {
	conditions := []string{"1=1"}
	arguments := make([]any, 0, 10)
	if query.Filter.Outcome != AuditOutcomeAll {
		conditions = append(conditions, "outcome = ?")
		arguments = append(arguments, query.Filter.Outcome)
	}
	if query.Filter.Search != "" {
		conditions = append(conditions, `(instr(lower(username), lower(?)) > 0
OR instr(lower(action), lower(?)) > 0
OR instr(lower(target), lower(?)) > 0
OR instr(lower(source_ip), lower(?)) > 0
OR instr(lower(COALESCE(NULLIF(details_json, 'null'), '{}')), lower(?)) > 0)`)
		for range 5 {
			arguments = append(arguments, query.Filter.Search)
		}
	}
	if query.Before != nil {
		conditions = append(conditions, "(occurred_at < ? OR (occurred_at = ? AND id < ?))")
		occurred := formatAuditTime(query.Before.OccurredAt)
		arguments = append(arguments, occurred, occurred, query.Before.ID)
	}
	arguments = append(arguments, query.Limit+1)
	statement := `SELECT id,occurred_at,COALESCE(user_id,''),username,action,target,source_ip,outcome,details_json
FROM audit_events WHERE ` + strings.Join(conditions, " AND ") + `
ORDER BY occurred_at DESC, id DESC LIMIT ?`
	rows, err := s.db.QueryContext(ctx, statement, arguments...)
	if err != nil {
		return AuditPage{}, fmt.Errorf("list audit events: %w", err)
	}
	defer rows.Close()
	events := make([]AuditEvent, 0, query.Limit+1)
	for rows.Next() {
		var event AuditEvent
		var occurred, details string
		if err := rows.Scan(&event.ID, &occurred, &event.UserID, &event.Username, &event.Action, &event.Target, &event.SourceIP, &event.Outcome, &details); err != nil {
			return AuditPage{}, fmt.Errorf("scan audit event: %w", err)
		}
		event.OccurredAt = parseTime(occurred)
		_ = json.Unmarshal([]byte(details), &event.Details)
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return AuditPage{}, err
	}
	page := AuditPage{Events: events}
	if len(events) > query.Limit {
		page.Events = events[:query.Limit]
		last := page.Events[len(page.Events)-1]
		page.Next = &AuditCursor{OccurredAt: last.OccurredAt, ID: last.ID}
	}
	return page, nil
}

func (s *Store) CreateBackup(ctx context.Context, backup Backup) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO backups(id,server_id,filename,size_bytes,created_at,created_by,status) VALUES(?,?,?,?,?,?,?)`, backup.ID, s.serverID, backup.Filename, backup.SizeBytes, formatTime(backup.CreatedAt), backup.CreatedBy, backup.Status)
	if err != nil {
		return fmt.Errorf("create backup record: %w", err)
	}
	return nil
}

func (s *Store) BackupByID(ctx context.Context, id string) (Backup, error) {
	var backup Backup
	var created string
	err := s.db.QueryRowContext(ctx, `SELECT id,filename,size_bytes,created_at,created_by,status FROM backups WHERE id=? AND server_id=?`, id, s.serverID).Scan(&backup.ID, &backup.Filename, &backup.SizeBytes, &created, &backup.CreatedBy, &backup.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return Backup{}, ErrNotFound
	}
	if err != nil {
		return Backup{}, fmt.Errorf("get backup: %w", err)
	}
	backup.CreatedAt = parseTime(created)
	return backup, nil
}

func (s *Store) ListBackups(ctx context.Context) ([]Backup, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,filename,size_bytes,created_at,created_by,status FROM backups WHERE server_id=? ORDER BY created_at DESC`, s.serverID)
	if err != nil {
		return nil, fmt.Errorf("list backups: %w", err)
	}
	defer rows.Close()
	backups := make([]Backup, 0)
	for rows.Next() {
		var backup Backup
		var created string
		if err := rows.Scan(&backup.ID, &backup.Filename, &backup.SizeBytes, &created, &backup.CreatedBy, &backup.Status); err != nil {
			return nil, fmt.Errorf("scan backup: %w", err)
		}
		backup.CreatedAt = parseTime(created)
		backups = append(backups, backup)
	}
	return backups, rows.Err()
}

func (s *Store) DeleteBackup(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM backups WHERE id=? AND server_id=?`, id, s.serverID)
	if err != nil {
		return fmt.Errorf("delete backup record: %w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return ErrNotFound
	}
	return nil
}

// ServerSecret and SetServerSecret hold ciphertext for the adopted server. The
// caller owns the key, so the store never sees plaintext.
func (s *Store) ServerSecret(ctx context.Context, name string) (string, error) {
	var ciphertext string
	err := s.db.QueryRowContext(ctx, `SELECT ciphertext FROM server_secrets WHERE server_id=? AND name=?`, s.serverID, name).Scan(&ciphertext)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("read server secret: %w", err)
	}
	return ciphertext, nil
}

func (s *Store) SetServerSecret(ctx context.Context, name, ciphertext string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO server_secrets(server_id,name,ciphertext,updated_at) VALUES(?,?,?,?)
	  ON CONFLICT(server_id,name) DO UPDATE SET ciphertext=excluded.ciphertext, updated_at=excluded.updated_at`,
		s.serverID, name, ciphertext, formatTime(time.Now().UTC()))
	if err != nil {
		return fmt.Errorf("write server secret: %w", err)
	}
	return nil
}

func (s *Store) Setting(ctx context.Context, key string) (string, error) {
	var value string
	if err := s.db.QueryRowContext(ctx, `SELECT value FROM app_settings WHERE key=?`, key).Scan(&value); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("get setting: %w", err)
	}
	return value, nil
}

func (s *Store) SetSetting(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`, key, value, formatTime(time.Now().UTC()))
	if err != nil {
		return fmt.Errorf("set setting: %w", err)
	}
	return nil
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
