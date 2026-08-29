#!/usr/bin/env sh
set -eu

workflow=.github/workflows/release.yml

fail() {
	printf 'release assertion failed: %s\n' "$1" >&2
	exit 1
}

contains() {
	grep -Eq "$2" "$workflow" || fail "$1"
}

if grep -Eq '^[[:space:]]+pull_request:' "$workflow"; then
	fail "pull requests must not trigger releases"
fi

contains "only version tags trigger releases" '^[[:space:]]+- "v\*\.\*\.\*"'
contains "the image targets amd64 and arm64" 'platforms: linux/amd64,linux/arm64'
contains "the build emits maximum provenance" 'provenance: mode=max'
contains "the build emits an SBOM" 'sbom: true'
contains "Cosign signs the immutable digest" 'cosign sign --yes "\$IMAGE@\$DIGEST"'

uses=$(grep -Ec '^[[:space:]]+uses:' "$workflow")
pinned=$(grep -Ec '^[[:space:]]+uses: [^@[:space:]]+@[0-9a-f]{40}([[:space:]]|$)' "$workflow")
[ "$uses" -eq "$pinned" ] || fail "every action must use a full commit SHA"

[ "$(grep -Ec '^[[:space:]]{6}contents: write$' "$workflow")" -eq 1 ] ||
	fail "only the publish job may write release contents"
[ "$(grep -Ec '^[[:space:]]{6}id-token: write$' "$workflow")" -eq 1 ] ||
	fail "only the publish job may request an OIDC token"
[ "$(grep -Ec '^[[:space:]]{6}packages: write$' "$workflow")" -eq 1 ] ||
	fail "only the publish job may write packages"

grep -Eq '^USER 10001:10001$' Dockerfile ||
	fail "the release image must keep the non-root runtime user"

printf 'release assertions passed: %s\n' "$workflow"
