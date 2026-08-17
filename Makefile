.PHONY: dev-api dev-web test test-e2e build compose-config

dev-api:
	cd backend && BLOCKOPS_COOKIE_SECURE=false BLOCKOPS_DATABASE_PATH=$${PWD}/../runtime/blockops.db BLOCKOPS_MINECRAFT_DATA_DIR=$${PWD}/../runtime/minecraft BLOCKOPS_BACKUP_DIR=$${PWD}/../runtime/backups go run ./cmd/blockops

dev-web:
	cd frontend && pnpm dev

test:
	cd backend && go test -race ./...
	cd frontend && pnpm typecheck && pnpm test

test-e2e:
	cd frontend && pnpm test:e2e

build:
	cd frontend && pnpm build
	cd backend && go build ./cmd/blockops

compose-config:
	docker compose config --quiet
