package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const ProductName = "BlockOps"

var safeName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$`)

type Config struct {
	ListenAddress      string
	DatabasePath       string
	MinecraftDataDir   string
	BackupDir          string
	WorldName          string
	RCONAddress        string
	RCONPassword       string
	DockerBaseURL      string
	MinecraftContainer string
	PublicOrigin       string
	CookieSecure       bool
	SessionTTL         time.Duration
	TrustedProxies     []*net.IPNet
	MaxUploadBytes     int64
	EncryptionKey      []byte
}

func Load() (Config, error) {
	cfg := Config{
		ListenAddress:      env("BLOCKOPS_LISTEN_ADDRESS", ":8080"),
		DatabasePath:       env("BLOCKOPS_DATABASE_PATH", "/data/blockops.db"),
		MinecraftDataDir:   env("BLOCKOPS_MINECRAFT_DATA_DIR", "/minecraft"),
		BackupDir:          env("BLOCKOPS_BACKUP_DIR", "/backups"),
		WorldName:          env("BLOCKOPS_WORLD_NAME", "world"),
		RCONAddress:        env("BLOCKOPS_RCON_ADDRESS", "minecraft:25575"),
		RCONPassword:       os.Getenv("BLOCKOPS_RCON_PASSWORD"),
		DockerBaseURL:      env("BLOCKOPS_DOCKER_URL", "http://docker-proxy:2375"),
		MinecraftContainer: env("BLOCKOPS_MINECRAFT_CONTAINER", "minecraft"),
		PublicOrigin:       strings.TrimRight(os.Getenv("BLOCKOPS_PUBLIC_ORIGIN"), "/"),
		CookieSecure:       envBool("BLOCKOPS_COOKIE_SECURE", true),
		SessionTTL:         envDuration("BLOCKOPS_SESSION_TTL", 12*time.Hour),
		MaxUploadBytes:     envInt64("BLOCKOPS_MAX_UPLOAD_BYTES", 2<<30),
	}

	var err error
	cfg.DatabasePath, err = absolutePath(cfg.DatabasePath, "database path")
	if err != nil {
		return Config{}, err
	}
	cfg.MinecraftDataDir, err = absolutePath(cfg.MinecraftDataDir, "Minecraft data directory")
	if err != nil {
		return Config{}, err
	}
	cfg.BackupDir, err = absolutePath(cfg.BackupDir, "backup directory")
	if err != nil {
		return Config{}, err
	}
	if !safeName.MatchString(cfg.WorldName) {
		return Config{}, errors.New("BLOCKOPS_WORLD_NAME contains unsupported characters")
	}
	if !safeName.MatchString(cfg.MinecraftContainer) {
		return Config{}, errors.New("BLOCKOPS_MINECRAFT_CONTAINER contains unsupported characters")
	}
	if cfg.SessionTTL < 15*time.Minute || cfg.SessionTTL > 30*24*time.Hour {
		return Config{}, errors.New("BLOCKOPS_SESSION_TTL must be between 15m and 720h")
	}
	if cfg.MaxUploadBytes < 1<<20 || cfg.MaxUploadBytes > 20<<30 {
		return Config{}, errors.New("BLOCKOPS_MAX_UPLOAD_BYTES must be between 1 MiB and 20 GiB")
	}
	if cfg.PublicOrigin != "" {
		origin, parseErr := url.Parse(cfg.PublicOrigin)
		if parseErr != nil || origin.Host == "" || (origin.Scheme != "http" && origin.Scheme != "https") || origin.User != nil || (origin.Path != "" && origin.Path != "/") || origin.RawQuery != "" || origin.Fragment != "" {
			return Config{}, errors.New("BLOCKOPS_PUBLIC_ORIGIN must be an exact http(s) origin without a path, query, fragment, or credentials")
		}
		cfg.PublicOrigin = origin.Scheme + "://" + origin.Host
	}

	cfg.TrustedProxies, err = parseCIDRs(os.Getenv("BLOCKOPS_TRUSTED_PROXIES"))
	if err != nil {
		return Config{}, err
	}
	if encoded := os.Getenv("BLOCKOPS_ENCRYPTION_KEY"); encoded != "" {
		cfg.EncryptionKey, err = base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(cfg.EncryptionKey) != 32 {
			return Config{}, errors.New("BLOCKOPS_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
		}
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envInt64(key string, fallback int64) int64 {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func absolutePath(value, label string) (string, error) {
	cleaned := filepath.Clean(value)
	if !filepath.IsAbs(cleaned) {
		return "", fmt.Errorf("%s must be absolute", label)
	}
	return cleaned, nil
}

func parseCIDRs(value string) ([]*net.IPNet, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	parts := strings.Split(value, ",")
	ranges := make([]*net.IPNet, 0, len(parts))
	for _, part := range parts {
		_, network, err := net.ParseCIDR(strings.TrimSpace(part))
		if err != nil {
			return nil, fmt.Errorf("parse BLOCKOPS_TRUSTED_PROXIES: %w", err)
		}
		ranges = append(ranges, network)
	}
	return ranges, nil
}
