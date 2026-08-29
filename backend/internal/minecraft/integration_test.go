package minecraft

import (
	"context"
	"crypto/rand"
	"path/filepath"
	"testing"

	"github.com/blockops-dashboard/blockops/backend/internal/secrets"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

func TestIntegrationGivenCredentialsSavedAsAServerSecretWhenReloadingThenPrefersThemOverTheEnvironment(t *testing.T) {
	ctx := context.Background()
	database, err := store.Open(ctx, filepath.Join(t.TempDir(), "blockops.db"), store.Adoption{
		DockerBaseURL: "http://docker-proxy:2375", ContainerName: "minecraft",
		DataDir: "/minecraft", BackupDir: "/backups", WorldName: "world", RCONAddress: "minecraft:25575",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	cipher, err := secrets.New(key)
	if err != nil {
		t.Fatal(err)
	}
	fallback := Credentials{Address: "minecraft:25575", Password: "from-environment"}

	saving, err := NewIntegration(ctx, database, cipher, fallback)
	if err != nil {
		t.Fatal(err)
	}
	saved := Credentials{Address: "minecraft:25575", Password: "stored-password"}
	if err := saving.Update(ctx, saved); err != nil {
		t.Fatal(err)
	}

	reloaded, err := NewIntegration(ctx, database, cipher, fallback)
	if err != nil {
		t.Fatal(err)
	}
	if got := reloaded.Credentials(); got != saved {
		t.Fatalf("Credentials() = %+v, want %+v", got, saved)
	}
	if source := reloaded.Status().Source; source != "encrypted database" {
		t.Fatalf("Status().Source = %q", source)
	}
}
