# Bun migration prompt

Use this prompt in a new chat to start E1 from `docs/ROADMAP.md`. Complete only the package-manager and workspace migration. E2 replaces Rsbuild and Vitest after E1 has a trustworthy baseline.

```text
You are working in the existing BlockOps repository. Start engineering stage E1 from docs/ROADMAP.md: replace pnpm with Bun 1.4 and establish the root Bun workspace.

This is an implementation task. Make the changes, verify them, and stop when E1 is complete. Do not begin the Rsbuild, Vitest, packages/ui, or visual redesign migrations in this chat.

Read before editing:

1. AGENTS.md
2. docs/DELIVERY_BRIEF.md
3. docs/ARCHITECTURE.md
4. docs/SECURITY.md
5. docs/refactor-progress.md
6. docs/IMPLEMENTATION_PLAN.md
7. docs/ROADMAP.md, especially the engineering track and E1
8. docs/FRONTEND_REFACTOR_PLAN.md, especially FE-28

Then inspect:

git status --short
git diff
git log --oneline -20
bun --version
go version
node --version
pnpm --version

The worktree contains user-owned uncommitted changes. Preserve them. Before editing, list the files you expect E1 to change and distinguish them from unrelated dirty files. Do not reset, restore, reformat, stage, or commit unrelated work.

Target architecture:

- Go remains the only production backend and control-plane runtime.
- React remains the browser application.
- Bun 1.4 becomes the only JavaScript package manager and the root workspace command runner.
- The root JavaScript workspace includes frontend and packages/*.
- The Go backend does not become a JavaScript workspace.
- Rsbuild, Vitest, Playwright, TypeScript, ESLint, dependency-cruiser, and Knip remain unchanged during E1. E2 replaces Rsbuild and Vitest. Playwright remains the browser-testing tool.

Execute E1 in verifiable units:

1. Record the pnpm baseline.
   - Run the current pnpm verification command.
   - Record the production output sizes.
   - Record a clean install and a warm install in disposable directories so measurement does not delete user state.
   - Record tool versions, platform, architecture, cache state, wall time, and peak memory when the platform exposes it.
   - If the dirty worktree already fails a check, identify the failure before changing package-management files. Do not fix unrelated failures.

2. Establish the Bun workspace.
   - Add the smallest private root package.json that owns the workspace.
   - Include frontend and packages/*.
   - Pin the exact Bun 1.4 version used for the migration.
   - Use Bun's isolated linker so undeclared dependencies continue to fail.
   - Migrate the pnpm lockfile to the root bun.lock without changing dependency versions merely to make migration easier.
   - Keep frontend/pnpm-lock.yaml until every E1 gate passes.

3. Audit installation behavior.
   - Run Bun's untrusted-dependency inspection.
   - Review each blocked lifecycle script.
   - Add only scripts required by the current dependency graph to trustedDependencies.
   - Never use a trust-all option.
   - Confirm that a second frozen install leaves bun.lock unchanged.

4. Replace package-manager commands.
   - Update packageManager fields and package scripts.
   - Update Make, Docker, Compose, CI, Dependabot, and active documentation where they invoke pnpm.
   - Keep each command visible. Do not add a task runner or wrapper CLI.
   - Use bun run for existing tools. Do not run Node-targeted CLIs under Bun's runtime override unless that exact mode passes their existing checks.

5. Verify the migrated repository.
   - Run bun install --frozen-lockfile or bun ci from a clean dependency state.
   - Run the Bun equivalent of the complete frontend verification command.
   - Run the existing Playwright journey against the current build setup.
   - Build the embedded frontend and prove a direct application route survives a hard refresh through the Go server.
   - Build the Docker image and inspect the relevant Compose configuration when Docker is available.
   - Run git diff --check.
   - Search for active pnpm commands and package-manager metadata that should have been migrated.

6. Finish the migration.
   - Delete frontend/pnpm-lock.yaml only after every required gate passes.
   - Do not keep pnpm as a fallback command or maintain two lockfiles.
   - Update AGENTS.md so Bun commands become authoritative only after the migration works.
   - Record E1 results in the existing progress documentation. Include baseline and Bun measurements, compatibility findings, trusted dependencies, rollback instructions, commands run, and checks not run.

Completion criteria:

- bun.lock is the only JavaScript lockfile.
- A frozen Bun install makes no file changes.
- Bun runs the unchanged Rsbuild, Vitest, Playwright, typecheck, lint, dependency-cruiser, and Knip checks successfully.
- CI, Docker, Make, Compose, and current documentation use Bun commands.
- Go production runtime and security boundaries are unchanged.
- The diff contains no unrelated user work.

If a Bun incompatibility blocks a required check, reduce it to the smallest reproduction and verify it against the official Bun 1.4 documentation or issue tracker. Report the exact blocker and preserve the pnpm rollback path. Do not hide the incompatibility with weaker verification or application behavior changes.

In the final response report:

- What changed
- Why this is the smallest migration that works
- Files added and their one job
- Dependency and lifecycle-script changes
- Baseline and Bun measurements
- Commands run and their results
- What was not verified
- Old pnpm files and commands deleted
- Unrelated dirty files preserved
- The next stage, E2, without starting it
```
