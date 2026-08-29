package operations

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

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
