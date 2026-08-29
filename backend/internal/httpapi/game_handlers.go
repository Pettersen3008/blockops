package httpapi

import (
	"context"
	"net/http"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/operations"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

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
