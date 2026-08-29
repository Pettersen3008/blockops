package auth

// Scoped authorization prototype for Phase 2 decision D2-01. It is the decision
// artifact the roadmap gates ticket writing on, not yet wired into the HTTP
// layer: routes still call Allows until the Phase 2 tickets cut over.

// ServerState gates mutations. A server leaving active still answers reads so
// operators can watch it drain.
type ServerState string

const (
	ServerActive    ServerState = "active"
	ServerSuspended ServerState = "suspended"
	ServerDeleting  ServerState = "deleting"
)

// Principal is any authenticated subject: a human's browser session, an API
// token, or a node agent. Grants map a server ID to the role held on it.
type Principal struct {
	ID         string
	FleetOwner bool
	Grants     map[string]Role
}

// Request is the whole evaluation input. ServerID is empty for fleet operations.
type Request struct {
	ServerID   string
	State      ServerState
	Permission string
}

// Decision separates "may not" from "may not know". Visible reports whether the
// principal is allowed to learn the server exists, so a caller answers 404 for
// an unassigned server and 403 for an assigned one the role cannot use.
type Decision struct {
	Allowed bool
	Visible bool
	Reason  string
}

// Fleet permissions belong to the whole installation and have no server.
var fleetPermissions = map[string]bool{
	"fleet.users.manage":    true,
	"fleet.nodes.manage":    true,
	"fleet.servers.create":  true,
	"fleet.audit.read":      true,
	"fleet.settings.manage": true,
}

// Server permissions are enumerated per role. Administrator is spelled out
// rather than allowed by default, so a typo denies instead of granting.
var serverPermissions = map[Role]map[string]bool{
	Administrator: {
		"monitor.read": true, "console.read": true, "console.execute": true,
		"players.read": true, "players.manage": true,
		"backups.read": true, "backups.create": true, "backups.delete": true,
		"backups.download": true, "backups.restore": true,
		"world.download": true, "world.replace": true,
		"server.start": true, "server.stop": true, "server.restart": true,
		"server.delete": true, "settings.manage": true, "grants.manage": true,
		"audit.read": true,
	},
	Operator: {
		"monitor.read": true, "console.read": true, "console.execute": true,
		"players.read": true, "players.manage": true,
		"backups.read": true, "backups.create": true, "backups.delete": true,
		"backups.download": true, "world.download": true, "server.restart": true,
	},
	Viewer: {
		"monitor.read": true, "console.read": true,
		"players.read": true, "backups.read": true,
	},
}

// Reads stay available while a server is suspended or being deleted. Anything
// absent here changes state and needs an active server.
var readOnlyPermissions = map[string]bool{
	"monitor.read": true, "console.read": true, "players.read": true,
	"backups.read": true, "backups.download": true, "world.download": true,
	"audit.read": true,
}

// Authorize resolves one request against one principal. Every caller takes this
// path: a fleet owner's authority is an implicit administrator grant, not a
// branch that skips the check.
func Authorize(principal Principal, request Request) Decision {
	if fleetPermissions[request.Permission] {
		if request.ServerID != "" {
			return Decision{Reason: "fleet permission carries no server"}
		}
		if !principal.FleetOwner {
			return Decision{Reason: "not a fleet owner"}
		}
		return Decision{Allowed: true, Visible: true, Reason: "fleet owner"}
	}
	if request.ServerID == "" {
		return Decision{Reason: "server permission needs a server"}
	}

	// ponytail: the fleet owner holds every server implicitly, because it can
	// grant itself the same access in one audited click. Separation of duty
	// means dropping this and requiring an explicit self-grant.
	role, granted := principal.Grants[request.ServerID]
	source := "grant"
	if principal.FleetOwner {
		role, granted, source = Administrator, true, "fleet owner"
	}
	if !granted {
		return Decision{Reason: "no grant on this server"}
	}
	if !serverPermissions[role][request.Permission] {
		return Decision{Visible: true, Reason: "role does not hold this permission"}
	}
	if !readOnlyPermissions[request.Permission] && request.State != ServerActive {
		return Decision{Visible: true, Reason: "server is " + string(request.State)}
	}
	return Decision{Allowed: true, Visible: true, Reason: source}
}
