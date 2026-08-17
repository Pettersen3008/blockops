# syntax=docker/dockerfile:1.7
FROM node:24-alpine3.24 AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

FROM golang:1.25.13-alpine3.24 AS backend-build
WORKDIR /build/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=frontend-build /build/frontend/dist/ ./internal/webui/dist/
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/blockops ./cmd/blockops \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/blockops-docker-guard ./cmd/docker-guard

FROM alpine:3.24.1 AS runtime
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S -g 10001 blockops \
    && adduser -S -D -H -u 10001 -G blockops blockops \
    && install -d -o blockops -g blockops -m 0750 /data /backups /minecraft
COPY --from=backend-build --chown=blockops:blockops /out/blockops /usr/local/bin/blockops
COPY --from=backend-build --chown=root:root /out/blockops-docker-guard /usr/local/bin/blockops-docker-guard
USER 10001:10001
EXPOSE 8080
VOLUME ["/data", "/backups", "/minecraft"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/api/v1/health || exit 1
ENTRYPOINT ["/usr/local/bin/blockops"]
