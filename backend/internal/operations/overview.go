package operations

import (
	"context"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/console"
	"github.com/blockops-dashboard/blockops/backend/internal/dockerapi"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

type ServerInfo struct {
	State      string    `json:"state"`
	Image      string    `json:"image,omitempty"`
	StartedAt  time.Time `json:"startedAt,omitempty"`
	UptimeSecs int64     `json:"uptimeSeconds,omitempty"`
	Version    string    `json:"version,omitempty"`
	Software   string    `json:"software,omitempty"`
}

type DiskMetrics struct {
	UsedBytes  uint64 `json:"usedBytes"`
	TotalBytes uint64 `json:"totalBytes"`
}

type Overview struct {
	Server     Available[ServerInfo]        `json:"server"`
	Metrics    Available[dockerapi.Metrics] `json:"metrics"`
	Disk       Available[DiskMetrics]       `json:"disk"`
	Players    Available[PlayerSummary]     `json:"players"`
	Warnings   []console.Line               `json:"recentWarnings"`
	LastBackup *store.Backup                `json:"lastSuccessfulBackup,omitempty"`
}

func (s *Service) Overview(ctx context.Context) Overview {
	result := Overview{Warnings: s.Console.RecentWarnings(5)}
	var wait sync.WaitGroup
	wait.Add(4)
	go func() {
		defer wait.Done()
		state, err := s.Docker.Inspect(ctx)
		if err != nil {
			result.Server = unavailable[ServerInfo]("Container metrics unavailable. Check the private Docker integration.")
			return
		}
		info := ServerInfo{State: normalizeState(state.Status), Image: state.Image, StartedAt: state.StartedAt}
		if state.Running && !state.StartedAt.IsZero() {
			info.UptimeSecs = int64(time.Since(state.StartedAt).Seconds())
		}
		version, err := s.RCON.Exec(ctx, "version")
		if err == nil {
			info.Version, info.Software = parseVersion(version)
		}
		result.Server = available(info)
	}()
	go func() {
		defer wait.Done()
		metrics, err := s.Docker.Stats(ctx)
		if err != nil {
			result.Metrics = unavailable[dockerapi.Metrics]("CPU and memory metrics are unavailable.")
			return
		}
		result.Metrics = available(metrics)
	}()
	go func() {
		defer wait.Done()
		players, err := s.onlinePlayers(ctx)
		if err != nil {
			result.Players = unavailable[PlayerSummary]("Player data is unavailable because RCON could not be reached.")
			return
		}
		result.Players = available(players)
	}()
	go func() {
		defer wait.Done()
		disk, err := diskMetrics(s.MinecraftDataDir)
		if err != nil {
			result.Disk = unavailable[DiskMetrics]("Disk usage is unavailable for the Minecraft data volume.")
			return
		}
		result.Disk = available(disk)
	}()
	wait.Wait()
	backups, err := s.Store.ListBackups(ctx)
	if err == nil && len(backups) > 0 {
		result.LastBackup = &backups[0]
	}
	return result
}

func parseVersion(response string) (string, string) {
	software := ""
	version := ""
	lower := strings.ToLower(response)
	for _, candidate := range []string{"paper", "purpur", "spigot", "bukkit"} {
		if strings.Contains(lower, candidate) {
			software = strings.ToUpper(candidate[:1]) + candidate[1:]
			break
		}
	}
	fields := strings.Fields(response)
	for index, field := range fields {
		if strings.EqualFold(field, "version") && index+1 < len(fields) {
			version = strings.Trim(fields[index+1], "(),")
			break
		}
	}
	return version, software
}

func normalizeState(value string) string {
	switch strings.ToLower(value) {
	case "running":
		return "online"
	case "created", "restarting":
		return "starting"
	case "removing", "paused":
		return "stopping"
	case "exited", "dead":
		return "offline"
	default:
		return "unknown"
	}
}

func diskMetrics(path string) (DiskMetrics, error) {
	var stats syscall.Statfs_t
	if err := syscall.Statfs(path, &stats); err != nil {
		return DiskMetrics{}, err
	}
	total := uint64(stats.Blocks) * uint64(stats.Bsize)
	available := uint64(stats.Bavail) * uint64(stats.Bsize)
	return DiskMetrics{UsedBytes: total - available, TotalBytes: total}, nil
}
