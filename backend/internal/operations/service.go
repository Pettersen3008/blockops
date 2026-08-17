package operations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/console"
	"github.com/blockops-dashboard/blockops/backend/internal/dockerapi"
	"github.com/blockops-dashboard/blockops/backend/internal/minecraft"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

var (
	playerNamePattern = regexp.MustCompile(`^[A-Za-z0-9_]{1,16}$`)
	playerListPattern = regexp.MustCompile(`(?i)there are (\d+) of (?:a max of )?(\d+) players online`)
	secretPattern     = regexp.MustCompile(`(?i)(password|passwd|token|secret|rcon|login|register)`)
)

type Service struct {
	Store            *store.Store
	RCON             minecraft.Executor
	Docker           *dockerapi.Client
	Console          *console.Hub
	MinecraftDataDir string
	BackupDir        string
	WorldName        string
	MaxUploadBytes   int64
	operationMu      sync.Mutex
}

type Available[T any] struct {
	Available bool   `json:"available"`
	Value     *T     `json:"value,omitempty"`
	Message   string `json:"message,omitempty"`
}

type ServerInfo struct {
	State      string    `json:"state"`
	Image      string    `json:"image,omitempty"`
	StartedAt  time.Time `json:"startedAt,omitempty"`
	UptimeSecs int64     `json:"uptimeSeconds,omitempty"`
	Version    string    `json:"version,omitempty"`
	Software   string    `json:"software,omitempty"`
}

type PlayerSummary struct {
	Online int      `json:"online"`
	Max    int      `json:"max"`
	Names  []string `json:"names"`
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

type Player struct {
	Name        string `json:"name"`
	UUID        string `json:"uuid,omitempty"`
	Online      bool   `json:"online"`
	Allowlisted bool   `json:"allowlisted"`
	Banned      bool   `json:"banned"`
	Operator    bool   `json:"operator"`
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

func (s *Service) Players(ctx context.Context) ([]Player, error) {
	online, onlineErr := s.onlinePlayers(ctx)
	records := make(map[string]*Player)
	for _, name := range online.Names {
		key := strings.ToLower(name)
		records[key] = &Player{Name: name, Online: true}
	}
	for _, source := range []struct {
		filename string
		field    string
	}{
		{"usercache.json", "uuid"},
		{"whitelist.json", "allowlist"},
		{"banned-players.json", "ban"},
		{"ops.json", "operator"},
	} {
		var entries []struct {
			UUID string `json:"uuid"`
			Name string `json:"name"`
		}
		if err := readJSONFile(filepath.Join(s.MinecraftDataDir, source.filename), &entries); err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				return nil, err
			}
			continue
		}
		for _, entry := range entries {
			if !playerNamePattern.MatchString(entry.Name) {
				continue
			}
			key := strings.ToLower(entry.Name)
			player := records[key]
			if player == nil {
				player = &Player{Name: entry.Name}
				records[key] = player
			}
			if entry.UUID != "" {
				player.UUID = entry.UUID
			}
			switch source.field {
			case "allowlist":
				player.Allowlisted = true
			case "ban":
				player.Banned = true
			case "operator":
				player.Operator = true
			}
		}
	}
	players := make([]Player, 0, len(records))
	for _, player := range records {
		players = append(players, *player)
	}
	sort.Slice(players, func(left, right int) bool {
		if players[left].Online != players[right].Online {
			return players[left].Online
		}
		return strings.ToLower(players[left].Name) < strings.ToLower(players[right].Name)
	})
	if onlineErr != nil && len(players) == 0 {
		return nil, onlineErr
	}
	return players, nil
}

func (s *Service) PlayerAction(ctx context.Context, action, name, reason string) (string, error) {
	if !playerNamePattern.MatchString(name) {
		return "", errors.New("player name must be a valid Java username")
	}
	if strings.ContainsAny(reason, "\r\n\x00") || len(reason) > 160 {
		return "", errors.New("reason must contain at most 160 characters and no line breaks")
	}
	var command string
	switch action {
	case "allowlist-add":
		command = "whitelist add " + name
	case "allowlist-remove":
		command = "whitelist remove " + name
	case "kick":
		command = "kick " + name + optionalReason(reason)
	case "ban":
		command = "ban " + name + optionalReason(reason)
	case "pardon":
		command = "pardon " + name
	case "op":
		command = "op " + name
	case "deop":
		command = "deop " + name
	default:
		return "", errors.New("unsupported player action")
	}
	return s.RCON.Exec(ctx, command)
}

func (s *Service) ExecuteCommand(ctx context.Context, command string) (string, error) {
	command = strings.TrimSpace(command)
	if command == "" || len(command) > 4096 || strings.ContainsAny(command, "\r\n\x00") {
		return "", errors.New("command must contain 1–4096 characters and no line breaks")
	}
	command = strings.TrimPrefix(command, "/")
	return s.RCON.Exec(ctx, command)
}

func RedactCommand(command string) string {
	trimmed := strings.TrimSpace(strings.TrimPrefix(command, "/"))
	if !secretPattern.MatchString(trimmed) {
		return trimmed
	}
	verb := strings.Fields(trimmed)
	if len(verb) == 0 {
		return "[REDACTED]"
	}
	return verb[0] + " [REDACTED]"
}

func (s *Service) ContainerAction(ctx context.Context, action string) error {
	return s.Docker.Action(ctx, action)
}

func (s *Service) onlinePlayers(ctx context.Context) (PlayerSummary, error) {
	response, err := s.RCON.Exec(ctx, "list")
	if err != nil {
		return PlayerSummary{}, err
	}
	return parsePlayerList(response), nil
}

func parsePlayerList(response string) PlayerSummary {
	result := PlayerSummary{Names: []string{}}
	colon := strings.LastIndex(response, ":")
	prefix := response
	if colon >= 0 {
		prefix = response[:colon]
		names := strings.TrimSpace(response[colon+1:])
		if names != "" {
			for _, name := range strings.Split(names, ",") {
				name = strings.TrimSpace(name)
				if playerNamePattern.MatchString(name) {
					result.Names = append(result.Names, name)
				}
			}
		}
	}
	if matches := playerListPattern.FindStringSubmatch(prefix); len(matches) == 3 {
		result.Online, _ = strconv.Atoi(matches[1])
		result.Max, _ = strconv.Atoi(matches[2])
	}
	if result.Online == 0 && len(result.Names) > 0 {
		result.Online = len(result.Names)
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

func readJSONFile(path string, destination any) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 10<<20))
	if err := decoder.Decode(destination); err != nil {
		return fmt.Errorf("decode %s: %w", filepath.Base(path), err)
	}
	return nil
}

func available[T any](value T) Available[T] { return Available[T]{Available: true, Value: &value} }

func unavailable[T any](message string) Available[T] {
	return Available[T]{Available: false, Message: message}
}

func optionalReason(reason string) string {
	if strings.TrimSpace(reason) == "" {
		return ""
	}
	return " " + strings.TrimSpace(reason)
}
