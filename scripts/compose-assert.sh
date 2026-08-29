#!/usr/bin/env sh
# Asserts the rendered Compose model, not the source YAML: the published ingress
# stays on loopback, the guard and RCON ports stay unpublished, both BlockOps
# roots stay read-only with all capabilities dropped, each service probes its own
# health endpoint, both processes use the same image, and every required mount is
# present. The rendered model never reaches stdout, so it is safe to run against
# the integration fixture's secrets.
# Usage: scripts/compose-assert.sh [extra docker compose arguments...]
set -eu

model=$(docker compose "$@" config --format json)

check() {
	description=$1
	filter=$2
	if [ "$(printf '%s' "$model" | jq -r "$filter")" != "true" ]; then
		printf 'compose assertion failed: %s\n' "$description" >&2
		exit 1
	fi
}

check "dashboard publishes exactly one host port" \
	'(.services.dashboard.ports | length) == 1'
check "dashboard ingress is loopback-bound to container port 8080" \
	'.services.dashboard.ports[0] | .host_ip == "127.0.0.1" and .target == 8080'
check "no service publishes the guard or RCON port" \
	'[.services[].ports // [] | .[] | .target, (.published | tonumber)] | all(. != 2375 and . != 25575)'
check "the guard publishes no host port" \
	'(.services["docker-guard"].ports // []) == []'

# Named rather than "every service" so an added service, such as the integration
# fixture's Minecraft server, cannot vacuously satisfy the BlockOps hardening.
check "both BlockOps roots are read-only" \
	'[.services.dashboard, .services["docker-guard"]] | all(.read_only == true)'
check "both BlockOps services drop all capabilities" \
	'[.services.dashboard, .services["docker-guard"]] | all(.cap_drop | index("ALL") != null)'
check "both BlockOps services forbid privilege escalation" \
	'[.services.dashboard, .services["docker-guard"]] | all(.security_opt | index("no-new-privileges:true") != null)'

check "the guard probes its own listener, not the dashboard health route" \
	'.services["docker-guard"].healthcheck.test | join(" ") | contains("http://127.0.0.1:2375/health")'
check "the dashboard inherits the image health check" \
	'.services.dashboard | has("healthcheck") | not'
check "the dashboard waits for a healthy guard" \
	'.services.dashboard.depends_on["docker-guard"].condition == "service_healthy"'
check "both BlockOps services use the same image" \
	'.services.dashboard.image == .services["docker-guard"].image'

check "the dashboard mounts data, backups, and Minecraft data" \
	'[.services.dashboard.volumes[].target] | contains(["/data", "/backups", "/minecraft"])'
check "only the guard mounts the Docker socket, read-only" \
	'[.services[].volumes // [] | .[] | select(.target == "/var/run/docker.sock")] | length == 1 and .[0].read_only == true'
check "the dashboard never mounts the Docker socket" \
	'[.services.dashboard.volumes[].source] | all(. != "/var/run/docker.sock")'
check "no service other than the guard reaches the Docker socket" \
	'[.services | to_entries[] | select(.key != "docker-guard") | .value.volumes // [] | .[].source] | all(. != "/var/run/docker.sock")'

check "the control networks stay internal" \
	'[.networks["app-control"].internal, .networks["minecraft-control"].internal] | all(. == true)'
check "the guard stays off the ingress network" \
	'.services["docker-guard"].networks | has("ingress") | not'

printf 'compose assertions passed: docker compose %s\n' "$*"
