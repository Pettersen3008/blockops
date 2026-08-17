package minecraft

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync"

	"github.com/blockops-dashboard/blockops/backend/internal/secrets"
	"github.com/blockops-dashboard/blockops/backend/internal/store"
)

const integrationSetting = "integration.rcon.v1"

type Credentials struct {
	Address  string `json:"address"`
	Password string `json:"password"`
}

type IntegrationStatus struct {
	Address               string `json:"address"`
	Configured            bool   `json:"configured"`
	Source                string `json:"source"`
	CredentialUpdatesOpen bool   `json:"credentialUpdatesEnabled"`
}

type Integration struct {
	mu          sync.RWMutex
	credentials Credentials
	source      string
	store       *store.Store
	cipher      *secrets.Cipher
}

func NewIntegration(ctx context.Context, database *store.Store, cipher *secrets.Cipher, fallback Credentials) (*Integration, error) {
	integration := &Integration{credentials: fallback, source: "environment", store: database, cipher: cipher}
	if cipher == nil {
		return integration, nil
	}
	encoded, err := database.Setting(ctx, integrationSetting)
	if errors.Is(err, store.ErrNotFound) {
		return integration, nil
	}
	if err != nil {
		return nil, err
	}
	plaintext, err := cipher.Decrypt(encoded, integrationSetting)
	if err != nil {
		return nil, fmt.Errorf("load RCON credentials: %w", err)
	}
	var stored Credentials
	if err := json.Unmarshal(plaintext, &stored); err != nil {
		return nil, fmt.Errorf("decode RCON credentials: %w", err)
	}
	if err := validateCredentials(stored); err != nil {
		return nil, fmt.Errorf("validate stored RCON credentials: %w", err)
	}
	integration.credentials = stored
	integration.source = "encrypted database"
	return integration, nil
}

func (i *Integration) Credentials() Credentials {
	i.mu.RLock()
	defer i.mu.RUnlock()
	return i.credentials
}

func (i *Integration) Status() IntegrationStatus {
	i.mu.RLock()
	defer i.mu.RUnlock()
	return IntegrationStatus{
		Address:               i.credentials.Address,
		Configured:            i.credentials.Address != "" && i.credentials.Password != "",
		Source:                i.source,
		CredentialUpdatesOpen: i.cipher != nil,
	}
}

func (i *Integration) Update(ctx context.Context, credentials Credentials) error {
	if i.cipher == nil {
		return errors.New("credential updates require BLOCKOPS_ENCRYPTION_KEY")
	}
	if err := validateCredentials(credentials); err != nil {
		return err
	}
	encodedJSON, err := json.Marshal(credentials)
	if err != nil {
		return fmt.Errorf("encode RCON credentials: %w", err)
	}
	encoded, err := i.cipher.Encrypt(encodedJSON, integrationSetting)
	if err != nil {
		return err
	}
	if err := i.store.SetSetting(ctx, integrationSetting, encoded); err != nil {
		return err
	}
	i.mu.Lock()
	i.credentials = credentials
	i.source = "encrypted database"
	i.mu.Unlock()
	return nil
}

func validateCredentials(credentials Credentials) error {
	credentials.Address = strings.TrimSpace(credentials.Address)
	if credentials.Address == "" {
		return errors.New("RCON address is required")
	}
	host, port, err := net.SplitHostPort(credentials.Address)
	if err != nil || host == "" || port == "" {
		return errors.New("RCON address must use host:port format")
	}
	if len(credentials.Password) < 8 || len(credentials.Password) > 256 {
		return errors.New("RCON password must contain 8–256 characters")
	}
	return nil
}
