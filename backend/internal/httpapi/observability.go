package httpapi

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

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
