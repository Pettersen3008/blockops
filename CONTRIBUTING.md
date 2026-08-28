# Contributing

Contributions are welcome when they preserve BlockOps' narrow security boundary.

1. Start from an issue or a [roadmap](docs/ROADMAP.md) ticket with observable acceptance criteria.
2. Keep Minecraft input on the RCON path. Do not add host shell, Docker exec, arbitrary container names, outbound URL fetching, or general file browsing.
3. Add appropriate automated coverage for changed behavior.
4. Run `make test`, `make build`, and the relevant browser workflow before opening a pull request. Deployment changes also run `make compose-config`; changes to the real Docker, RCON, or world paths run `make integration-up`, `make test-integration`, and `make integration-down`.
5. Explain new dependencies and avoid client-side secrets, raw HTML sinks, or long-lived browser tokens.
6. Update the OpenAPI document, [security model](docs/SECURITY.md), and [roadmap](docs/ROADMAP.md) when behavior or boundaries change.

Commits should be focused and describe why the change is needed. Never commit `.env`, world data, databases, backups, logs containing addresses/usernames, or credentials.
