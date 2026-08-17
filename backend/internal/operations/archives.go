package operations

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
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

func (s *Service) writeWorldArchive(ctx context.Context, destination io.Writer) error {
	worlds, err := s.existingWorlds()
	if err != nil {
		return err
	}
	if len(worlds) == 0 {
		return errors.New("no Minecraft world directories were found")
	}
	gzipWriter := gzip.NewWriter(destination)
	gzipWriter.Name = "blockops-worlds.tar"
	gzipWriter.ModTime = time.Now().UTC()
	tarWriter := tar.NewWriter(gzipWriter)
	for _, worldPath := range worlds {
		err := filepath.WalkDir(worldPath, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}
			info, err := entry.Info()
			if err != nil {
				return err
			}
			if info.Mode()&os.ModeSymlink != 0 || (!info.Mode().IsRegular() && !info.IsDir()) {
				return fmt.Errorf("world contains unsupported file type: %s", path)
			}
			relative, err := filepath.Rel(s.MinecraftDataDir, path)
			if err != nil || !safeRelative(relative) {
				return errors.New("world archive path escaped the data directory")
			}
			header, err := tar.FileInfoHeader(info, "")
			if err != nil {
				return err
			}
			header.Name = filepath.ToSlash(relative)
			header.Uid, header.Gid = 0, 0
			header.Uname, header.Gname = "", ""
			if info.IsDir() {
				header.Mode = 0o750
			} else {
				header.Mode = 0o640
			}
			if err := tarWriter.WriteHeader(header); err != nil {
				return err
			}
			if !info.Mode().IsRegular() {
				return nil
			}
			file, err := os.Open(path)
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(tarWriter, file)
			closeErr := file.Close()
			if copyErr != nil {
				return copyErr
			}
			return closeErr
		})
		if err != nil {
			tarWriter.Close()
			gzipWriter.Close()
			return fmt.Errorf("archive world: %w", err)
		}
	}
	if err := tarWriter.Close(); err != nil {
		gzipWriter.Close()
		return fmt.Errorf("finish tar archive: %w", err)
	}
	if err := gzipWriter.Close(); err != nil {
		return fmt.Errorf("finish compressed archive: %w", err)
	}
	return nil
}

func (s *Service) extractBackup(ctx context.Context, archivePath, destination string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open backup: %w", err)
	}
	defer file.Close()
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return errors.New("backup is not a valid gzip archive")
	}
	defer gzipReader.Close()
	tarReader := tar.NewReader(gzipReader)
	allowed := make(map[string]bool)
	for _, name := range s.worldNames() {
		allowed[name] = true
	}
	var total int64
	for {
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fmt.Errorf("read backup archive: %w", err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		name := filepath.FromSlash(header.Name)
		if !safeRelative(name) || !allowed[strings.Split(filepath.ToSlash(name), "/")[0]] {
			return errors.New("backup contains an unsafe path")
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA && header.Typeflag != tar.TypeDir {
			return errors.New("backup contains links or unsupported file types")
		}
		if header.Size < 0 || header.Size > maxRestoredBytes-total {
			return errors.New("expanded backup exceeds the restore limit")
		}
		total += header.Size
		target := filepath.Join(destination, name)
		if err := ensureContained(destination, target); err != nil {
			return err
		}
		if header.Typeflag == tar.TypeDir {
			if err := os.MkdirAll(target, 0o750); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
			return err
		}
		output, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o640)
		if err != nil {
			return err
		}
		_, copyErr := io.CopyN(output, tarReader, header.Size)
		closeErr := output.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}

func (s *Service) extractWorldZip(ctx context.Context, archivePath, destination string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return errors.New("uploaded file is not a valid ZIP archive")
	}
	defer reader.Close()
	prefix, err := worldZipPrefix(reader.File)
	if err != nil {
		return err
	}
	worldRoot := filepath.Join(destination, s.WorldName)
	if err := os.MkdirAll(worldRoot, 0o750); err != nil {
		return err
	}
	var total uint64
	for _, entry := range reader.File {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if prefix != "" && !strings.HasPrefix(entry.Name, prefix) {
			if strings.HasPrefix(entry.Name, "__MACOSX/") || filepath.Base(entry.Name) == ".DS_Store" {
				continue
			}
			return errors.New("world ZIP contains files outside the world directory")
		}
		name := strings.TrimPrefix(strings.TrimPrefix(entry.Name, prefix), "/")
		if name == "" || strings.HasPrefix(name, "__MACOSX/") || filepath.Base(name) == ".DS_Store" {
			continue
		}
		if strings.Contains(name, "\\") || !safeRelative(filepath.FromSlash(name)) {
			return errors.New("world ZIP contains an unsafe path")
		}
		if entry.Mode()&os.ModeSymlink != 0 || (!entry.FileInfo().Mode().IsRegular() && !entry.FileInfo().IsDir()) {
			return errors.New("world ZIP contains links or unsupported file types")
		}
		limit := uint64(s.MaxUploadBytes) * 4
		if entry.UncompressedSize64 > limit-total {
			return errors.New("expanded world ZIP exceeds the safety limit")
		}
		total += entry.UncompressedSize64
		target := filepath.Join(worldRoot, filepath.FromSlash(name))
		if err := ensureContained(worldRoot, target); err != nil {
			return err
		}
		if entry.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o750); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
			return err
		}
		input, err := entry.Open()
		if err != nil {
			return err
		}
		output, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o640)
		if err != nil {
			input.Close()
			return err
		}
		written, copyErr := io.Copy(output, io.LimitReader(input, int64(entry.UncompressedSize64)+1))
		inputCloseErr := input.Close()
		outputCloseErr := output.Close()
		if copyErr != nil {
			return copyErr
		}
		if written != int64(entry.UncompressedSize64) {
			return errors.New("world ZIP entry size does not match its metadata")
		}
		if inputCloseErr != nil {
			return inputCloseErr
		}
		if outputCloseErr != nil {
			return outputCloseErr
		}
	}
	return nil
}

func worldZipPrefix(files []*zip.File) (string, error) {
	levelPaths := make([]string, 0, 1)
	for _, file := range files {
		cleaned := strings.TrimPrefix(file.Name, "./")
		if strings.Contains(cleaned, "\\") || !safeRelative(filepath.FromSlash(cleaned)) {
			return "", errors.New("world ZIP contains an unsafe path")
		}
		if filepath.Base(filepath.FromSlash(cleaned)) == "level.dat" {
			levelPaths = append(levelPaths, cleaned)
		}
	}
	if len(levelPaths) != 1 {
		return "", errors.New("world ZIP must contain exactly one level.dat")
	}
	directory := filepath.ToSlash(filepath.Dir(filepath.FromSlash(levelPaths[0])))
	if directory == "." {
		return "", nil
	}
	return directory + "/", nil
}

func (s *Service) installStagedWorlds(ctx context.Context, staging string) error {
	rollback, err := os.MkdirTemp(s.MinecraftDataDir, ".blockops-rollback-")
	if err != nil {
		return fmt.Errorf("create world rollback directory: %w", err)
	}
	cleanupRollback := false
	defer func() {
		if cleanupRollback {
			_ = os.RemoveAll(rollback)
		}
	}()
	if err := s.Docker.Action(ctx, "stop"); err != nil {
		return fmt.Errorf("stop Minecraft container before world replacement: %w", err)
	}
	rollbackWorlds := func() {
		for _, name := range s.worldNames() {
			_ = os.RemoveAll(filepath.Join(s.MinecraftDataDir, name))
			oldPath := filepath.Join(rollback, name)
			if _, statErr := os.Stat(oldPath); statErr == nil {
				_ = os.Rename(oldPath, filepath.Join(s.MinecraftDataDir, name))
			}
		}
	}
	for _, name := range s.worldNames() {
		current := filepath.Join(s.MinecraftDataDir, name)
		if _, err := os.Stat(current); err == nil {
			if err := os.Rename(current, filepath.Join(rollback, name)); err != nil {
				rollbackWorlds()
				_ = s.Docker.Action(context.Background(), "start")
				return fmt.Errorf("stage existing world: %w", err)
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			rollbackWorlds()
			_ = s.Docker.Action(context.Background(), "start")
			return err
		}
	}
	installed := false
	defer func() {
		if !installed {
			rollbackWorlds()
			restartContext, cancel := context.WithTimeout(context.Background(), 45*time.Second)
			defer cancel()
			_ = s.Docker.Action(restartContext, "start")
		}
	}()
	for _, name := range s.worldNames() {
		source := filepath.Join(staging, name)
		if _, err := os.Stat(source); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return err
		}
		if err := os.Rename(source, filepath.Join(s.MinecraftDataDir, name)); err != nil {
			return fmt.Errorf("install replacement world: %w", err)
		}
	}
	if err := s.Docker.Action(ctx, "start"); err != nil {
		return fmt.Errorf("start Minecraft container after world replacement: %w", err)
	}
	installed = true
	cleanupRollback = true
	return nil
}

func (s *Service) existingWorlds() ([]string, error) {
	worlds := make([]string, 0, 3)
	for _, name := range s.worldNames() {
		path := filepath.Join(s.MinecraftDataDir, name)
		info, err := os.Stat(path)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if !info.IsDir() {
			return nil, fmt.Errorf("configured world path is not a directory: %s", name)
		}
		worlds = append(worlds, path)
	}
	return worlds, nil
}

func (s *Service) worldNames() []string {
	return []string{s.WorldName, s.WorldName + "_nether", s.WorldName + "_the_end"}
}

func requireWorld(root, worldName string) error {
	info, err := os.Stat(filepath.Join(root, worldName, "level.dat"))
	if err != nil || !info.Mode().IsRegular() {
		return errors.New("archive does not contain a recognizable Minecraft world (level.dat is missing)")
	}
	return nil
}

func safeRelative(value string) bool {
	if value == "" || filepath.IsAbs(value) {
		return false
	}
	cleaned := filepath.Clean(value)
	return cleaned != "." && cleaned != ".." && !strings.HasPrefix(cleaned, ".."+string(filepath.Separator))
}

func ensureContained(root, target string) error {
	relative, err := filepath.Rel(root, target)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return errors.New("archive path escaped its staging directory")
	}
	return nil
}
