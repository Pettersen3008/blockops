package operations

import (
	"archive/zip"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

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
