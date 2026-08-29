package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/auth"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

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
