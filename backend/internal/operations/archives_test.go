package operations

import (
	"archive/zip"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path"
	"path/filepath"
	"slices"
	"testing"

	"github.com/blockops-dashboard/blockops/backend/internal/dockerapi"
)

func TestExtractWorldZipAcceptsOneContainedWorld(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	archive := filepath.Join(root, "world.zip")
	writeZip(t, archive, map[string]string{
		"My World/level.dat":        "level-data",
		"My World/region/r.0.0.mca": "region-data",
	})
	destination := filepath.Join(root, "staging")
	if err := os.Mkdir(destination, 0o750); err != nil {
		t.Fatal(err)
	}
	service := Service{WorldName: "world", MaxUploadBytes: 10 << 20}
	if err := service.extractWorldZip(context.Background(), archive, destination); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(filepath.Join(destination, "world", "region", "r.0.0.mca"))
	if err != nil || string(content) != "region-data" {
		t.Fatalf("extracted content = %q, %v", content, err)
	}
}

func TestWorldZipRejectsTraversalAndSiblingFiles(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name  string
		files map[string]string
	}{
		{"traversal", map[string]string{"world/level.dat": "ok", "../escape": "bad"}},
		{"sibling", map[string]string{"world/level.dat": "ok", "another/file.txt": "bad"}},
		{"multiple worlds", map[string]string{"one/level.dat": "one", "two/level.dat": "two"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			archive := filepath.Join(root, "world.zip")
			writeZip(t, archive, test.files)
			destination := filepath.Join(root, "staging")
			if err := os.Mkdir(destination, 0o750); err != nil {
				t.Fatal(err)
			}
			service := Service{WorldName: "world", MaxUploadBytes: 10 << 20}
			if err := service.extractWorldZip(context.Background(), archive, destination); err == nil {
				t.Fatal("expected unsafe ZIP to be rejected")
			}
		})
	}
}

func TestPlayerListAndCommandRedaction(t *testing.T) {
	t.Parallel()
	players := parsePlayerList("There are 2 of a max of 20 players online: Alex, Steve")
	if players.Online != 2 || players.Max != 20 || len(players.Names) != 2 {
		t.Fatalf("parsePlayerList() = %+v", players)
	}
	if got := RedactCommand("login my-secret-value"); got != "login [REDACTED]" {
		t.Fatalf("RedactCommand() = %q", got)
	}
	if got := RedactCommand("say hello"); got != "say hello" {
		t.Fatalf("RedactCommand() changed safe command: %q", got)
	}
}

func writeZip(t *testing.T, path string, files map[string]string) {
	t.Helper()
	output, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(output)
	for name, content := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := output.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestInstallStagedWorldsRollsBackWhenTheContainerFailsToStart(t *testing.T) {
	t.Parallel()
	data := t.TempDir()
	writeWorldFile(t, filepath.Join(data, "world", "level.dat"), "current")
	staging := filepath.Join(data, "staging")
	writeWorldFile(t, filepath.Join(staging, "world", "level.dat"), "replacement")

	var calls []string
	docker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, path.Base(r.URL.Path))
		if path.Base(r.URL.Path) == "start" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer docker.Close()
	client, err := dockerapi.New(docker.URL, "minecraft")
	if err != nil {
		t.Fatal(err)
	}
	service := Service{Docker: client, MinecraftDataDir: data, WorldName: "world"}

	if err := service.installStagedWorlds(context.Background(), staging); err == nil {
		t.Fatal("expected a failed container start to fail the installation")
	}
	content, err := os.ReadFile(filepath.Join(data, "world", "level.dat"))
	if err != nil || string(content) != "current" {
		t.Fatalf("prior world after rollback = %q, %v", content, err)
	}
	// The second start is the rollback putting the operator back where they were.
	if want := []string{"stop", "start", "start"}; !slices.Equal(calls, want) {
		t.Fatalf("Docker calls = %v, want %v", calls, want)
	}
}

func TestConsistentWorldGivenARequestCancellationWhenRecoveringThenSavingIsReenabled(t *testing.T) {
	t.Parallel()
	docker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"Config":{"Image":"paper"},"State":{"Status":"running","Running":true}}`))
	}))
	defer docker.Close()
	client, err := dockerapi.New(docker.URL, "minecraft")
	if err != nil {
		t.Fatal(err)
	}
	rcon := &recordingRCON{}
	service := Service{Docker: client, RCON: rcon}
	ctx, cancel := context.WithCancel(context.Background())

	err = service.withConsistentWorld(ctx, func() error {
		cancel()
		return ctx.Err()
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("withConsistentWorld() error = %v, want context cancellation", err)
	}
	if want := []string{"save-off", "save-all flush", "save-on"}; !slices.Equal(rcon.commands, want) {
		t.Fatalf("RCON commands = %v, want %v", rcon.commands, want)
	}
	if rcon.contextErrors[2] != nil {
		t.Fatalf("save-on context error = %v, want a fresh context", rcon.contextErrors[2])
	}
}

type recordingRCON struct {
	commands      []string
	contextErrors []error
}

func (r *recordingRCON) Exec(ctx context.Context, command string) (string, error) {
	r.commands = append(r.commands, command)
	r.contextErrors = append(r.contextErrors, ctx.Err())
	return "", nil
}

func writeWorldFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o640); err != nil {
		t.Fatal(err)
	}
}
