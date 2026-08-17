package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/dockerapi"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	container := os.Getenv("BLOCKOPS_MINECRAFT_CONTAINER")
	if container == "" {
		logger.Error("BLOCKOPS_MINECRAFT_CONTAINER is required")
		os.Exit(1)
	}
	socket := os.Getenv("BLOCKOPS_DOCKER_SOCKET")
	if socket == "" {
		socket = "/var/run/docker.sock"
	}
	engine, err := dockerapi.NewUnix(socket, container)
	if err != nil {
		logger.Error("Docker guard configuration rejected", "error", err)
		os.Exit(1)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /containers/{container}/json", func(w http.ResponseWriter, r *http.Request) {
		if r.PathValue("container") != container {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "container not found"})
			return
		}
		state, err := engine.Inspect(r.Context())
		if err != nil {
			logger.Warn("container inspect failed", "error", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Docker engine unavailable"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"Config": map[string]string{"Image": state.Image},
			"State":  map[string]any{"Status": dockerState(state.Status), "Running": state.Running, "StartedAt": state.StartedAt.Format(time.RFC3339Nano), "Error": state.StatusText},
		})
	})
	mux.HandleFunc("GET /containers/{container}/stats", func(w http.ResponseWriter, r *http.Request) {
		if r.PathValue("container") != container || r.URL.Query().Get("stream") != "false" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "route not found"})
			return
		}
		metrics, err := engine.Stats(r.Context())
		if err != nil {
			logger.Warn("container metrics failed", "error", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Docker engine unavailable"})
			return
		}
		// Reconstruct the small Docker stats shape consumed by the dashboard client.
		writeJSON(w, http.StatusOK, map[string]any{
			"cpu_stats":    map[string]any{"cpu_usage": map[string]uint64{"total_usage": uint64(metrics.CPUPercent * 10)}, "system_cpu_usage": uint64(1000), "online_cpus": uint32(1)},
			"precpu_stats": map[string]any{"cpu_usage": map[string]uint64{"total_usage": uint64(0)}, "system_cpu_usage": uint64(0)},
			"memory_stats": map[string]any{"usage": metrics.MemoryUsageBytes, "limit": metrics.MemoryLimitBytes, "stats": map[string]uint64{"cache": 0}},
		})
	})
	for _, action := range []string{"start", "stop", "restart"} {
		action := action
		mux.HandleFunc("POST /containers/{container}/"+action, func(w http.ResponseWriter, r *http.Request) {
			if r.PathValue("container") != container {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "container not found"})
				return
			}
			if err := engine.Action(r.Context(), action); err != nil {
				logger.Warn("container action failed", "action", action, "error", err)
				writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Docker action failed"})
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		mux.ServeHTTP(w, r)
	})
	server := &http.Server{Addr: ":2375", Handler: handler, ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 8 << 10}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownContext)
	}()
	logger.Info("Docker guard listening", "container", container)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("Docker guard stopped", "error", err)
		os.Exit(1)
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func dockerState(value string) string {
	if value == "online" {
		return "running"
	}
	if value == "offline" {
		return "exited"
	}
	return value
}
