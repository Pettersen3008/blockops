package httpapi

import (
	"bufio"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/auth"
	"github.com/blockops-dashboard/blockops/backend/internal/config"
	"github.com/blockops-dashboard/blockops/backend/internal/minecraft"
	"github.com/blockops-dashboard/blockops/backend/internal/operations"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
	"github.com/blockops-dashboard/blockops/backend/internal/webui"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
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

func (s *Server) setupStatus(w http.ResponseWriter, r *http.Request) {
	required, err := s.store.NeedsSetup(r.Context())
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"required": required})
}

func (s *Server) setup(w http.ResponseWriter, r *http.Request) {
	if !s.validRequestOrigin(r) {
		writeError(w, http.StatusForbidden, "origin_denied", "Request origin is not allowed.")
		return
	}
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(w, r, 8<<10, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	source := s.sourceIP(r)
	key := "setup:" + source
	if allowed, retry := s.limiter.Allow(key, time.Now()); !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(max(1, int(retry.Seconds()))))
		writeError(w, http.StatusTooManyRequests, "rate_limited", "Too many attempts. Try again later.")
		return
	}
	if err := auth.ValidateUsername(input.Username); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_username", err.Error())
		return
	}
	if err := auth.ValidatePassword(input.Password); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "weak_password", err.Error())
		return
	}
	hash, err := auth.HashPassword(input.Password)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	id, err := store.NewID()
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	user := store.User{ID: id, Username: input.Username, PasswordHash: hash, Role: string(auth.Administrator), FleetOwner: true, CreatedAt: time.Now().UTC()}
	if err := s.store.CreateInitialUser(r.Context(), user); err != nil {
		if errors.Is(err, store.ErrAlreadyExists) {
			writeError(w, http.StatusConflict, "setup_complete", "Initial setup has already been completed.")
			return
		}
		s.internalError(w, r, err)
		return
	}
	issued, err := s.sessions.Issue(r.Context(), user.ID, time.Now().UTC())
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	s.setSessionCookie(w, issued)
	s.limiter.Reset(key)
	s.audit(r, "auth.setup", "dashboard", "success", map[string]any{"username": user.Username}, &user)
	writeJSON(w, http.StatusCreated, s.sessionResponse(user, issued.CSRFToken, issued.ExpiresAt))
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if !s.validRequestOrigin(r) {
		writeError(w, http.StatusForbidden, "origin_denied", "Request origin is not allowed.")
		return
	}
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(w, r, 8<<10, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	source := s.sourceIP(r)
	key := source + ":" + strings.ToLower(strings.TrimSpace(input.Username))
	if allowed, retry := s.limiter.Allow(key, time.Now()); !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(max(1, int(retry.Seconds()))))
		s.audit(r, "auth.login", "dashboard", "denied", map[string]any{"username": input.Username, "reason": "rate_limited"}, nil)
		writeError(w, http.StatusTooManyRequests, "rate_limited", "Too many attempts. Try again later.")
		return
	}
	user, err := s.store.UserByUsername(r.Context(), input.Username)
	valid := err == nil && !user.Disabled && auth.VerifyPassword(input.Password, user.PasswordHash)
	if errors.Is(err, store.ErrNotFound) {
		_ = auth.VerifyPassword(input.Password, s.dummyHash)
	}
	if !valid {
		s.audit(r, "auth.login", "dashboard", "failure", map[string]any{"username": input.Username}, nil)
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Username or password is incorrect.")
		return
	}
	issued, err := s.sessions.Issue(r.Context(), user.ID, time.Now().UTC())
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	s.setSessionCookie(w, issued)
	s.limiter.Reset(key)
	s.audit(r, "auth.login", "dashboard", "success", nil, &user)
	writeJSON(w, http.StatusOK, s.sessionResponse(user, issued.CSRFToken, issued.ExpiresAt))
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	session := sessionFrom(r.Context())
	writeJSON(w, http.StatusOK, s.sessionResponse(session.User, session.CSRFToken, session.ExpiresAt))
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if !s.validCSRF(r) {
		writeError(w, http.StatusForbidden, "csrf_failed", "The security token is missing or invalid.")
		return
	}
	token, _ := r.Context().Value(tokenKey).(string)
	if err := s.store.RevokeSession(r.Context(), token, time.Now().UTC()); err != nil {
		s.internalError(w, r, err)
		return
	}
	s.clearSessionCookie(w)
	s.audit(r, "auth.logout", "dashboard", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) reauthenticate(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	var input struct {
		Password string `json:"password"`
	}
	if err := decodeJSON(w, r, 4<<10, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	session := sessionFrom(r.Context())
	key := "reauth:" + session.User.ID + ":" + s.sourceIP(r)
	if allowed, retry := s.limiter.Allow(key, time.Now()); !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(max(1, int(retry.Seconds()))))
		writeError(w, http.StatusTooManyRequests, "rate_limited", "Too many attempts. Try again later.")
		return
	}
	if !auth.VerifyPassword(input.Password, session.User.PasswordHash) {
		s.audit(r, "auth.reauthenticate", "session", "failure", nil, nil)
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Password is incorrect.")
		return
	}
	now := time.Now().UTC()
	token, _ := r.Context().Value(tokenKey).(string)
	if err := s.store.ReauthenticateSession(r.Context(), token, now); err != nil {
		s.internalError(w, r, err)
		return
	}
	s.limiter.Reset(key)
	s.audit(r, "auth.reauthenticate", "session", "success", nil, nil)
	writeJSON(w, http.StatusOK, map[string]time.Time{"authenticatedAt": now})
}

func (s *Server) servers(w http.ResponseWriter, r *http.Request) {
	user := sessionFrom(r.Context()).User
	servers, err := s.store.ListServers(r.Context(), user.ID, user.FleetOwner)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"servers": servers})
}

func (s *Server) overview(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.operations.Overview(r.Context()))
}

func (s *Server) consoleHistory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"lines": s.operations.Console.History(1000)})
}

func (s *Server) consoleWebSocket(w http.ResponseWriter, r *http.Request) {
	if !s.validWebSocketOrigin(r) {
		writeError(w, http.StatusForbidden, "origin_denied", "WebSocket origin is not allowed.")
		return
	}
	connection, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		CompressionMode:    websocket.CompressionDisabled,
		InsecureSkipVerify: true, // validWebSocketOrigin already checks the configured browser origin before a proxy changes Host.
	})
	if err != nil {
		return
	}
	defer connection.Close(websocket.StatusNormalClosure, "console closed")
	lines, cancel := s.operations.Console.Subscribe()
	defer cancel()
	recheck := time.NewTicker(consoleGrantRecheck)
	defer recheck.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-recheck.C:
			if !s.consoleStillAllowed(r) {
				connection.Close(websocket.StatusPolicyViolation, "console access revoked")
				return
			}
		case line, open := <-lines:
			if !open {
				return
			}
			writeContext, writeCancel := context.WithTimeout(r.Context(), 10*time.Second)
			err := wsjson.Write(writeContext, connection, line)
			writeCancel()
			if err != nil {
				return
			}
		}
	}
}

// consoleStillAllowed re-reads the session as well as the grant, because a
// disabled account, a revoked session, and a removed grant all have to end the
// stream and only a fresh read sees any of them.
func (s *Server) consoleStillAllowed(r *http.Request) bool {
	token, _ := r.Context().Value(tokenKey).(string)
	session, err := s.store.SessionByToken(r.Context(), token, time.Now().UTC())
	if err != nil {
		return false
	}
	decision, err := s.decide(r.Context(), session.User, r.PathValue("serverId"), "console.read")
	return err == nil && decision.Allowed
}

func (s *Server) consoleCommand(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	var input struct {
		Command string `json:"command"`
	}
	if err := decodeJSON(w, r, 16<<10, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	redacted := operations.RedactCommand(input.Command)
	response, err := s.operations.ExecuteCommand(r.Context(), input.Command)
	if err != nil {
		s.audit(r, "console.command", s.config.MinecraftContainer, "failure", map[string]any{"command": redacted, "error": safeOutcome(err)}, nil)
		writeError(w, http.StatusBadGateway, "command_failed", "Minecraft did not accept the command.")
		return
	}
	s.audit(r, "console.command", s.config.MinecraftContainer, "success", map[string]any{"command": redacted}, nil)
	writeJSON(w, http.StatusOK, map[string]string{"response": response})
}

func (s *Server) players(w http.ResponseWriter, r *http.Request) {
	players, err := s.operations.Players(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "players_unavailable", "Player data is currently unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"players": players})
}

func (s *Server) playerAction(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	var input struct {
		Action string `json:"action"`
		Name   string `json:"name"`
		Reason string `json:"reason"`
	}
	if err := decodeJSON(w, r, 16<<10, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	response, err := s.operations.PlayerAction(r.Context(), input.Action, input.Name, input.Reason)
	details := map[string]any{"action": input.Action, "player": input.Name}
	if err != nil {
		details["error"] = safeOutcome(err)
		s.audit(r, "player.manage", input.Name, "failure", details, nil)
		writeError(w, http.StatusBadGateway, "player_action_failed", "The Minecraft player action failed.")
		return
	}
	s.audit(r, "player.manage", input.Name, "success", details, nil)
	writeJSON(w, http.StatusOK, map[string]string{"response": response})
}

func (s *Server) backups(w http.ResponseWriter, r *http.Request) {
	backups, err := s.store.ListBackups(r.Context())
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"backups": backups})
}

func (s *Server) createBackup(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	user := sessionFrom(r.Context()).User
	backup, err := s.operations.CreateBackup(r.Context(), user.Username)
	if err != nil {
		s.audit(r, "backup.create", s.config.WorldName, "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusServiceUnavailable, "backup_failed", "The backup could not be created safely.")
		return
	}
	s.audit(r, "backup.create", backup.ID, "success", map[string]any{"sizeBytes": backup.SizeBytes}, nil)
	writeJSON(w, http.StatusCreated, backup)
}

func (s *Server) deleteBackup(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	id := r.PathValue("id")
	if err := s.operations.DeleteBackup(r.Context(), id); err != nil {
		s.audit(r, "backup.delete", id, "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusNotFound, "backup_not_found", "The backup was not found.")
		return
	}
	s.audit(r, "backup.delete", id, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) downloadBackup(w http.ResponseWriter, r *http.Request) {
	backup, path, err := s.operations.BackupPath(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "backup_not_found", "The backup was not found.")
		return
	}
	file, err := os.Open(path)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="blockops-backup-%s.tar.gz"`, backup.ID))
	w.Header().Set("Content-Type", "application/gzip")
	s.audit(r, "backup.download", backup.ID, "success", nil, nil)
	http.ServeContent(w, r, filepath.Base(path), info.ModTime(), file)
}

func (s *Server) restoreBackup(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	id := r.PathValue("id")
	if err := s.operations.RestoreBackup(r.Context(), id); err != nil {
		s.audit(r, "backup.restore", id, "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusServiceUnavailable, "restore_failed", "The backup could not be restored. The prior world was preserved when possible.")
		return
	}
	s.audit(r, "backup.restore", id, "success", nil, nil)
	writeJSON(w, http.StatusOK, map[string]string{"status": "restored"})
}

func (s *Server) downloadWorld(w http.ResponseWriter, r *http.Request) {
	path, err := s.operations.PrepareWorldDownload(r.Context())
	if err != nil {
		s.audit(r, "world.download", s.config.WorldName, "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusServiceUnavailable, "world_download_failed", "A consistent world archive could not be prepared.")
		return
	}
	defer os.Remove(path)
	file, err := os.Open(path)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s-%s.tar.gz"`, s.config.WorldName, time.Now().UTC().Format("20060102-150405")))
	w.Header().Set("Content-Type", "application/gzip")
	s.audit(r, "world.download", s.config.WorldName, "success", map[string]any{"sizeBytes": info.Size()}, nil)
	http.ServeContent(w, r, filepath.Base(path), info.ModTime(), file)
}

func (s *Server) replaceWorld(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	if r.ContentLength > s.config.MaxUploadBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "upload_too_large", "The world ZIP exceeds the configured upload limit.")
		return
	}
	if err := os.MkdirAll(s.config.BackupDir, 0o750); err != nil {
		s.internalError(w, r, err)
		return
	}
	temporary, err := os.CreateTemp(s.config.BackupDir, ".blockops-upload-*.zip")
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	path := temporary.Name()
	defer os.Remove(path)
	r.Body = http.MaxBytesReader(w, r.Body, s.config.MaxUploadBytes)
	_, copyErr := io.Copy(temporary, r.Body)
	closeErr := temporary.Close()
	if copyErr != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "upload_too_large", "The world ZIP exceeds the configured upload limit.")
		return
	}
	if closeErr != nil {
		s.internalError(w, r, closeErr)
		return
	}
	if err := s.operations.ReplaceWorldZip(r.Context(), path); err != nil {
		s.audit(r, "world.replace", s.config.WorldName, "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusUnprocessableEntity, "world_replace_failed", "The uploaded ZIP was unsafe or could not replace the world.")
		return
	}
	s.audit(r, "world.replace", s.config.WorldName, "success", nil, nil)
	writeJSON(w, http.StatusOK, map[string]string{"status": "replaced"})
}

func (s *Server) serverAction(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	var input struct {
		Action string `json:"action"`
	}
	if err := decodeJSON(w, r, 4<<10, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	permission, known := auth.ServerActionPermission(input.Action)
	if !known {
		writeError(w, http.StatusUnprocessableEntity, "invalid_action", "The server action must be start, stop, or restart.")
		return
	}
	if !s.authorize(w, r, permission) {
		return
	}
	if err := s.operations.ContainerAction(r.Context(), input.Action); err != nil {
		s.audit(r, permission, s.config.MinecraftContainer, "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusServiceUnavailable, "server_action_failed", "The configured Minecraft container could not be changed.")
		return
	}
	s.audit(r, permission, s.config.MinecraftContainer, "success", nil, nil)
	writeJSON(w, http.StatusAccepted, map[string]string{"status": input.Action + " requested"})
}

func (s *Server) users(w http.ResponseWriter, r *http.Request) {
	users, err := s.store.ListUsers(r.Context())
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *Server) serverGrants(w http.ResponseWriter, r *http.Request) {
	grants, err := s.store.ListServerGrants(r.Context(), r.PathValue("serverId"))
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"grants": grants})
}

func (s *Server) setServerGrant(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	var input struct {
		Role string `json:"role"`
	}
	if err := decodeJSON(w, r, 4<<10, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	role, err := auth.ParseRole(input.Role)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_role", err.Error())
		return
	}
	target, err := s.store.UserByID(r.Context(), r.PathValue("userId"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "user_not_found", "The user was not found.")
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if target.Disabled {
		writeError(w, http.StatusConflict, "user_disabled", "A disabled user cannot receive a grant.")
		return
	}
	actor := sessionFrom(r.Context()).User
	now := time.Now().UTC()
	if err := s.store.SetServerGrant(r.Context(), r.PathValue("serverId"), target.ID, string(role), actor.ID, now); err != nil {
		s.internalError(w, r, err)
		return
	}
	s.audit(r, "server.grant.set", target.ID, "success", map[string]any{"username": target.Username, "role": role}, nil)
	writeJSON(w, http.StatusOK, store.ServerGrant{UserID: target.ID, Username: target.Username, Role: string(role), GrantedBy: actor.ID, GrantedAt: now})
}

func (s *Server) revokeServerGrant(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	targetID := r.PathValue("userId")
	if err := s.store.RevokeServerGrant(r.Context(), r.PathValue("serverId"), targetID); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "grant_not_found", "The grant was not found.")
		return
	} else if err != nil {
		s.internalError(w, r, err)
		return
	}
	s.audit(r, "server.grant.revoke", targetID, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := decodeJSON(w, r, 8<<10, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	role, roleErr := auth.ParseRole(input.Role)
	if err := auth.ValidateUsername(input.Username); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_username", err.Error())
		return
	}
	if err := auth.ValidatePassword(input.Password); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "weak_password", err.Error())
		return
	}
	if roleErr != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_role", roleErr.Error())
		return
	}
	hash, err := auth.HashPassword(input.Password)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	id, err := store.NewID()
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	user := store.User{ID: id, Username: input.Username, PasswordHash: hash, Role: string(role), CreatedAt: time.Now().UTC()}
	if err := s.store.CreateUser(r.Context(), user, sessionFrom(r.Context()).User.ID); err != nil {
		if errors.Is(err, store.ErrAlreadyExists) {
			writeError(w, http.StatusConflict, "username_exists", "That username already exists.")
			return
		}
		s.internalError(w, r, err)
		return
	}
	s.audit(r, "user.create", user.ID, "success", map[string]any{"username": user.Username, "role": user.Role}, nil)
	writeJSON(w, http.StatusCreated, user)
}

func (s *Server) disableUser(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	targetID := r.PathValue("id")
	current := sessionFrom(r.Context()).User
	if targetID == current.ID {
		writeError(w, http.StatusConflict, "cannot_disable_self", "You cannot disable your own account.")
		return
	}
	target, err := s.store.UserByID(r.Context(), targetID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user_not_found", "The user was not found.")
		return
	}
	if err := s.store.DisableUser(r.Context(), targetID); err != nil {
		if errors.Is(err, store.ErrLastFleetOwner) {
			writeError(w, http.StatusConflict, "last_fleet_owner", "The final fleet owner cannot be disabled.")
			return
		}
		s.internalError(w, r, err)
		return
	}
	s.audit(r, "user.disable", targetID, "success", map[string]any{"username": target.Username}, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) setFleetOwner(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) || !s.requireRecentAuthentication(w, r) {
		return
	}
	var input struct {
		FleetOwner *bool `json:"fleetOwner"`
	}
	if err := decodeJSON(w, r, 4<<10, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if input.FleetOwner == nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "fleetOwner is required.")
		return
	}
	target, err := s.store.UserByID(r.Context(), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "user_not_found", "The user was not found.")
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if target.Disabled && *input.FleetOwner {
		writeError(w, http.StatusConflict, "user_disabled", "A disabled user cannot become a fleet owner.")
		return
	}
	if err := s.store.SetFleetOwner(r.Context(), target.ID, *input.FleetOwner); errors.Is(err, store.ErrLastFleetOwner) {
		writeError(w, http.StatusConflict, "last_fleet_owner", "The final fleet owner cannot be removed.")
		return
	} else if err != nil {
		s.internalError(w, r, err)
		return
	}
	target.FleetOwner = *input.FleetOwner
	s.audit(r, "fleet.owner.set", target.ID, "success", map[string]any{"username": target.Username, "fleetOwner": target.FleetOwner}, nil)
	writeJSON(w, http.StatusOK, target)
}

func (s *Server) revokeUserSessions(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	targetID := r.PathValue("id")
	if _, err := s.store.UserByID(r.Context(), targetID); err != nil {
		writeError(w, http.StatusNotFound, "user_not_found", "The user was not found.")
		return
	}
	if err := s.store.RevokeUserSessions(r.Context(), targetID); err != nil {
		s.internalError(w, r, err)
		return
	}
	s.audit(r, "user.sessions.revoke", targetID, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) settings(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"rcon": s.integration.Status(),
		"deployment": map[string]any{
			"minecraftContainer": s.config.MinecraftContainer,
			"worldName":          s.config.WorldName,
			"cookieSecure":       s.config.CookieSecure,
			"trustedProxyCount":  len(s.config.TrustedProxies),
			"maxUploadBytes":     s.config.MaxUploadBytes,
		},
	})
}

func (s *Server) updateRCON(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	var input minecraft.Credentials
	if err := decodeJSON(w, r, 8<<10, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if err := s.integration.Update(r.Context(), input); err != nil {
		s.audit(r, "settings.rcon.update", "rcon", "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusUnprocessableEntity, "rcon_update_failed", "RCON credentials were invalid or could not be stored.")
		return
	}
	s.audit(r, "settings.rcon.update", "rcon", "success", map[string]any{"address": input.Address}, nil)
	writeJSON(w, http.StatusOK, s.integration.Status())
}

func (s *Server) authenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(sessionCookie)
		if err != nil || len(cookie.Value) > 256 {
			writeError(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
			return
		}
		session, err := s.store.SessionByToken(r.Context(), cookie.Value, time.Now().UTC())
		if err != nil {
			s.clearSessionCookie(w)
			writeError(w, http.StatusUnauthorized, "unauthenticated", "Your session has expired. Sign in again.")
			return
		}
		ctx := context.WithValue(r.Context(), sessionKey, session)
		ctx = context.WithValue(ctx, tokenKey, cookie.Value)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) require(permission string, next http.Handler) http.Handler {
	return s.authenticated(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.authorize(w, r, permission) {
			return
		}
		next.ServeHTTP(w, r)
	}))
}

// authorize answers 404 when the principal may not learn the server exists and
// 403 when it may. Both statuses are written here, so an unassigned server and an
// invented one are indistinguishable from outside.
func (s *Server) authorize(w http.ResponseWriter, r *http.Request, permission string) bool {
	decision, err := s.decide(r.Context(), sessionFrom(r.Context()).User, r.PathValue("serverId"), permission)
	if err != nil {
		s.internalError(w, r, err)
		return false
	}
	if decision.Allowed {
		return true
	}
	if r.Method != http.MethodGet {
		s.audit(r, "authorization.denied", r.URL.Path, "denied", map[string]any{"permission": permission, "reason": decision.Reason}, nil)
	}
	if !decision.Visible {
		writeError(w, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return false
	}
	writeError(w, http.StatusForbidden, "forbidden", "Your role does not allow this action.")
	return false
}

// decide reads the grant and the server's lifecycle state on the request path
// with nothing cached in front of them, so revoking a grant lands on the
// principal's next request.
func (s *Server) decide(ctx context.Context, user store.User, serverID, permission string) (auth.Decision, error) {
	principal := auth.Principal{ID: user.ID, FleetOwner: user.FleetOwner}
	request := auth.Request{ServerID: serverID, Permission: permission}
	if serverID != "" {
		access, err := s.store.ServerAccess(ctx, serverID, user.ID)
		if errors.Is(err, store.ErrNotFound) {
			// A server that does not exist has to answer exactly like one the principal
			// holds no grant on, including for a fleet owner whose implicit grant would
			// otherwise cover an invented ID.
			return auth.Decision{Reason: "no such server"}, nil
		}
		if err != nil {
			return auth.Decision{}, err
		}
		request.State = auth.ServerState(access.State)
		if access.Role != "" {
			principal.Grants = map[string]auth.Role{serverID: auth.Role(access.Role)}
		}
	}
	return auth.Authorize(principal, request), nil
}

func (s *Server) requireCSRF(w http.ResponseWriter, r *http.Request) bool {
	if !s.validCSRF(r) {
		s.audit(r, "security.csrf", r.URL.Path, "denied", nil, nil)
		writeError(w, http.StatusForbidden, "csrf_failed", "The security token is missing or invalid.")
		return false
	}
	return true
}

func (s *Server) requireRecentAuthentication(w http.ResponseWriter, r *http.Request) bool {
	if time.Since(sessionFrom(r.Context()).AuthenticatedAt) <= reauthenticationWindow {
		return true
	}
	writeError(w, http.StatusForbidden, "reauthentication_required", "Confirm your password before this action.")
	return false
}

func (s *Server) validCSRF(r *http.Request) bool {
	return auth.CSRFMatches(sessionFrom(r.Context()).CSRFToken, r.Header.Get("X-CSRF-Token"))
}

func (s *Server) validWebSocketOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return false
	}
	if s.config.PublicOrigin != "" {
		return strings.EqualFold(strings.TrimRight(origin, "/"), s.config.PublicOrigin)
	}
	return strings.EqualFold(parsed.Host, r.Host)
}

func (s *Server) validRequestOrigin(r *http.Request) bool {
	if strings.EqualFold(r.Header.Get("Sec-Fetch-Site"), "cross-site") {
		return false
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return false
	}
	if s.config.PublicOrigin != "" {
		return strings.EqualFold(strings.TrimRight(origin, "/"), s.config.PublicOrigin)
	}
	return strings.EqualFold(parsed.Host, r.Host)
}

func (s *Server) setSessionCookie(w http.ResponseWriter, issued auth.IssuedSession) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: issued.Token, Path: "/", HttpOnly: true, Secure: s.config.CookieSecure, SameSite: http.SameSiteLaxMode, Expires: issued.ExpiresAt, MaxAge: int(time.Until(issued.ExpiresAt).Seconds())})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", HttpOnly: true, Secure: s.config.CookieSecure, SameSite: http.SameSiteLaxMode, Expires: time.Unix(1, 0), MaxAge: -1})
}

func (s *Server) sourceIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	remoteIP := net.ParseIP(host)
	if remoteIP == nil || !s.trustedProxy(remoteIP) {
		return host
	}
	result := remoteIP.String()
	forwarded := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for index := len(forwarded) - 1; index >= 0; index-- {
		candidate := net.ParseIP(strings.TrimSpace(forwarded[index]))
		if candidate == nil {
			return host
		}
		result = candidate.String()
		if !s.trustedProxy(candidate) {
			return result
		}
	}
	return result
}

func (s *Server) trustedProxy(candidate net.IP) bool {
	for _, network := range s.config.TrustedProxies {
		if network.Contains(candidate) {
			return true
		}
	}
	return false
}

func (s *Server) audit(r *http.Request, action, target, outcome string, details map[string]any, explicitUser *store.User) {
	user := store.User{}
	if explicitUser != nil {
		user = *explicitUser
	} else if session, ok := r.Context().Value(sessionKey).(store.Session); ok {
		user = session.User
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := s.store.WriteAudit(ctx, store.AuditEvent{
		UserID: user.ID, Username: user.Username, Action: action, Target: target,
		SourceIP: s.sourceIP(r), Outcome: outcome, Details: details,
		// A request with no session is the installation acting on itself, not an
		// anonymous user: setup and a failed login both write system-attributed rows.
		PrincipalKind: principalKind(user), PrincipalID: user.ID,
		ServerID: r.PathValue("serverId"), RequestID: requestID(r.Context()),
	}); err != nil {
		s.logger.Error("audit write failed", "error", err, "action", action, "request_id", requestID(r.Context()))
	}
}

func principalKind(user store.User) store.PrincipalKind {
	if user.ID == "" {
		return store.PrincipalSystem
	}
	return store.PrincipalUser
}

func (s *Server) internalError(w http.ResponseWriter, r *http.Request, err error) {
	s.logger.Error("request failed", "error", err, "path", r.URL.Path, "request_id", requestID(r.Context()))
	writeError(w, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.logger.Error("panic recovered", "panic", fmt.Sprint(recovered), "path", r.URL.Path, "request_id", requestID(r.Context()))
				writeError(w, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(body)
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *statusWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("response writer does not support hijacking")
	}
	w.status = http.StatusSwitchingProtocols
	return hijacker.Hijack()
}

func (w *statusWriter) Flush() {
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (s *Server) requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, _ := store.NewID()
		ctx := context.WithValue(r.Context(), requestIDKey, id)
		started := time.Now()
		writer := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(writer, r.WithContext(ctx))
		status := writer.status
		if status == 0 {
			status = http.StatusOK
		}
		s.logger.Info("http request", "method", r.Method, "path", r.URL.Path, "status", status, "duration_ms", time.Since(started).Milliseconds(), "source_ip", s.sourceIP(r), "request_id", id)
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, maximum int64, destination any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maximum)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return errors.New("Request body must be valid JSON with known fields.")
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("Request body must contain one JSON value.")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	var envelope errorEnvelope
	envelope.Error.Code = code
	envelope.Error.Message = message
	writeJSON(w, status, envelope)
}

// ponytail: serverId is the one server a session can address. P2-06 replaces it
// with the list of granted servers once the interface can switch between them.
func (s *Server) sessionResponse(user store.User, csrfToken string, expiresAt time.Time) map[string]any {
	return map[string]any{"user": user, "csrfToken": csrfToken, "expiresAt": expiresAt, "serverId": s.store.AdoptedServerID()}
}

func sessionFrom(ctx context.Context) store.Session {
	session, _ := ctx.Value(sessionKey).(store.Session)
	return session
}

func requestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

func safeOutcome(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	if len(message) > 240 {
		message = message[:240]
	}
	return message
}
