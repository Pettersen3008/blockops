# Release checklist

Create a release tag only from a commit on protected `main`. The `Release gate and image` workflow reruns every cheaper CI lane. It then runs the destructive real-server journey against a fresh disposable fixture. The publish job gets write and OIDC permissions only after both jobs pass. A manual run executes the same gate without publishing.

## Tested matrix

| Component | Tested value |
| --- | --- |
| Minecraft | 1.21.4 |
| Server software | Paper 1.21.4 build 232 |
| Fixture image | `itzg/minecraft-server@sha256:410d0567d4903c3c1a814e633c45b3c6a5919ea36073b114600f05de63d40e27` |
| Release images | `linux/amd64`, `linux/arm64` |
| Real-server runner | GitHub-hosted Ubuntu AMD64 |

Do not claim compatibility with other Minecraft versions or server software. Vanilla, Spigot, Purpur, Bukkit, Fabric, Forge, and NeoForge remain unverified even where BlockOps can parse a reported software name.

## Release a candidate

1. Confirm that the candidate commit has the protected `main` checks: `backend`, `frontend`, `browser`, `container`, and `integration-fixture`.
2. Run **Release gate and image** manually on the candidate.
3. Confirm that `quality` and `destructive` pass and `publish` skips.
4. Save the manual workflow URL.
5. Confirm that `browser` uses the assembled Go production binary and checks all five security-header policies.
6. Confirm that `integration-fixture` reports the tested Paper and Minecraft versions. Check its RCON, backup download, `save-off`, and `save-on` results.
7. Confirm that `destructive` exercises lifecycle operations, backup restore, world replacement, and traversal rejection without changing the live world.
8. Push a stable `vMAJOR.MINOR.PATCH` tag at the candidate commit.
9. Save the tagged workflow URL and image digest.
10. Confirm that the image index contains only `linux/amd64` and `linux/arm64`. Confirm that each platform has SPDX SBOM and SLSA provenance files.
11. Run the release's Cosign, checksum, image-reference, and digest-pinned deployment commands from [README.md](../README.md#verify-and-select-a-tagged-image).
12. Put every failed, skipped, or manual check in the release notes. Do not replace missing evidence with a compatibility claim.

## Not verified by the automated gate

- The real-server journeys do not run on ARM64.
- The gate does not start the Compose deployment on Docker Desktop.
- The fixture downloads its pinned Paper build from `api.papermc.io` on first boot, so the gate depends on that service and network path.
- Remote ingress, TLS termination, proxy settings, real player joins, and production volume permissions remain deployment checks.
