.PHONY: dev-api dev-web test test-e2e build compose-config integration-up integration-down

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

build:
	bun run --cwd frontend build
	cd backend && go build ./cmd/blockops

compose-config:
	docker compose config --quiet
	scripts/compose-assert.sh

integration-up:
	scripts/integration.sh up

integration-down:
	scripts/integration.sh down
