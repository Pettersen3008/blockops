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
	"net/url"
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
	commandRequest := httptest.NewRequest(http.MethodPost, "/api/v1/servers/"+database.AdoptedServerID()+"/console/commands", bytes.NewBufferString(`{"command":"say should not run"}`))
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

// The P2-02 exit criterion: an ID the principal holds no grant on answers exactly
// like one that never existed, and a fleet owner's implicit grant over every
// server does not stretch to an invented one.
func TestGivenSubstitutedServerIDWhenRequestingThenAnswersNotFound(t *testing.T) {
	ctx := context.Background()
	database := openTestStore(t, ctx)
	defer database.Close()
	server, err := New(config.Config{SessionTTL: time.Hour}, database, nil, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	cookie := signIn(t, database, "owner", true)

	for name, expected := range map[string]struct {
		serverID string
		status   int
	}{
		"the adopted server": {database.AdoptedServerID(), http.StatusOK},
		"an invented server": {"00000000000000000000000000000000", http.StatusNotFound},
		"an empty server ID": {" ", http.StatusNotFound},
	} {
		t.Run(name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/api/v1/servers/"+url.PathEscape(expected.serverID)+"/backups", nil)
			request.AddCookie(cookie)
			response := httptest.NewRecorder()
			server.Handler().ServeHTTP(response, request)
			if response.Code != expected.status {
				t.Fatalf("status = %d, want %d, body = %s", response.Code, expected.status, response.Body.String())
			}
		})
	}
}

// A socket that outlives its authorization is the one place a revocation could
// wait for a reconnect, so the stream re-reads the session while it is open.
func TestGivenRevokedAccessWhenConsoleSocketIsOpenThenCloses(t *testing.T) {
	ctx := context.Background()
	database := openTestStore(t, ctx)
	defer database.Close()
	previous := consoleGrantRecheck
	consoleGrantRecheck = 20 * time.Millisecond
	defer func() { consoleGrantRecheck = previous }()

	service := &operations.Service{Console: console.New("unused", 100)}
	server, err := New(config.Config{SessionTTL: time.Hour}, database, service, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	httpServer := httptest.NewServer(server.Handler())
	defer httpServer.Close()
	cookie := signIn(t, database, "watcher", false)

	connection, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(httpServer.URL, "http")+"/api/v1/servers/"+database.AdoptedServerID()+"/console/ws",
		&websocket.DialOptions{HTTPHeader: http.Header{
			"Origin": []string{httpServer.URL},
			"Cookie": []string{cookie.Name + "=" + cookie.Value},
		}})
	if err != nil {
		t.Fatal(err)
	}
	defer connection.CloseNow()

	if err := database.DisableUser(ctx, userID(t, database, "watcher")); err != nil {
		t.Fatal(err)
	}
	readContext, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, _, err := connection.Read(readContext); err == nil {
		t.Fatal("socket stayed open after the account lost access")
	}
}

func TestGivenManagedGrantWhenRevokedThenSubjectLosesServerImmediately(t *testing.T) {
	ctx := context.Background()
	database := openTestStore(t, ctx)
	defer database.Close()
	server, err := New(config.Config{SessionTTL: time.Hour}, database, nil, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	handler := server.Handler()
	ownerCookie := signIn(t, database, "owner", true)
	managerCookie := signIn(t, database, "manager", false)
	subjectCookie := signIn(t, database, "subject", false)
	managerID := userID(t, database, "manager")
	subjectID := userID(t, database, "subject")
	managerGrantURL := "/api/v1/servers/" + database.AdoptedServerID() + "/grants/" + managerID
	grantURL := "/api/v1/servers/" + database.AdoptedServerID() + "/grants/" + subjectID

	setRequest := httptest.NewRequest(http.MethodPut, managerGrantURL, strings.NewReader(`{"role":"administrator"}`))
	setRequest.AddCookie(ownerCookie)
	setRequest.Header.Set("X-CSRF-Token", "owner-csrf")
	setResponse := httptest.NewRecorder()
	handler.ServeHTTP(setResponse, setRequest)
	if setResponse.Code != http.StatusOK {
		t.Fatalf("set manager grant status = %d, body = %s", setResponse.Code, setResponse.Body.String())
	}

	setRequest = httptest.NewRequest(http.MethodPut, grantURL, strings.NewReader(`{"role":"operator"}`))
	setRequest.AddCookie(managerCookie)
	setRequest.Header.Set("X-CSRF-Token", "manager-csrf")
	setResponse = httptest.NewRecorder()
	handler.ServeHTTP(setResponse, setRequest)
	if setResponse.Code != http.StatusOK {
		t.Fatalf("server administrator set grant status = %d, body = %s", setResponse.Code, setResponse.Body.String())
	}

	revokeRequest := httptest.NewRequest(http.MethodDelete, grantURL, nil)
	revokeRequest.AddCookie(managerCookie)
	revokeRequest.Header.Set("X-CSRF-Token", "manager-csrf")
	revokeResponse := httptest.NewRecorder()
	handler.ServeHTTP(revokeResponse, revokeRequest)
	if revokeResponse.Code != http.StatusNoContent {
		t.Fatalf("revoke grant status = %d, body = %s", revokeResponse.Code, revokeResponse.Body.String())
	}

	serversRequest := httptest.NewRequest(http.MethodGet, "/api/v1/servers", nil)
	serversRequest.AddCookie(subjectCookie)
	serversResponse := httptest.NewRecorder()
	handler.ServeHTTP(serversResponse, serversRequest)
	if serversResponse.Code != http.StatusOK || serversResponse.Body.String() != "{\"servers\":[]}\n" {
		t.Fatalf("servers response = %d, %s", serversResponse.Code, serversResponse.Body.String())
	}

	backupsRequest := httptest.NewRequest(http.MethodGet, "/api/v1/servers/"+database.AdoptedServerID()+"/backups", nil)
	backupsRequest.AddCookie(subjectCookie)
	backupsResponse := httptest.NewRecorder()
	handler.ServeHTTP(backupsResponse, backupsRequest)
	if backupsResponse.Code != http.StatusNotFound {
		t.Fatalf("revoked access status = %d, body = %s", backupsResponse.Code, backupsResponse.Body.String())
	}
	page, err := database.ListAudit(ctx, store.AuditQuery{ServerID: database.AdoptedServerID(), Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range page.Events {
		if event.Action == "server.grant.revoke" && event.Target == subjectID && event.PrincipalID == managerID {
			return
		}
	}
	t.Fatalf("grant revocation audit = %+v", page.Events)
}

func TestGivenStaleAuthenticationWhenTransferringFleetOwnershipThenRequiresPassword(t *testing.T) {
	ctx := context.Background()
	database := openTestStore(t, ctx)
	defer database.Close()
	password := "Strong transfer pass 42!"
	hash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	owner := store.User{ID: "owner", Username: "owner", PasswordHash: hash, Role: string(auth.Administrator), FleetOwner: true, CreatedAt: time.Now().UTC()}
	if err := database.CreateInitialUser(ctx, owner); err != nil {
		t.Fatal(err)
	}
	target := store.User{ID: "target", Username: "target", PasswordHash: "unused", Role: string(auth.Viewer), CreatedAt: time.Now().UTC()}
	if err := database.CreateUser(ctx, target, owner.ID); err != nil {
		t.Fatal(err)
	}
	created := time.Now().UTC().Add(-time.Hour)
	if err := database.CreateSession(ctx, store.Session{IDHash: store.TokenHash("owner-token"), CSRFToken: "owner-csrf", CreatedAt: created, AuthenticatedAt: created, ExpiresAt: created.Add(2 * time.Hour)}, owner.ID); err != nil {
		t.Fatal(err)
	}
	server, err := New(config.Config{SessionTTL: time.Hour}, database, nil, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	handler := server.Handler()
	cookie := &http.Cookie{Name: sessionCookie, Value: "owner-token"}
	ownerURL := "/api/v1/fleet/users/" + target.ID + "/fleet-owner"

	staleRequest := httptest.NewRequest(http.MethodPut, ownerURL, strings.NewReader(`{"fleetOwner":true}`))
	staleRequest.AddCookie(cookie)
	staleRequest.Header.Set("X-CSRF-Token", "owner-csrf")
	staleResponse := httptest.NewRecorder()
	handler.ServeHTTP(staleResponse, staleRequest)
	if staleResponse.Code != http.StatusForbidden {
		t.Fatalf("stale ownership change status = %d, body = %s", staleResponse.Code, staleResponse.Body.String())
	}

	reauthRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/reauthenticate", strings.NewReader(`{"password":"`+password+`"}`))
	reauthRequest.AddCookie(cookie)
	reauthRequest.Header.Set("X-CSRF-Token", "owner-csrf")
	reauthResponse := httptest.NewRecorder()
	handler.ServeHTTP(reauthResponse, reauthRequest)
	if reauthResponse.Code != http.StatusOK {
		t.Fatalf("reauthentication status = %d, body = %s", reauthResponse.Code, reauthResponse.Body.String())
	}

	transferRequest := httptest.NewRequest(http.MethodPut, ownerURL, strings.NewReader(`{"fleetOwner":true}`))
	transferRequest.AddCookie(cookie)
	transferRequest.Header.Set("X-CSRF-Token", "owner-csrf")
	transferResponse := httptest.NewRecorder()
	handler.ServeHTTP(transferResponse, transferRequest)
	if transferResponse.Code != http.StatusOK {
		t.Fatalf("ownership transfer status = %d, body = %s", transferResponse.Code, transferResponse.Body.String())
	}
	stored, err := database.UserByID(ctx, target.ID)
	if err != nil || !stored.FleetOwner {
		t.Fatalf("target after transfer = %+v, %v", stored, err)
	}
}

// signIn creates an account with a grant on the adopted server and a session
// cookie for it.
func signIn(t *testing.T, database *store.Store, username string, fleetOwner bool) *http.Cookie {
	t.Helper()
	ctx := context.Background()
	id, err := store.NewID()
	if err != nil {
		t.Fatal(err)
	}
	role := auth.Viewer
	if fleetOwner {
		role = auth.Administrator
	}
	user := store.User{ID: id, Username: username, PasswordHash: "unused", Role: string(role), FleetOwner: fleetOwner, CreatedAt: time.Now().UTC()}
	if err := database.CreateUser(ctx, user, "test"); err != nil {
		t.Fatal(err)
	}
	token := username + "-session-token"
	if err := database.CreateSession(ctx, store.Session{IDHash: store.TokenHash(token), CSRFToken: username + "-csrf", CreatedAt: time.Now().UTC(), ExpiresAt: time.Now().Add(time.Hour)}, id); err != nil {
		t.Fatal(err)
	}
	return &http.Cookie{Name: sessionCookie, Value: token}
}

func userID(t *testing.T, database *store.Store, username string) string {
	t.Helper()
	user, err := database.UserByUsername(context.Background(), username)
	if err != nil {
		t.Fatal(err)
	}
	return user.ID
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

// D2-05 makes principal_kind and principal_id the identity authority, so an
// event written from a request has to carry them and the server it was aimed at.
func TestGivenAnAuditedRequestWhenItIsWrittenThenTheEventNamesItsPrincipalAndServer(t *testing.T) {
	ctx := context.Background()
	database := openTestStore(t, ctx)
	defer database.Close()
	server, err := New(config.Config{SessionTTL: time.Hour}, database, nil, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	cookie := signIn(t, database, "viewer", false)

	request := httptest.NewRequest(http.MethodPost, "/api/v1/servers/"+database.AdoptedServerID()+"/backups", nil)
	request.AddCookie(cookie)
	server.Handler().ServeHTTP(httptest.NewRecorder(), request)

	page, err := database.ListAudit(ctx, store.AuditQuery{ServerID: database.AdoptedServerID(), Limit: 10})
	if err != nil || len(page.Events) != 1 {
		t.Fatalf("audit page = %+v, %v", page, err)
	}
	event := page.Events[0]
	user, err := database.UserByUsername(ctx, "viewer")
	if err != nil {
		t.Fatal(err)
	}
	if event.PrincipalKind != store.PrincipalUser || event.PrincipalID != user.ID || event.ServerID != database.AdoptedServerID() || event.RequestID == "" {
		t.Fatalf("audit event = %+v", event)
	}
}
