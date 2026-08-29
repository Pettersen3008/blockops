package operations

import (
	"context"
	"sync"

	"github.com/blockops-dashboard/blockops/backend/internal/console"
	"github.com/blockops-dashboard/blockops/backend/internal/dockerapi"
	"github.com/blockops-dashboard/blockops/backend/internal/minecraft"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
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

func (s *Service) ContainerAction(ctx context.Context, action string) error {
	return s.Docker.Action(ctx, action)
}

func available[T any](value T) Available[T] { return Available[T]{Available: true, Value: &value} }

func unavailable[T any](message string) Available[T] {
	return Available[T]{Available: false, Message: message}
}
