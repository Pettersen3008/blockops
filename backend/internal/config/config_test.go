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

func TestLoadGivenAuditExportLimitWhenParsingThenValidatesBound(t *testing.T) {
	for _, test := range []struct {
		value    string
		expected int
	}{
		{value: "1", expected: 1},
		{value: "100000", expected: 100000},
		{value: "0"},
		{value: "100001"},
		{value: "many"},
	} {
		t.Run(test.value, func(t *testing.T) {
			t.Setenv("BLOCKOPS_MAX_AUDIT_EXPORT_ROWS", test.value)
			t.Setenv("BLOCKOPS_DATABASE_PATH", t.TempDir()+"/blockops.db")
			t.Setenv("BLOCKOPS_MINECRAFT_DATA_DIR", t.TempDir())
			t.Setenv("BLOCKOPS_BACKUP_DIR", t.TempDir())
			configuration, err := Load()
			if test.expected != 0 && (err != nil || configuration.MaxAuditExportRows != test.expected) {
				t.Fatalf("Load() = %+v, %v", configuration, err)
			}
			if test.expected == 0 && err == nil {
				t.Fatal("expected invalid export limit to fail")
			}
		})
	}
}
