package operations

import "testing"

func TestGivenAPlayerListWhenParsingThenReturnsCapacityAndNames(t *testing.T) {
	t.Parallel()
	for _, response := range []string{
		"There are 2 of a max of 20 players online: Alex, Steve",
		"There are 2 of 20 players online: Alex, Steve",
	} {
		players := parsePlayerList(response)
		if players.Online != 2 || players.Max != 20 || len(players.Names) != 2 {
			t.Fatalf("parsePlayerList(%q) = %+v", response, players)
		}
	}
}

func TestGivenASecretCommandWhenRedactingThenKeepsOnlyTheVerb(t *testing.T) {
	t.Parallel()
	if got := RedactCommand("login my-secret-value"); got != "login [REDACTED]" {
		t.Fatalf("RedactCommand() = %q", got)
	}
	if got := RedactCommand("say hello"); got != "say hello" {
		t.Fatalf("RedactCommand() changed safe command: %q", got)
	}
}

func TestGivenAnUntrustedOnlineCountWhenParsingThenDoesNotUseItAsCapacity(t *testing.T) {
	t.Parallel()
	players := parsePlayerList("There are 1000000000 of a max of 1000000000 players online:")
	if cap(players.Names) != 0 {
		t.Fatalf("cap(parsePlayerList().Names) = %d", cap(players.Names))
	}
}

func BenchmarkParsePlayerList(b *testing.B) {
	const response = "There are 8 of a max of 20 players online: Alex, Steve, Builder42, Miner, Redstone, CreeperHunter, Sam, Pat"
	var players PlayerSummary
	for b.Loop() {
		players = parsePlayerList(response)
	}
	benchmarkPlayerSummary = players
}

var benchmarkPlayerSummary PlayerSummary
