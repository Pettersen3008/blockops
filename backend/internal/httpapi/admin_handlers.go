package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/auth"
	"github.com/blockops-dashboard/blockops/backend/internal/minecraft"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

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
