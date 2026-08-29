package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// ServerAccess is one principal's standing on one server: the server's lifecycle
// state and the role granted, empty when nothing is granted.
type ServerAccess struct {
	State string
	Role  string
}

type Server struct {
	ID    string `json:"id"`
	Slug  string `json:"slug"`
	Name  string `json:"name"`
	State string `json:"state"`
}

type ServerGrant struct {
	UserID    string    `json:"userId"`
	Username  string    `json:"username"`
	Role      string    `json:"role"`
	GrantedBy string    `json:"grantedBy"`
	GrantedAt time.Time `json:"grantedAt"`
}

// ServerAccess reads the whole authorization input for one request. It runs on
// every authorized route with no cache in front of it, so revoking a grant lands
// on the principal's next request.
func (s *Store) ServerAccess(ctx context.Context, serverID, userID string) (ServerAccess, error) {
	var access ServerAccess
	err := s.db.QueryRowContext(ctx, `SELECT s.state, COALESCE(g.role,'')
	  FROM servers s LEFT JOIN server_grants g ON g.server_id = s.id AND g.user_id = ?
	  WHERE s.id = ?`, userID, serverID).Scan(&access.State, &access.Role)
	if errors.Is(err, sql.ErrNoRows) {
		return ServerAccess{}, ErrNotFound
	}
	if err != nil {
		return ServerAccess{}, fmt.Errorf("read server access: %w", err)
	}
	return access, nil
}

func (s *Store) ListServers(ctx context.Context, userID string, fleetOwner bool) ([]Server, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT s.id,s.slug,s.name,s.state
	  FROM servers s LEFT JOIN server_grants g ON g.server_id=s.id AND g.user_id=?
	  WHERE s.deleted_at IS NULL AND (? OR g.user_id IS NOT NULL)
	  ORDER BY s.name COLLATE NOCASE`, userID, fleetOwner)
	if err != nil {
		return nil, fmt.Errorf("list servers: %w", err)
	}
	defer rows.Close()
	servers := make([]Server, 0)
	for rows.Next() {
		var server Server
		if err := rows.Scan(&server.ID, &server.Slug, &server.Name, &server.State); err != nil {
			return nil, fmt.Errorf("scan server: %w", err)
		}
		servers = append(servers, server)
	}
	return servers, rows.Err()
}

func (s *Store) ListServerGrants(ctx context.Context, serverID string) ([]ServerGrant, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT g.user_id,u.username,g.role,g.granted_by,g.granted_at
	  FROM server_grants g JOIN users u ON u.id=g.user_id
	  WHERE g.server_id=? ORDER BY u.username COLLATE NOCASE`, serverID)
	if err != nil {
		return nil, fmt.Errorf("list server grants: %w", err)
	}
	defer rows.Close()
	grants := make([]ServerGrant, 0)
	for rows.Next() {
		var grant ServerGrant
		var grantedAt string
		if err := rows.Scan(&grant.UserID, &grant.Username, &grant.Role, &grant.GrantedBy, &grantedAt); err != nil {
			return nil, fmt.Errorf("scan server grant: %w", err)
		}
		grant.GrantedAt = parseTime(grantedAt)
		grants = append(grants, grant)
	}
	return grants, rows.Err()
}

func (s *Store) SetServerGrant(ctx context.Context, serverID, userID, role, grantedBy string, grantedAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO server_grants(user_id,server_id,role,granted_by,granted_at)
	  VALUES(?,?,?,?,?) ON CONFLICT(user_id,server_id) DO UPDATE SET
	  role=excluded.role,granted_by=excluded.granted_by,granted_at=excluded.granted_at`,
		userID, serverID, role, grantedBy, formatTime(grantedAt))
	if err != nil {
		return classifyConflict("set server grant", err)
	}
	return nil
}

func (s *Store) RevokeServerGrant(ctx context.Context, serverID, userID string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM server_grants WHERE server_id=? AND user_id=?`, serverID, userID)
	if err != nil {
		return fmt.Errorf("revoke server grant: %w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return ErrNotFound
	}
	return nil
}
