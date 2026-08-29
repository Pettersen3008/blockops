package operations

import (
	"archive/tar"
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
)

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
