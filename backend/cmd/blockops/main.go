package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/config"
	consolehub "github.com/blockops-dashboard/blockops/backend/internal/console"
	"github.com/blockops-dashboard/blockops/backend/internal/dockerapi"
	"github.com/blockops-dashboard/blockops/backend/internal/httpapi"
	"github.com/blockops-dashboard/blockops/backend/internal/minecraft"
	"github.com/blockops-dashboard/blockops/backend/internal/operations"
	"github.com/blockops-dashboard/blockops/backend/internal/secrets"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration rejected", "error", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, cfg, logger); err != nil {
		logger.Error("BlockOps stopped", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, cfg config.Config, logger *slog.Logger) error {
	for _, directory := range []string{cfg.MinecraftDataDir, cfg.BackupDir} {
		if err := os.MkdirAll(directory, 0o750); err != nil {
			return err
		}
	}
	database, err := store.Open(ctx, cfg.DatabasePath, store.Adoption{
		DockerBaseURL: cfg.DockerBaseURL,
		ContainerName: cfg.MinecraftContainer,
		DataDir:       cfg.MinecraftDataDir,
		BackupDir:     cfg.BackupDir,
		WorldName:     cfg.WorldName,
		RCONAddress:   cfg.RCONAddress,
	})
	if err != nil {
		return err
	}
	defer database.Close()
	var secretCipher *secrets.Cipher
	if len(cfg.EncryptionKey) > 0 {
		secretCipher, err = secrets.New(cfg.EncryptionKey)
		if err != nil {
			return err
		}
	}
	integration, err := minecraft.NewIntegration(ctx, database, secretCipher, minecraft.Credentials{Address: cfg.RCONAddress, Password: cfg.RCONPassword})
	if err != nil {
		return err
	}
	rcon := &minecraft.RCONClient{Integration: integration}
	docker, err := dockerapi.New(cfg.DockerBaseURL, cfg.MinecraftContainer)
	if err != nil {
		return err
	}
	console := consolehub.New(filepath.Join(cfg.MinecraftDataDir, "logs", "latest.log"), 2000)
	go console.Run(ctx)
	service := &operations.Service{
		Store: database, RCON: rcon, Docker: docker, Console: console,
		MinecraftDataDir: cfg.MinecraftDataDir, BackupDir: cfg.BackupDir,
		WorldName: cfg.WorldName, MaxUploadBytes: cfg.MaxUploadBytes,
	}
	api, err := httpapi.New(cfg, database, service, integration, logger)
	if err != nil {
		return err
	}
	server := &http.Server{
		Addr: cfg.ListenAddress, Handler: api.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Minute,
		WriteTimeout:      30 * time.Minute,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    32 << 10,
	}
	errChannel := make(chan error, 1)
	go func() {
		logger.Info("BlockOps listening", "address", cfg.ListenAddress)
		errChannel <- server.ListenAndServe()
	}()
	purgeTicker := time.NewTicker(time.Hour)
	defer purgeTicker.Stop()
	for {
		select {
		case <-ctx.Done():
			shutdownContext, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			return server.Shutdown(shutdownContext)
		case err := <-errChannel:
			if errors.Is(err, http.ErrServerClosed) {
				return nil
			}
			return err
		case now := <-purgeTicker.C:
			purgeContext, cancel := context.WithTimeout(ctx, 10*time.Second)
			if err := database.PurgeExpiredSessions(purgeContext, now.UTC()); err != nil {
				logger.Warn("session cleanup failed", "error", err)
			}
			cancel()
		}
	}
}
