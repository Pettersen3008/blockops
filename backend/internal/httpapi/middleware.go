package httpapi

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/auth"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

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
