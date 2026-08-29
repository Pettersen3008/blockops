package auth

import "testing"

// The negative authorization prototype Phase 2 requires: two users, two
// servers, and the tampering attempts that must not succeed.
func TestAuthorizeGivenTwoUsersAndTwoServersWhenTamperingThenDenies(t *testing.T) {
	t.Parallel()
	const alpha, beta = "server-alpha", "server-beta"
	alice := Principal{ID: "alice", Grants: map[string]Role{alpha: Operator}}
	bob := Principal{ID: "bob", Grants: map[string]Role{beta: Viewer}}
	owner := Principal{ID: "owner", FleetOwner: true}

	cases := []struct {
		name        string
		principal   Principal
		request     Request
		wantAllow   bool
		wantVisible bool
	}{
		{"alice runs a command on her own server", alice, Request{alpha, ServerActive, "console.execute"}, true, true},
		{"alice swaps the URL to bob's server", alice, Request{beta, ServerActive, "console.execute"}, false, false},
		{"alice reads bob's server", alice, Request{beta, ServerActive, "monitor.read"}, false, false},
		{"alice invents a server ID", alice, Request{"server-ghost", ServerActive, "monitor.read"}, false, false},
		{"alice reaches for fleet user management", alice, Request{"", "", "fleet.users.manage"}, false, false},
		{"alice smuggles a fleet permission through a server route", alice, Request{alpha, ServerActive, "fleet.users.manage"}, false, false},
		{"alice deletes her own server", alice, Request{alpha, ServerActive, "server.delete"}, false, true},
		{"bob writes to the server he can read", bob, Request{beta, ServerActive, "backups.create"}, false, true},
		{"bob reads the server he was granted", bob, Request{beta, ServerActive, "backups.read"}, true, true},
		{"owner manages users", owner, Request{"", "", "fleet.users.manage"}, true, true},
		{"owner operates a server nobody granted", owner, Request{alpha, ServerActive, "world.replace"}, true, true},
		{"a server route with no server ID", alice, Request{"", ServerActive, "monitor.read"}, false, false},
		{"a misspelled permission", owner, Request{alpha, ServerActive, "console.exec"}, false, true},
		{"writing to a server being deleted", owner, Request{alpha, ServerDeleting, "world.replace"}, false, true},
		{"reading a server being deleted", owner, Request{alpha, ServerDeleting, "monitor.read"}, true, true},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			decision := Authorize(testCase.principal, testCase.request)
			if decision.Allowed != testCase.wantAllow || decision.Visible != testCase.wantVisible {
				t.Fatalf("Authorize() = %+v, want allowed %v visible %v", decision, testCase.wantAllow, testCase.wantVisible)
			}
		})
	}
}
