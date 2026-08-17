# Roadmap

The MVP intentionally optimizes for one server and a narrow trust boundary. These items are not partially implemented:

## Near term

- Optional passkeys/WebAuthn and recovery-code policy after a reviewed authentication design.
- Configurable backup retention with dry-run visibility and free-space guardrails.
- Signed release images, SBOM/provenance attestations, and documented digest pinning.
- More integration fixtures for Paper, Purpur, and common Spigot-compatible versions.
- Audit export and pagination without weakening redaction.

## Future integrations

- LuckPerms integration for plugin-specific permissions.
- Remote backup providers with encryption, retention, and restore verification.
- Multiple Minecraft Java servers, then multiple physical nodes, only after an explicit tenancy/agent security model.
- Plugin or mod discovery/marketplace with provenance and compatibility controls.
- Bedrock Dedicated Server management as a separate integration model. Geyser/Floodgate players continue to be managed through the underlying Java server in this MVP.

## Explicitly deferred product areas

- Creating new worlds.
- A general-purpose file manager.
- Automatic Minecraft upgrades.
- Commercial hosting, billing, reseller, or customer-tenancy features.

Each item requires its own delivery brief and threat model. It should not be added by widening the existing RCON, filesystem, or Docker guard interfaces.

