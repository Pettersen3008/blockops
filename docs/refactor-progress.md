# Refactor Progress

Machine-maintained. The agent updates this after every ticket, before starting the
next one. This is the resume point after a crash, a context compaction, or a new
session — read it first, trust it over memory.

**Status values:** `todo` · `in-progress` · `blocked` · `done` · `waived`

| Ticket | Status | Commit | Notes |
|---|---|---|---|
| FE-15 baseline + MSW | done | `0740168` | strict global MSW server |
| FE-16 pnpm | done | `5fe95b7` | pnpm 11.7.0 via Corepack |
| FE-17 rename + filename lint | done | `7e9266b` | scripted 103 path changes |
| FE-18 api helper | done | `9094b32` | API owns CSRF via injected query-cache getter |
| FE-19 reference feature `players` | done | `3a8629f` | reference slice; design review done in `bb3235c`, see log |
| FE-20 `worlds` | todo | — | |
| FE-21 `audit` | todo | — | |
| FE-22 `backups` | todo | — | |
| FE-23 `overview` | todo | — | largest page, 158 lines |
| FE-24 `settings` | todo | — | record the form-library decision |
| FE-25 `console` | todo | — | **gate:** WebSocket invariants, human review before merge |
| FE-26 delete `application.css` | todo | — | |
| FE-27 enforcement | todo | — | each rule must be proven to fail |
| FE-28 verification + budgets | todo | — | **gate:** needs human for mobile/keyboard/visual |

## Decisions

| ID | Question | Decision | Decided by | Date |
|---|---|---|---|---|
| D-1 | Who owns the CSRF token | API helper via an injected auth-session getter | user | 2026-08-17 |
| D-2 | Cross-feature cache invalidation | Broad `invalidateQueries()` after server-state mutations | user | 2026-08-17 |
| D-3 | Is `ActionDialog` one concept | Shared accessible modal primitive; feature-local action dialogs | user | 2026-08-17 |

## Log

Append one entry per ticket. Newest last. Keep entries short — this file is read at
the start of every session and must stay cheap to load.

<!-- format:
### FE-NN — <status> — <ISO date>
- Changed: <one line>
- Verified: <commands run + result>
- NOT verified: <the honest list>
- Deleted: <what old code went away>
- Follow-ups found (not fixed): <out-of-scope items>
-->

### FE-15 — done — 2026-08-17
- Changed: added the bundle/test baseline and strict MSW lifecycle in the existing test setup
- Simplest design: one global server; no separate mocks layer before real handlers exist
- Abstraction: test HTTP interception; 1 setup consumer and 8 planned feature consumers; removes fetch stubs; adds MSW and lifecycle hooks
- State/cache: unchanged
- Tests: existing 23 files/54 tests preserved; failing scratch request proved strict handling, then was removed
- Verified: npm check equivalents green; production build 968.6 kB; Playwright 1/1; embedded `/players` deep link served
- NOT verified: `pnpm verify` is unavailable until FE-16
- Deleted: temporary unhandled-request scratch test; no production code
- Follow-ups found (not fixed): 3 moderate React Router audit findings; knip CSS configuration hint

### FE-16 — done — 2026-08-17
- Changed: pinned pnpm 11.7.0 and migrated the lockfile, scripts, Make, Docker, and CI commands
- Simplest design: Node 24 Corepack installs the pinned manager; no package-manager action or cache layer
- New files: `frontend/pnpm-lock.yaml` records the exact dependency graph
- State/cache: application state unchanged; removed the npm-specific CI cache configuration
- Tests: no test changes; existing 23 files/54 tests preserved
- Verified: `pnpm verify` green; frozen install; `make test`; Docker image; Compose config; Playwright 1/1; embedded deep-link refresh
- NOT verified: remote GitHub Actions execution; interactive `make dev-web`
- Deleted: `frontend/package-lock.json` and npm commands from Docker, Make, and CI
- Follow-ups found (not fixed): 5 moderate pnpm audit findings; user-owned README and SECURITY wording still says npm; Make build still needs explicit asset assembly

### FE-17 — done — 2026-08-17
- Changed: scripted 103 kebab-case path moves and 224 resolved import rewrites; added filename enforcement
- Simplest design: one temporary migration script and one inline ESLint rule; no dependency added
- Abstraction: source naming policy; 128 TypeScript files plus future files; removes manual review; adds 33 config lines
- New files: none; existing files moved in place
- State/cache: unchanged
- Tests: assertions unchanged; existing 23 files/54 tests preserved
- Verified: `pnpm verify` green; post-script tsc; 114-file content-diff proof; scratch lint failure; `git log --follow`; Playwright 1/1; embedded `/players`
- NOT verified: remote GitHub Actions execution
- Deleted: PascalCase/dot-namespaced paths; no code; `src/pages/` was already absent
- Follow-ups found (not fixed): none

### FE-18 — done — 2026-08-17
- Changed: replaced `httpRequest` with named feature API functions over `api.get/post/put/delete`; API owns CSRF
- Simplest design: one injected query-cache getter keeps auth ownership out of `lib/` and removes token threading
- Abstraction: HTTP transport and safe response parsing; 8 feature API modules/20 endpoints; removes method/options coupling and repeated error normalization; adds one 61-line module and bootstrap injection
- State/cache: CSRF reads the current auth-session query cache at mutation time; query keys and invalidation unchanged
- Tests: migrated the 3 client tests and existing page contracts; added CSRF method and 204 coverage; 23 files/56 tests
- Verified: `pnpm verify` green; `httpRequest` grep empty; Playwright 1/1; Go embedded auth/setup/logout and `/players` deep link; post-commit `/audit?outcome=success` 200
- NOT verified: remote GitHub Actions; React Doctor (would download a non-approved tool)
- Deleted: `lib/api/http-client.ts`, its test, API object wrappers, and CSRF hook parameters
- Follow-ups found (not fixed): none

### FE-19 — done — 2026-08-17
- Changed: made players the API/schema/hooks/components reference slice with shadcn Base UI, Tailwind, query options, and D-2c invalidation
- Simplest design: one server-state hook module; page-owned UI state; behavior-sized row, form, and dialog components; no domain folder without domain logic
- Abstraction: shadcn table/badge/avatar primitives; 1 real feature/13 call sites; removes 16 feature CSS selectors and bespoke status/avatar markup; adds 198 registry-source lines
- New files: 2 API boundaries; 1 schema contract; 1 server-state hook; 3 feature components; 3 shadcn UI primitives
- State/cache: TanStack Query owns players; page owns search/form/dialog state; successful server mutations broadly invalidate active queries
- Tests: migrated players contracts to strict MSW; added malformed 200, invalidation, required reason, focus, allowlist, and permission coverage; 23 files/58 tests
- Verified: `pnpm verify` green; 0 boundary violations; 982.4 kB/516.5 kB gzip build; Playwright 1/1; headed visual/padding check; embedded `/players` 200
- Performance: 500 rows; unchanged refetch 0 row renders; typed filter 0; one changed player 1; before memo typed filter 3611
- NOT verified: remote CI; real RCON action; screen-reader audit; React DevTools browser extension (React Profiler API used)
- Deleted: old player API/hooks/keys/card/action/schema paths, overview key barrel, 16 player CSS selectors, and temporary profiler/QA tests
- Follow-ups found (not fixed): simplify `app/routing` in its ticket; pre-existing React Doctor query-provider warning; Knip CSS hint; legacy global input precedence until FE-26

### FE-19 review — done — 2026-08-18
- Changed: design-reviewed the reference slice before FE-20 copies it; 14 defects fixed across 7 stacked commits (`39a75e9`..`bb3235c`); AGENTS.md gains a Feature shape section
- Simplest design: no new folders, no new abstractions, no new dependencies. The action vocabulary stayed a copy table and row buttons stayed literal JSX, because the row renders four conditional slots rather than seven actions
- Abstraction: `needsReason` returns to the existing copy table as a conditional type over the request union; 1 table, 7 entries, 2 consumers; removes a duplicated predicate and the `actionDetails()` reshaper; adds no runtime code
- New files: `players-query.ts` (React-free key/fetcher/freshness), `hooks/use-player-action.ts`, `player-action-copy.test.ts`. `schemas/` deleted as a one-file folder
- State/cache: mutation status has exactly one owner (the TanStack mutation) and one surface (the dialog); pending state carries which surface started the action so a success resets only that surface; D-2c broad invalidation unchanged, and now asserted for what it actually promises including that it reaches the session query
- Tests: 23 files/58 tests to 24 files/65 tests. Every behavioural fix was checked by reintroducing the bug and confirming the new test fails
- Verified: `pnpm verify` green; 0 boundary violations; 982.9 kB/516.7 kB gzip. `Extract<PlayerActionRequest, { reason: "" }>` confirmed to narrow to the five no-reason actions, and claiming `op` needs a reason confirmed to fail `tsc`. `TableHead` class overrides confirmed against tailwind-merge
- Performance: 500 rows, re-measured. Search keystroke 0 row renders; unchanged poll refetch 0; one changed player 1. The same probe with an inline `onAction` measures 500 renders per keystroke and 500 for one changed player, which is what the single `useCallback` buys
- NOT verified: not run against the Go binary and Playwright not run this pass; the row-header cell was not eyeballed in either theme, only its class merge checked; focus restore after a *successful* action, where the trigger relabels or unmounts, is still uncovered; Base UI's autofocus target in the reason dialog unchecked; no screen-reader pass on the rowheader change; no real RCON action; remote CI not run
- Deleted: `actionDetails()`, the redundant outbound `parse()`, the duplicate page-level error Notice, the dialog's template-string remount key, the page's copy of the schema's own error message, the `!players.data` branch, the `?? []` allocation, the per-call `TextEncoder`, and the test's hardcoded copy of the overview cache key
- Follow-ups found (not fixed): **F-1** `authentication-boundary.tsx:32` renders a full-screen error on `session.isError`, the session query has `retry: false`, and D-2c invalidates it on every player action, so one transient background refetch failure replaces the whole dashboard mid-keystroke; fix is `session.isError && !session.data`, own ticket before FE-20. **F-2** route constants for `app/routing` (`router.tsx` writes `"overview"`, `routes.ts` writes `"/overview"`). **F-3** `worlds-page.tsx` has the same success-callback conflation this pass removed from players. **F-4** `worlds-api.ts` re-parses an already-typed `File` and throws a raw `ZodError`. **F-5** dependency-cruiser's `pathNot` whitelist names `keys.ts`/`creation.ts`, neither of which exists. **F-6** `ConfirmDialog`'s footer still uses `modal__actions`. **F-7** shared async-state and page-header still emit legacy classes. **F-8** the identifier shares the row-header cell, so the row header's accessible name includes the UUID; its own column would make it terser
