package operations

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

const maxRestoredBytes int64 = 100 << 30

func (s *Service) CreateBackup(ctx context.Context, username string) (store.Backup, error) {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	if err := os.MkdirAll(s.BackupDir, 0o750); err != nil {
		return store.Backup{}, fmt.Errorf("create backup directory: %w", err)
	}
	id, err := store.NewID()
	if err != nil {
		return store.Backup{}, err
	}
	filename := id + ".tar.gz"
	temporary, err := os.CreateTemp(s.BackupDir, ".blockops-backup-*.tmp")
	if err != nil {
		return store.Backup{}, fmt.Errorf("create backup staging file: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o640); err != nil {
		temporary.Close()
		return store.Backup{}, fmt.Errorf("secure backup staging file: %w", err)
	}
	archiveErr := s.withConsistentWorld(ctx, func() error { return s.writeWorldArchive(ctx, temporary) })
	closeErr := temporary.Close()
	if archiveErr != nil {
		return store.Backup{}, archiveErr
	}
	if closeErr != nil {
		return store.Backup{}, fmt.Errorf("close backup archive: %w", closeErr)
	}
	finalPath := filepath.Join(s.BackupDir, filename)
	if err := os.Rename(temporaryPath, finalPath); err != nil {
		return store.Backup{}, fmt.Errorf("publish backup: %w", err)
	}
	info, err := os.Stat(finalPath)
	if err != nil {
		return store.Backup{}, fmt.Errorf("stat backup: %w", err)
	}
	backup := store.Backup{ID: id, Filename: filename, SizeBytes: info.Size(), CreatedAt: time.Now().UTC(), CreatedBy: username, Status: "ready"}
	if err := s.Store.CreateBackup(ctx, backup); err != nil {
		_ = os.Remove(finalPath)
		return store.Backup{}, err
	}
	return backup, nil
}

func (s *Service) PrepareWorldDownload(ctx context.Context) (string, error) {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	if err := os.MkdirAll(s.BackupDir, 0o750); err != nil {
		return "", fmt.Errorf("create staging directory: %w", err)
	}
	file, err := os.CreateTemp(s.BackupDir, ".blockops-world-download-*.tar.gz")
	if err != nil {
		return "", fmt.Errorf("create world archive: %w", err)
	}
	path := file.Name()
	if err := file.Chmod(0o640); err != nil {
		file.Close()
		os.Remove(path)
		return "", fmt.Errorf("secure world archive: %w", err)
	}
	err = s.withConsistentWorld(ctx, func() error { return s.writeWorldArchive(ctx, file) })
	closeErr := file.Close()
	if err != nil {
		os.Remove(path)
		return "", err
	}
	if closeErr != nil {
		os.Remove(path)
		return "", fmt.Errorf("close world archive: %w", closeErr)
	}
	return path, nil
}

func (s *Service) BackupPath(ctx context.Context, id string) (store.Backup, string, error) {
	backup, err := s.Store.BackupByID(ctx, id)
	if err != nil {
		return store.Backup{}, "", err
	}
	if filepath.Base(backup.Filename) != backup.Filename || !strings.HasSuffix(backup.Filename, ".tar.gz") {
		return store.Backup{}, "", errors.New("backup record contains an unsafe filename")
	}
	path := filepath.Join(s.BackupDir, backup.Filename)
	if _, err := os.Stat(path); err != nil {
		return store.Backup{}, "", fmt.Errorf("open backup archive: %w", err)
	}
	return backup, path, nil
}

func (s *Service) DeleteBackup(ctx context.Context, id string) error {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	_, path, err := s.BackupPath(ctx, id)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("delete backup archive: %w", err)
	}
	return s.Store.DeleteBackup(ctx, id)
}

func (s *Service) RestoreBackup(ctx context.Context, id string) error {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	_, archivePath, err := s.BackupPath(ctx, id)
	if err != nil {
		return err
	}
	staging, err := os.MkdirTemp(s.MinecraftDataDir, ".blockops-restore-")
	if err != nil {
		return fmt.Errorf("create restore staging directory: %w", err)
	}
	defer os.RemoveAll(staging)
	if err := s.extractBackup(ctx, archivePath, staging); err != nil {
		return err
	}
	if err := requireWorld(staging, s.WorldName); err != nil {
		return err
	}
	return s.installStagedWorlds(ctx, staging)
}

func (s *Service) ReplaceWorldZip(ctx context.Context, zipPath string) error {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	staging, err := os.MkdirTemp(s.MinecraftDataDir, ".blockops-upload-")
	if err != nil {
		return fmt.Errorf("create upload staging directory: %w", err)
	}
	defer os.RemoveAll(staging)
	if err := s.extractWorldZip(ctx, zipPath, staging); err != nil {
		return err
	}
	if err := requireWorld(staging, s.WorldName); err != nil {
		return err
	}
	return s.installStagedWorlds(ctx, staging)
}

func (s *Service) withConsistentWorld(ctx context.Context, archive func() error) error {
	state, inspectErr := s.Docker.Inspect(ctx)
	if inspectErr == nil && !state.Running {
		return archive()
	}
	if _, err := s.RCON.Exec(ctx, "save-off"); err != nil {
		return fmt.Errorf("disable Minecraft saves: %w", err)
	}
	defer func() {
		recoveryContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = s.RCON.Exec(recoveryContext, "save-on")
	}()
	if _, err := s.RCON.Exec(ctx, "save-all flush"); err != nil {
		return fmt.Errorf("flush Minecraft world: %w", err)
	}
	return archive()
}
