package config

import "testing"

func TestLoadRejectsPublicOriginWithPath(t *testing.T) {
	t.Setenv("BLOCKOPS_PUBLIC_ORIGIN", "https://blockops.example.test/admin")
	t.Setenv("BLOCKOPS_DATABASE_PATH", t.TempDir()+"/blockops.db")
	t.Setenv("BLOCKOPS_MINECRAFT_DATA_DIR", t.TempDir())
	t.Setenv("BLOCKOPS_BACKUP_DIR", t.TempDir())
	if _, err := Load(); err == nil {
		t.Fatal("expected an origin with a path to be rejected")
	}
}

func TestLoadCanonicalizesPublicOrigin(t *testing.T) {
	t.Setenv("BLOCKOPS_PUBLIC_ORIGIN", "https://blockops.example.test/")
	t.Setenv("BLOCKOPS_DATABASE_PATH", t.TempDir()+"/blockops.db")
	t.Setenv("BLOCKOPS_MINECRAFT_DATA_DIR", t.TempDir())
	t.Setenv("BLOCKOPS_BACKUP_DIR", t.TempDir())
	configuration, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if configuration.PublicOrigin != "https://blockops.example.test" {
		t.Fatalf("PublicOrigin = %q", configuration.PublicOrigin)
	}
}
