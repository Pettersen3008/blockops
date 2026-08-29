package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

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
