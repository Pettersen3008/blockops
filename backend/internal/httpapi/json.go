package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

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
