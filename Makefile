.PHONY: dev-api dev-web test test-e2e test-integration test-destructive build compose-config integration-up integration-down

dev-api:
	cd backend && \
		BLOCKOPS_LISTEN_ADDRESS=127.0.0.1:8080 \
		BLOCKOPS_PUBLIC_ORIGIN=http://localhost:5173 \
		BLOCKOPS_COOKIE_SECURE=false \
		BLOCKOPS_DATABASE_PATH=$${PWD}/../runtime/blockops.db \
		BLOCKOPS_MINECRAFT_DATA_DIR=$${PWD}/../runtime/minecraft \
		BLOCKOPS_BACKUP_DIR=$${PWD}/../runtime/backups \
		go run ./cmd/blockops

dev-web:
	bun run --cwd frontend dev

test:
	cd backend && go test -race ./...
	bun run --cwd frontend typecheck
	bun run --cwd frontend test

test-e2e:
	bun run --cwd frontend test:e2e

# Needs a running fixture: make integration-up first, make integration-down after.
test-integration:
	BLOCKOPS_E2E_INTEGRATION=true BLOCKOPS_E2E_URL=http://127.0.0.1:$${BLOCKOPS_PORT:-8099} \
		bun run --cwd frontend test:e2e

# Destructive and valid only against scripts/integration.sh's disposable project.
test-destructive:
	BLOCKOPS_E2E_INTEGRATION=true BLOCKOPS_E2E_DESTRUCTIVE=true \
		BLOCKOPS_E2E_COMPOSE_PROJECT=blockops-integration \
		BLOCKOPS_E2E_URL=http://127.0.0.1:$${BLOCKOPS_PORT:-8099} \
		bun run --cwd frontend test:e2e

build:
	bun run --cwd frontend build
	cd backend && go build ./cmd/blockops

compose-config:
	docker compose config --quiet
	scripts/compose-assert.sh
	scripts/release-assert.sh

integration-up:
	scripts/integration.sh up

integration-down:
	scripts/integration.sh down
