package httpapi

import (
	_ "embed"
	"log/slog"
	"net/http"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/auth"
	"github.com/blockops-dashboard/blockops/backend/internal/config"
	"github.com/blockops-dashboard/blockops/backend/internal/minecraft"
	"github.com/blockops-dashboard/blockops/backend/internal/operations"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
	"github.com/blockops-dashboard/blockops/backend/internal/webui"
)

const sessionCookie = "blockops_session"

const reauthenticationWindow = 10 * time.Minute

// A console socket re-reads its grant on this interval, so revocation closes the
// stream instead of surviving until the browser reconnects. A variable because
// the revocation test cannot wait half a minute.
var consoleGrantRecheck = 30 * time.Second

//go:embed openapi.yaml
var openAPISpec []byte

type contextKey int

const (
	sessionKey contextKey = iota
	tokenKey
	requestIDKey
)

type Server struct {
	config      config.Config
	store       *store.Store
	operations  *operations.Service
	integration *minecraft.Integration
	sessions    auth.SessionManager
	limiter     *loginLimiter
	logger      *slog.Logger
	dummyHash   string
}

type errorEnvelope struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func New(cfg config.Config, database *store.Store, service *operations.Service, integration *minecraft.Integration, logger *slog.Logger) (*Server, error) {
	dummyHash, err := auth.HashPassword("not-a-real-account-password-42!")
	if err != nil {
		return nil, err
	}
	return &Server{
		config: cfg, store: database, operations: service, integration: integration,
		sessions: auth.SessionManager{Store: database, TTL: cfg.SessionTTL},
		limiter:  newLoginLimiter(), logger: logger, dummyHash: dummyHash,
	}, nil
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/openapi.yaml", s.openAPI)
	mux.HandleFunc("GET /api/v1/health", s.health)
	mux.HandleFunc("GET /api/v1/setup", s.setupStatus)
	mux.HandleFunc("POST /api/v1/setup", s.setup)
	mux.HandleFunc("POST /api/v1/auth/login", s.login)
	mux.Handle("GET /api/v1/auth/session", s.authenticated(http.HandlerFunc(s.session)))
	mux.Handle("POST /api/v1/auth/logout", s.authenticated(http.HandlerFunc(s.logout)))
	mux.Handle("POST /api/v1/auth/reauthenticate", s.authenticated(http.HandlerFunc(s.reauthenticate)))
	// Every server route carries the ID the evaluator needs in one place, so no
	// handler reconciles a path against a body. Fleet routes carry no server.
	mux.Handle("GET /api/v1/servers", s.authenticated(http.HandlerFunc(s.servers)))
	mux.Handle("GET /api/v1/servers/{serverId}/overview", s.require("monitor.read", http.HandlerFunc(s.overview)))
	mux.Handle("GET /api/v1/servers/{serverId}/console/history", s.require("console.read", http.HandlerFunc(s.consoleHistory)))
	mux.Handle("GET /api/v1/servers/{serverId}/console/ws", s.require("console.read", http.HandlerFunc(s.consoleWebSocket)))
	mux.Handle("POST /api/v1/servers/{serverId}/console/commands", s.require("console.execute", http.HandlerFunc(s.consoleCommand)))
	mux.Handle("GET /api/v1/servers/{serverId}/players", s.require("players.read", http.HandlerFunc(s.players)))
	mux.Handle("POST /api/v1/servers/{serverId}/players/actions", s.require("players.manage", http.HandlerFunc(s.playerAction)))
	mux.Handle("GET /api/v1/servers/{serverId}/backups", s.require("backups.read", http.HandlerFunc(s.backups)))
	mux.Handle("POST /api/v1/servers/{serverId}/backups", s.require("backups.create", http.HandlerFunc(s.createBackup)))
	mux.Handle("DELETE /api/v1/servers/{serverId}/backups/{id}", s.require("backups.delete", http.HandlerFunc(s.deleteBackup)))
	mux.Handle("GET /api/v1/servers/{serverId}/backups/{id}/download", s.require("backups.download", http.HandlerFunc(s.downloadBackup)))
	mux.Handle("POST /api/v1/servers/{serverId}/backups/{id}/restore", s.require("backups.restore", http.HandlerFunc(s.restoreBackup)))
	mux.Handle("GET /api/v1/servers/{serverId}/world/download", s.require("world.download", http.HandlerFunc(s.downloadWorld)))
	mux.Handle("PUT /api/v1/servers/{serverId}/world", s.require("world.replace", http.HandlerFunc(s.replaceWorld)))
	mux.Handle("POST /api/v1/servers/{serverId}/actions", s.authenticated(http.HandlerFunc(s.serverAction)))
	mux.Handle("GET /api/v1/servers/{serverId}/audit", s.require("audit.read", http.HandlerFunc(s.auditLog)))
	mux.Handle("GET /api/v1/servers/{serverId}/audit/export", s.require("audit.read", http.HandlerFunc(s.auditExport)))
	mux.Handle("GET /api/v1/servers/{serverId}/settings", s.require("settings.manage", http.HandlerFunc(s.settings)))
	mux.Handle("PUT /api/v1/servers/{serverId}/settings/rcon", s.require("settings.manage", http.HandlerFunc(s.updateRCON)))
	mux.Handle("GET /api/v1/servers/{serverId}/grants", s.require("grants.manage", http.HandlerFunc(s.serverGrants)))
	mux.Handle("PUT /api/v1/servers/{serverId}/grants/{userId}", s.require("grants.manage", http.HandlerFunc(s.setServerGrant)))
	mux.Handle("DELETE /api/v1/servers/{serverId}/grants/{userId}", s.require("grants.manage", http.HandlerFunc(s.revokeServerGrant)))
	mux.Handle("GET /api/v1/fleet/audit", s.require("fleet.audit.read", http.HandlerFunc(s.auditLog)))
	mux.Handle("GET /api/v1/fleet/audit/export", s.require("fleet.audit.read", http.HandlerFunc(s.auditExport)))
	mux.Handle("GET /api/v1/fleet/users", s.require("fleet.users.manage", http.HandlerFunc(s.users)))
	mux.Handle("POST /api/v1/fleet/users", s.require("fleet.users.manage", http.HandlerFunc(s.createUser)))
	mux.Handle("DELETE /api/v1/fleet/users/{id}", s.require("fleet.users.manage", http.HandlerFunc(s.disableUser)))
	mux.Handle("POST /api/v1/fleet/users/{id}/revoke-sessions", s.require("fleet.users.manage", http.HandlerFunc(s.revokeUserSessions)))
	mux.Handle("PUT /api/v1/fleet/users/{id}/fleet-owner", s.require("fleet.users.manage", http.HandlerFunc(s.setFleetOwner)))
	mux.Handle("/", webui.Handler())
	return s.recoverMiddleware(s.securityHeaders(s.requestLog(mux)))
}

func (s *Server) openAPI(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = w.Write(openAPISpec)
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "product": config.ProductName})
}
