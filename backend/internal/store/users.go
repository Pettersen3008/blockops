package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

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

func (s *Store) SetFleetOwner(ctx context.Context, id string, fleetOwner bool) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin fleet owner transaction: %w", err)
	}
	defer tx.Rollback()
	var current, disabled bool
	if err := tx.QueryRowContext(ctx, `SELECT fleet_owner,disabled FROM users WHERE id=?`, id).Scan(&current, &disabled); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return fmt.Errorf("read fleet owner: %w", err)
	}
	if fleetOwner && disabled {
		return ErrNotFound
	}
	if current && !fleetOwner && !disabled {
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE fleet_owner=1 AND disabled=0`).Scan(&count); err != nil {
			return fmt.Errorf("count fleet owners: %w", err)
		}
		if count <= 1 {
			return ErrLastFleetOwner
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET fleet_owner=? WHERE id=?`, fleetOwner, id); err != nil {
		return fmt.Errorf("set fleet owner: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit fleet owner: %w", err)
	}
	return nil
}

func (s *Store) DisableUser(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin disable user transaction: %w", err)
	}
	defer tx.Rollback()
	var fleetOwner, disabled bool
	if err := tx.QueryRowContext(ctx, `SELECT fleet_owner,disabled FROM users WHERE id=?`, id).Scan(&fleetOwner, &disabled); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return fmt.Errorf("read user for disable: %w", err)
	}
	if disabled {
		return nil
	}
	if fleetOwner {
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE fleet_owner=1 AND disabled=0`).Scan(&count); err != nil {
			return fmt.Errorf("count fleet owners: %w", err)
		}
		if count <= 1 {
			return ErrLastFleetOwner
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET disabled=1 WHERE id=?`, id); err != nil {
		return fmt.Errorf("disable user: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL`, formatTime(time.Now().UTC()), id); err != nil {
		return fmt.Errorf("revoke disabled user sessions: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit disable user: %w", err)
	}
	return nil
}
