package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

func (s *Store) CreateSession(ctx context.Context, session Session, userID string) error {
	if session.AuthenticatedAt.IsZero() {
		session.AuthenticatedAt = session.CreatedAt
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessions(id_hash,csrf_token,user_id,created_at,authenticated_at,expires_at) VALUES(?,?,?,?,?,?)`, session.IDHash, session.CSRFToken, userID, formatTime(session.CreatedAt), formatTime(session.AuthenticatedAt), formatTime(session.ExpiresAt))
	if err != nil {
		return fmt.Errorf("create session: %w", err)
	}
	return nil
}

func (s *Store) SessionByToken(ctx context.Context, token string, now time.Time) (Session, error) {
	row := s.db.QueryRowContext(ctx, `
SELECT s.id_hash,s.csrf_token,s.created_at,s.authenticated_at,s.expires_at,u.id,u.username,u.password_hash,COALESCE(g.role,''),u.fleet_owner,u.disabled,u.created_at
FROM sessions s JOIN users u ON u.id=s.user_id
LEFT JOIN server_grants g ON g.user_id=u.id AND g.server_id=?
WHERE s.id_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.disabled=0`, s.serverID, TokenHash(token), formatTime(now))
	var session Session
	var sessionCreated, authenticatedAt, expires, userCreated string
	var disabled, fleetOwner int
	if err := row.Scan(&session.IDHash, &session.CSRFToken, &sessionCreated, &authenticatedAt, &expires, &session.User.ID, &session.User.Username, &session.User.PasswordHash, &session.User.Role, &fleetOwner, &disabled, &userCreated); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Session{}, ErrNotFound
		}
		return Session{}, fmt.Errorf("get session: %w", err)
	}
	session.CreatedAt = parseTime(sessionCreated)
	session.AuthenticatedAt = parseTime(authenticatedAt)
	session.ExpiresAt = parseTime(expires)
	session.User.FleetOwner = fleetOwner != 0
	session.User.Disabled = disabled != 0
	session.User.CreatedAt = parseTime(userCreated)
	return session, nil
}

func (s *Store) ReauthenticateSession(ctx context.Context, token string, now time.Time) error {
	result, err := s.db.ExecContext(ctx, `UPDATE sessions SET authenticated_at=?
	  WHERE id_hash=? AND revoked_at IS NULL AND expires_at>?`, formatTime(now), TokenHash(token), formatTime(now))
	if err != nil {
		return fmt.Errorf("reauthenticate session: %w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return ErrNotFound
	}
	return nil
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
