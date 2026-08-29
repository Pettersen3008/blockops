package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func (s *Store) WriteAudit(ctx context.Context, event AuditEvent) error {
	if event.ID == "" {
		var err error
		event.ID, err = NewID()
		if err != nil {
			return err
		}
	}
	if event.OccurredAt.IsZero() {
		event.OccurredAt = time.Now().UTC()
	}
	details, err := json.Marshal(event.Details)
	if err != nil {
		return fmt.Errorf("encode audit details: %w", err)
	}
	if event.PrincipalKind == "" {
		event.PrincipalKind = PrincipalUser
	}
	if event.Attempt < 1 {
		event.Attempt = 1
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO audit_events(id,occurred_at,user_id,username,action,target,source_ip,outcome,details_json,principal_kind,principal_id,server_id,node_id,request_id,job_id,attempt)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, event.ID, formatAuditTime(event.OccurredAt), nullable(event.UserID), event.Username, event.Action, event.Target, event.SourceIP, event.Outcome, string(details),
		event.PrincipalKind, nullable(event.PrincipalID), nullable(event.ServerID), nullable(event.NodeID), nullable(event.RequestID), nullable(event.JobID), event.Attempt)
	if err != nil {
		return fmt.Errorf("write audit event: %w", err)
	}
	return nil
}

func (s *Store) ListAudit(ctx context.Context, query AuditQuery) (AuditPage, error) {
	conditions := []string{"1=1"}
	arguments := make([]any, 0, 10)
	if query.ServerID != "" {
		conditions = append(conditions, "server_id = ?")
		arguments = append(arguments, query.ServerID)
	}
	if query.Filter.Outcome != AuditOutcomeAll {
		conditions = append(conditions, "outcome = ?")
		arguments = append(arguments, query.Filter.Outcome)
	}
	if query.Filter.Search != "" {
		conditions = append(conditions, `(instr(lower(username), lower(?)) > 0
OR instr(lower(action), lower(?)) > 0
OR instr(lower(target), lower(?)) > 0
OR instr(lower(source_ip), lower(?)) > 0
OR instr(lower(COALESCE(NULLIF(details_json, 'null'), '{}')), lower(?)) > 0)`)
		for range 5 {
			arguments = append(arguments, query.Filter.Search)
		}
	}
	if query.Before != nil {
		conditions = append(conditions, "(occurred_at < ? OR (occurred_at = ? AND id < ?))")
		occurred := formatAuditTime(query.Before.OccurredAt)
		arguments = append(arguments, occurred, occurred, query.Before.ID)
	}
	arguments = append(arguments, query.Limit+1)
	statement := `SELECT id,occurred_at,COALESCE(user_id,''),username,action,target,source_ip,outcome,details_json,
principal_kind,COALESCE(principal_id,''),COALESCE(server_id,''),COALESCE(node_id,''),COALESCE(request_id,''),COALESCE(job_id,''),attempt
FROM audit_events WHERE ` + strings.Join(conditions, " AND ") + `
ORDER BY occurred_at DESC, id DESC LIMIT ?`
	rows, err := s.db.QueryContext(ctx, statement, arguments...)
	if err != nil {
		return AuditPage{}, fmt.Errorf("list audit events: %w", err)
	}
	defer rows.Close()
	events := make([]AuditEvent, 0, query.Limit+1)
	for rows.Next() {
		var event AuditEvent
		var occurred, details string
		if err := rows.Scan(&event.ID, &occurred, &event.UserID, &event.Username, &event.Action, &event.Target, &event.SourceIP, &event.Outcome, &details,
			&event.PrincipalKind, &event.PrincipalID, &event.ServerID, &event.NodeID, &event.RequestID, &event.JobID, &event.Attempt); err != nil {
			return AuditPage{}, fmt.Errorf("scan audit event: %w", err)
		}
		event.OccurredAt = parseTime(occurred)
		_ = json.Unmarshal([]byte(details), &event.Details)
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return AuditPage{}, err
	}
	page := AuditPage{Events: events}
	if len(events) > query.Limit {
		page.Events = events[:query.Limit]
		last := page.Events[len(page.Events)-1]
		page.Next = &AuditCursor{OccurredAt: last.OccurredAt, ID: last.ID}
	}
	return page, nil
}
