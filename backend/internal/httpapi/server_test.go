package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/auth"
	"github.com/blockops-dashboard/blockops/backend/internal/config"
	"github.com/blockops-dashboard/blockops/backend/internal/console"
	"github.com/blockops-dashboard/blockops/backend/internal/operations"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
	"github.com/coder/websocket"
)

func TestSetupSessionCSRFAndBackendAuthorization(t *testing.T) {
	database := openTestStore(t, context.Background())
	defer database.Close()
	cfg := config.Config{CookieSecure: false, SessionTTL: time.Hour, MinecraftDataDir: t.TempDir(), BackupDir: t.TempDir(), WorldName: "world", MinecraftContainer: "minecraft"}
	server, err := New(cfg, database, nil, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	handler := server.Handler()

	setupRequest := httptest.NewRequest(http.MethodPost, "/api/v1/setup", strings.NewReader(`{"username":"admin","password":"Strong setup pass 42!"}`))
	setupResponse := httptest.NewRecorder()
	handler.ServeHTTP(setupResponse, setupRequest)
	if setupResponse.Code != http.StatusCreated {
		t.Fatalf("setup status = %d, body = %s", setupResponse.Code, setupResponse.Body.String())
	}
	var session struct {
		CSRFToken string `json:"csrfToken"`
	}
	if err := json.Unmarshal(setupResponse.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	setCookie := setupResponse.Header().Get("Set-Cookie")
	if !strings.Contains(setCookie, "HttpOnly") || !strings.Contains(setCookie, "SameSite=Lax") {
		t.Fatalf("session cookie lacks security attributes: %s", setCookie)
	}
	cookie := setupResponse.Result().Cookies()[0]

	secondSetup := httptest.NewRequest(http.MethodPost, "/api/v1/setup", strings.NewReader(`{"username":"other","password":"Another strong pass 42!"}`))
	secondResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondResponse, secondSetup)
	if secondResponse.Code != http.StatusConflict {
		t.Fatalf("second setup status = %d", secondResponse.Code)
	}

	logoutWithoutCSRF := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	logoutWithoutCSRF.AddCookie(cookie)
	logoutDenied := httptest.NewRecorder()
	handler.ServeHTTP(logoutDenied, logoutWithoutCSRF)
	if logoutDenied.Code != http.StatusForbidden {
		t.Fatalf("logout without CSRF status = %d", logoutDenied.Code)
	}

	viewerID, _ := store.NewID()
	if err := database.CreateUser(context.Background(), store.User{ID: viewerID, Username: "viewer", PasswordHash: "unused", Role: string(auth.Viewer), CreatedAt: time.Now().UTC()}, "test"); err != nil {
		t.Fatal(err)
	}
	viewerToken := "viewer-session-token"
	if err := database.CreateSession(context.Background(), store.Session{IDHash: store.TokenHash(viewerToken), CSRFToken: "viewer-csrf", CreatedAt: time.Now().UTC(), ExpiresAt: time.Now().Add(time.Hour)}, viewerID); err != nil {
		t.Fatal(err)
	}
	commandRequest := httptest.NewRequest(http.MethodPost, "/api/v1/console/commands", bytes.NewBufferString(`{"command":"say should not run"}`))
	commandRequest.AddCookie(&http.Cookie{Name: sessionCookie, Value: viewerToken})
	commandRequest.Header.Set("X-CSRF-Token", "viewer-csrf")
	commandResponse := httptest.NewRecorder()
	handler.ServeHTTP(commandResponse, commandRequest)
	if commandResponse.Code != http.StatusForbidden {
		t.Fatalf("viewer command status = %d, body = %s", commandResponse.Code, commandResponse.Body.String())
	}

	logoutRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	logoutRequest.AddCookie(cookie)
	logoutRequest.Header.Set("X-CSRF-Token", session.CSRFToken)
	logoutResponse := httptest.NewRecorder()
	handler.ServeHTTP(logoutResponse, logoutRequest)
	if logoutResponse.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d, body = %s", logoutResponse.Code, logoutResponse.Body.String())
	}
}

func TestGivenConfiguredProxyOriginWhenConnectingThenAcceptsWebSocket(t *testing.T) {
	server := &Server{
		config:     config.Config{PublicOrigin: "http://localhost:5173"},
		operations: &operations.Service{Console: console.New("unused", 100)},
	}
	httpServer := httptest.NewServer(http.HandlerFunc(server.consoleWebSocket))
	defer httpServer.Close()

	connection, response, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(httpServer.URL, "http"),
		&websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"http://localhost:5173"}}},
	)
	if err != nil {
		t.Fatalf("dial failed with status %d: %v", response.StatusCode, err)
	}
	defer connection.CloseNow()
}

func TestSourceIPWalksForwardedChainFromTrustedProxy(t *testing.T) {
	t.Parallel()
	_, trustedNetwork, err := net.ParseCIDR("10.0.0.0/8")
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{config: config.Config{TrustedProxies: []*net.IPNet{trustedNetwork}}}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "10.1.2.3:49152"
	request.Header.Set("X-Forwarded-For", "203.0.113.99, 198.51.100.25")
	if got := server.sourceIP(request); got != "198.51.100.25" {
		t.Fatalf("sourceIP() = %q, want nearest untrusted hop", got)
	}
}

func TestSourceIPIgnoresForwardingFromUntrustedPeer(t *testing.T) {
	t.Parallel()
	server := &Server{}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "192.0.2.10:49152"
	request.Header.Set("X-Forwarded-For", "203.0.113.99")
	if got := server.sourceIP(request); got != "192.0.2.10" {
		t.Fatalf("sourceIP() = %q, want direct peer", got)
	}
}

func openTestStore(t *testing.T, ctx context.Context) *store.Store {
	t.Helper()
	database, err := store.Open(ctx, filepath.Join(t.TempDir(), "blockops.db"), store.Adoption{
		DockerBaseURL: "http://docker-proxy:2375", ContainerName: "minecraft",
		DataDir: "/minecraft", BackupDir: "/backups", WorldName: "world", RCONAddress: "minecraft:25575",
	})
	if err != nil {
		t.Fatal(err)
	}
	return database
}
