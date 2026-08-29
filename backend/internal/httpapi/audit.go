package httpapi

import (
	"encoding/base64"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

const (
	auditDefaultPageSize = 100
	auditMaxPageSize     = 500
	auditMaxSearchRunes  = 200
	auditMaxCursorBytes  = 512
	auditTimeLayout      = "2006-01-02T15:04:05.000000000Z"
)

var auditCSVHeader = []string{"occurred_at", "id", "user_id", "username", "action", "target", "source_ip", "outcome", "details"}

type auditRequest struct {
	Filter store.AuditFilter
	Before *store.AuditCursor
	Limit  int
}

type auditPageResponse struct {
	Events     []store.AuditEvent `json:"events"`
	NextCursor *string            `json:"nextCursor"`
}

type auditCursor struct {
	OccurredAt string `json:"t"`
	ID         string `json:"i"`
}

func (s *Server) auditLog(w http.ResponseWriter, r *http.Request) {
	request, err := parseAuditRequest(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	page, err := s.store.ListAudit(r.Context(), store.AuditQuery{Filter: request.Filter, Before: request.Before, Limit: request.Limit})
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	response := auditPageResponse{Events: page.Events}
	if page.Next != nil {
		cursor, err := encodeAuditCursor(*page.Next)
		if err != nil {
			s.internalError(w, r, err)
			return
		}
		response.NextCursor = &cursor
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) auditExport(w http.ResponseWriter, r *http.Request) {
	filter, err := parseAuditFilter(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	limit := min(auditMaxPageSize, s.config.MaxAuditExportRows)
	page, err := s.store.ListAudit(r.Context(), store.AuditQuery{Filter: filter, Limit: limit})
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="blockops-audit-%s.csv"`, time.Now().UTC().Format("20060102-150405")))
	writer := csv.NewWriter(w)
	if err := writer.Write(auditCSVHeader); err != nil {
		return
	}
	exported := 0
	for {
		for _, event := range page.Events {
			record, err := auditCSVRecord(event)
			if err == nil {
				err = writer.Write(record)
			}
			if err != nil {
				s.logger.Error("audit export failed", "error", err, "request_id", requestID(r.Context()))
				return
			}
			exported++
		}
		writer.Flush()
		if err := writer.Error(); err != nil {
			s.logger.Error("audit export failed", "error", err, "request_id", requestID(r.Context()))
			return
		}
		if page.Next == nil || exported >= s.config.MaxAuditExportRows {
			return
		}
		limit = min(auditMaxPageSize, s.config.MaxAuditExportRows-exported)
		page, err = s.store.ListAudit(r.Context(), store.AuditQuery{Filter: filter, Before: page.Next, Limit: limit})
		if err != nil {
			s.logger.Error("audit export failed", "error", err, "request_id", requestID(r.Context()))
			return
		}
	}
}

func parseAuditRequest(values url.Values) (auditRequest, error) {
	filter, err := parseAuditFilter(values)
	if err != nil {
		return auditRequest{}, err
	}
	request := auditRequest{Filter: filter, Limit: auditDefaultPageSize}
	if value, present, err := auditQueryValue(values, "limit"); err != nil {
		return auditRequest{}, err
	} else if present {
		request.Limit, err = strconv.Atoi(value)
		if err != nil || request.Limit < 1 || request.Limit > auditMaxPageSize {
			return auditRequest{}, errors.New("limit must be an integer between 1 and 500")
		}
	}
	if value, present, err := auditQueryValue(values, "cursor"); err != nil {
		return auditRequest{}, err
	} else if present {
		cursor, err := decodeAuditCursor(value)
		if err != nil {
			return auditRequest{}, errors.New("cursor is invalid")
		}
		request.Before = &cursor
	}
	return request, nil
}

func parseAuditFilter(values url.Values) (store.AuditFilter, error) {
	var filter store.AuditFilter
	if value, present, err := auditQueryValue(values, "q"); err != nil {
		return filter, err
	} else if present {
		filter.Search = strings.TrimSpace(value)
		if utf8.RuneCountInString(filter.Search) > auditMaxSearchRunes {
			return filter, errors.New("q must be at most 200 characters")
		}
	}
	if value, present, err := auditQueryValue(values, "outcome"); err != nil {
		return filter, err
	} else if present {
		switch value {
		case "all":
			filter.Outcome = store.AuditOutcomeAll
		case "success":
			filter.Outcome = store.AuditOutcomeSuccess
		case "failure":
			filter.Outcome = store.AuditOutcomeFailure
		case "denied":
			filter.Outcome = store.AuditOutcomeDenied
		default:
			return filter, errors.New("outcome must be all, success, failure, or denied")
		}
	}
	return filter, nil
}

func auditQueryValue(values url.Values, name string) (string, bool, error) {
	all, present := values[name]
	if !present {
		return "", false, nil
	}
	if len(all) != 1 || all[0] == "" {
		return "", false, fmt.Errorf("%s must have one non-empty value", name)
	}
	return all[0], true, nil
}

func encodeAuditCursor(cursor store.AuditCursor) (string, error) {
	payload, err := json.Marshal(auditCursor{OccurredAt: cursor.OccurredAt.UTC().Format(auditTimeLayout), ID: cursor.ID})
	if err != nil {
		return "", fmt.Errorf("encode audit cursor: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(payload), nil
}

func decodeAuditCursor(value string) (store.AuditCursor, error) {
	if len(value) > auditMaxCursorBytes {
		return store.AuditCursor{}, errors.New("cursor is too long")
	}
	payload, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return store.AuditCursor{}, err
	}
	var wire auditCursor
	decoder := json.NewDecoder(strings.NewReader(string(payload)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		return store.AuditCursor{}, err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return store.AuditCursor{}, errors.New("cursor must contain one value")
	}
	occurredAt, err := time.Parse(time.RFC3339Nano, wire.OccurredAt)
	if err != nil || wire.OccurredAt != occurredAt.UTC().Format(auditTimeLayout) {
		return store.AuditCursor{}, errors.New("cursor time is invalid")
	}
	id, err := hex.DecodeString(wire.ID)
	if err != nil || len(id) != 16 || wire.ID != strings.ToLower(wire.ID) {
		return store.AuditCursor{}, errors.New("cursor ID is invalid")
	}
	return store.AuditCursor{OccurredAt: occurredAt, ID: wire.ID}, nil
}

func auditCSVRecord(event store.AuditEvent) ([]string, error) {
	details := event.Details
	if details == nil {
		details = map[string]any{}
	}
	encodedDetails, err := json.Marshal(details)
	if err != nil {
		return nil, fmt.Errorf("encode audit details: %w", err)
	}
	record := []string{
		event.OccurredAt.UTC().Format(time.RFC3339Nano), event.ID, event.UserID, event.Username,
		event.Action, event.Target, event.SourceIP, event.Outcome, string(encodedDetails),
	}
	for index := range record {
		record[index] = spreadsheetSafe(record[index])
	}
	return record, nil
}

func spreadsheetSafe(value string) string {
	if value == "" {
		return value
	}
	switch value[0] {
	case '=', '+', '-', '@', '\t', '\r', '\n':
		return "'" + value
	default:
		return value
	}
}
