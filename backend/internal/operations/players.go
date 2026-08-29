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
)

var (
	playerNamePattern = regexp.MustCompile(`^[A-Za-z0-9_]{1,16}$`)
	secretPattern     = regexp.MustCompile(`(?i)(password|passwd|token|secret|rcon|login|register)`)
)

type PlayerSummary struct {
	Online int      `json:"online"`
	Max    int      `json:"max"`
	Names  []string `json:"names"`
}

type Player struct {
	Name        string `json:"name"`
	UUID        string `json:"uuid,omitempty"`
	Online      bool   `json:"online"`
	Allowlisted bool   `json:"allowlisted"`
	Banned      bool   `json:"banned"`
	Operator    bool   `json:"operator"`
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

func (s *Service) onlinePlayers(ctx context.Context) (PlayerSummary, error) {
	response, err := s.RCON.Exec(ctx, "list")
	if err != nil {
		return PlayerSummary{}, err
	}
	return parsePlayerList(response), nil
}

func parsePlayerList(response string) PlayerSummary {
	colon := strings.LastIndex(response, ":")
	prefix := response
	names := ""
	if colon >= 0 {
		prefix = response[:colon]
		names = strings.TrimSpace(response[colon+1:])
	}
	online, maximum := parsePlayerCounts(prefix)
	nameCount := 0
	if names != "" {
		nameCount = strings.Count(names, ",") + 1
	}
	result := PlayerSummary{Online: online, Max: maximum, Names: make([]string, 0, nameCount)}
	for names != "" {
		name, remaining, found := strings.Cut(names, ",")
		name = strings.TrimSpace(name)
		if playerNamePattern.MatchString(name) {
			result.Names = append(result.Names, name)
		}
		if !found {
			break
		}
		names = remaining
	}
	if result.Online == 0 && len(result.Names) > 0 {
		result.Online = len(result.Names)
	}
	return result
}

func parsePlayerCounts(response string) (int, int) {
	const prefix = "there are "
	lower := strings.ToLower(response)
	start := strings.Index(lower, prefix)
	if start < 0 {
		return 0, 0
	}
	counts := lower[start+len(prefix):]
	onlineText, maximumText, found := strings.Cut(counts, " of ")
	if !found {
		return 0, 0
	}
	maximumText = strings.TrimPrefix(maximumText, "a max of ")
	maximumText, _, found = strings.Cut(maximumText, " players online")
	if !found {
		return 0, 0
	}
	online, onlineErr := strconv.Atoi(strings.TrimSpace(onlineText))
	maximum, maximumErr := strconv.Atoi(strings.TrimSpace(maximumText))
	if onlineErr != nil || maximumErr != nil {
		return 0, 0
	}
	return online, maximum
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

func optionalReason(reason string) string {
	if strings.TrimSpace(reason) == "" {
		return ""
	}
	return " " + strings.TrimSpace(reason)
}
