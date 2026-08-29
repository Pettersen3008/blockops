package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

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
