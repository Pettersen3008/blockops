package operations

import (
	"archive/zip"
	"context"
	"os"
	"path/filepath"
	"testing"
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
