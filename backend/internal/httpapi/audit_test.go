package httpapi

import (
	"context"
	"encoding/csv"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/blockops-dashboard/blockops/backend/internal/config"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

func TestParseAuditRequestGivenUntrustedValuesWhenParsingThenRejectsInvalidInput(t *testing.T) {
	t.Parallel()
	cursor, err := encodeAuditCursor(store.AuditCursor{
		OccurredAt: time.Date(2026, time.August, 29, 12, 0, 0, 1, time.UTC),
		ID:         "00000000000000000000000000000001",
	})
	if err != nil {
		t.Fatal(err)
	}
	request, err := parseAuditRequest(url.Values{"q": {" backup "}, "outcome": {"failure"}, "limit": {"25"}, "cursor": {cursor}})
	if err != nil || request.Limit != 25 || request.Filter.Search != "backup" || request.Filter.Outcome != store.AuditOutcomeFailure || request.Before == nil {
		t.Fatalf("parseAuditRequest() = %+v, %v", request, err)
	}
	for name, values := range map[string]url.Values{
		"duplicate": {"q": {"one", "two"}},
		"limit":     {"limit": {"0"}},
		"outcome":   {"outcome": {"unknown"}},
		"search":    {"q": {strings.Repeat("x", auditMaxSearchRunes+1)}},
		"cursor":    {"cursor": {"not-base64"}},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := parseAuditRequest(values); err == nil {
				t.Fatal("expected invalid audit query to fail")
			}
		})
	}
}

func TestAuditExportGivenFilteredRowsWhenDownloadingThenCapsAndEscapesCSV(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := store.Open(ctx, filepath.Join(t.TempDir(), "blockops.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	now := time.Date(2026, time.August, 29, 12, 0, 0, 0, time.UTC)
	for _, event := range []store.AuditEvent{
		{ID: "00000000000000000000000000000002", OccurredAt: now.Add(time.Second), Username: "ignored", Action: "backup.create", Target: "world", SourceIP: "127.0.0.1", Outcome: "success"},
		{ID: "00000000000000000000000000000001", OccurredAt: now, Username: "=admin", Action: "+backup.restore", Target: "-world", SourceIP: "@source", Outcome: "failure", Details: map[string]any{"command": "[REDACTED]"}},
	} {
		if err := database.WriteAudit(ctx, event); err != nil {
			t.Fatal(err)
		}
	}
	server := &Server{
		config: config.Config{MaxAuditExportRows: 1},
		store:  database,
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/audit/export?q=backup&outcome=failure", nil)
	response := httptest.NewRecorder()
	server.auditExport(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Header().Get("Content-Disposition"), "blockops-audit-") {
		t.Fatalf("export response = %d, %v", response.Code, response.Header())
	}
	records, err := csv.NewReader(response.Body).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || records[1][3] != "'=admin" || records[1][4] != "'+backup.restore" || records[1][5] != "'-world" || records[1][6] != "'@source" || !strings.Contains(records[1][8], "[REDACTED]") {
		t.Fatalf("export records = %#v", records)
	}
	for _, value := range []string{"=x", "+x", "-x", "@x", "\tx", "\rx", "\nx"} {
		if got := spreadsheetSafe(value); got != "'"+value {
			t.Fatalf("spreadsheetSafe(%q) = %q", value, got)
		}
	}
}
