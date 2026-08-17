package console

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHubBoundsAndSanitizesLines(t *testing.T) {
	t.Parallel()
	hub := New("unused", 100)
	for index := 0; index < 120; index++ {
		hub.publish("\x1b[31mline\x1b[0m")
	}
	lines := hub.History(200)
	if len(lines) != 100 {
		t.Fatalf("history length = %d, want 100", len(lines))
	}
	if strings.Contains(lines[0].Text, "\x1b") || lines[0].Text != "line" {
		t.Fatalf("line was not sanitized: %q", lines[0].Text)
	}
	if lines[0].Sequence != 21 || lines[99].Sequence != 120 {
		t.Fatalf("unexpected bounded sequence range %d-%d", lines[0].Sequence, lines[99].Sequence)
	}
}

func TestHubWaitsForCompleteLogLine(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "latest.log")
	if err := os.WriteFile(path, []byte("partial"), 0o640); err != nil {
		t.Fatal(err)
	}
	hub := New(path, 100)
	offset, err := hub.readAvailable(-1)
	if err != nil {
		t.Fatal(err)
	}
	if len(hub.History(10)) != 0 {
		t.Fatal("incomplete line was published")
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.WriteString(" completed\n"); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := hub.readAvailable(offset); err != nil {
		t.Fatal(err)
	}
	lines := hub.History(10)
	if len(lines) != 1 || lines[0].Text != "partial completed" {
		t.Fatalf("history = %+v", lines)
	}
}
