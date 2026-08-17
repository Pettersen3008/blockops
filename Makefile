.PHONY: dev-api dev-web test test-e2e build compose-config

dev-api:
	cd backend && BLOCKOPS_COOKIE_SECURE=false BLOCKOPS_DATABASE_PATH=$${PWD}/../runtime/blockops.db BLOCKOPS_MINECRAFT_DATA_DIR=$${PWD}/../runtime/minecraft BLOCKOPS_BACKUP_DIR=$${PWD}/../runtime/backups go run ./cmd/blockops

dev-web:
	cd frontend && npm run dev

test:
	cd backend && go test -race ./...
	cd frontend && npm run typecheck && npm test

test-e2e:
	cd frontend && npm run test:e2e

build:
	cd frontend && npm run build
	cd backend && go build ./cmd/blockops

compose-config:
	docker compose config --quiet
