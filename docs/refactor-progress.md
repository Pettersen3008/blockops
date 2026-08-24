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
| FE-29 session refetch resilience | done | — | out of order: found in the FE-19 review, gated FE-20 |
| FE-20 `worlds` | done | — | endpoint boundaries, mutation ownership, Tailwind migration |
| FE-21 `audit` | done | `816f9ec` | query options, URL-owned filters, Tailwind table |
| FE-22 `backups` | done | `471da7d` | endpoint boundaries, destructive-action ownership, Tailwind migration |
| FE-23 `overview` | done | `962639e` | endpoint/query boundaries, mutation ownership, Tailwind sections |
| FE-24 `settings` | done | `b149cc8` | endpoint/query boundaries, mutation surfaces, Tailwind migration; no form library |
| FE-25 `console` | done | `f8e198e` | **gate:** WebSocket invariants recorded; human review still required before merge |
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

### FE-29 — done — 2026-08-18
- Changed: a session that has loaded once now survives a failed background refetch (`authentication-boundary.tsx`)
- Why: `getSession` maps 401 to null rather than to an error, so `session.isError` only fires for non-auth failures — a network blip, a 500, a malformed body. The boundary treated all of them as "signed out" and replaced the whole dashboard. D-2c refetches this query after every server-state mutation and the query does not retry, so one blip during a player action wiped the page mid-keystroke
- Simplest design: one added condition, `!session.data`. No retry policy change, no change to D-2c, no new state. The three outcomes the boundary already had are unchanged; only the case where a good session is still in hand moved
- Abstraction: none added
- State/cache: unchanged. TanStack Query still owns the session; stale-but-present session data is now preferred over an error screen while a refetch is failing
- Tests: new `authentication-boundary.test.tsx`, 3 cases — dashboard survives a failed refetch after a real invalidateQueries(); a session that never loads still gets the full-screen error; a 401 still reaches the login screen. Verified by reverting the condition and confirming the first case fails
- Verified: `pnpm verify` green; 25 files/68 tests; 0 boundary violations; 982.9 kB/516.7 kB gzip
- NOT verified: not exercised against the Go binary; no test for a session that expires while the API is also erroring, where the dashboard now stays up on stale data until a mutation returns 401; Playwright not run
- Deleted: nothing
- Follow-ups found (not fixed): the four other features still hold their own copies of the broad-invalidation call, which is D-2c working as decided, but it means the session is refetched on every mutation anywhere; if that cost ever matters the predicate form is the cheap next step

### FE-20 — done — 2026-08-24
- Changed: split the two world endpoints into `api/`, moved replacement cache invalidation into `use-replace-world.ts`, kept file/dialog reset at the page call site, and moved every Worlds selector from global CSS into component Tailwind utilities
- Simplest design: the two endpoint files earn one `api/` folder; the single hook and schema stay flat; no component split, query abstraction, effect, memoization, global state, or dependency was added
- New files: `api/download-world.ts` owns the download URL; `api/replace-world.ts` owns the PUT and response parse; `use-replace-world.ts` owns mutation invalidation
- State/cache: the page remains the sole owner of selected file, validation error, and confirmation state; TanStack Query owns mutation state; a successful replacement broadly invalidates cached views per D-2c and clears only the initiating Worlds surface
- Tests: Worlds grew from 2 to 5 page tests covering local rejection, validated upload transport and invalidation, malformed response preservation, focus restore, and permission gating; Playwright now covers a real browser File selection and confirmation cancellation
- Verified: `pnpm verify` green; 25 files/71 tests; 0 boundary violations; 984.2 kB/517.1 kB gzip build; Playwright 1/1 against temporary Go API and frontend servers; `git diff --check`; old Worlds API/hook imports and CSS selectors absent
- NOT verified: a successful real replacement against Docker/RCON and actual world data (destructive and integrations unavailable); screen-reader pass; headed MCP session (browser connector unavailable); React Doctor (would download an unapproved latest tool via npm)
- Deleted: `worlds-api.ts`, `worlds-hooks.ts`, redundant outbound File parsing, and 22 lines of Worlds selectors/responsive overrides from `application.css`
- Follow-ups found (not fixed): shared `ConfirmDialog` still uses the legacy `modal__actions` selector, already recorded as F-6 and intentionally deferred from the Worlds feature

### FE-21 — done — 2026-08-24
- Changed: split Audit into URL filter controls and results, made the empty catalog distinct from no matches, preserved the bounded TanStack table and server order, and moved every Audit selector to Tailwind
- Simplest design: the one endpoint, query config, hook, schema, controls, and results stay flat; no API/hooks/components folder, mutation, global state, request wrapper, dependency, memo, or deferred render was added
- New files: `get-audit-events.ts` owns the explicit GET and parse; `audit-query.ts` owns React-free query options; `use-audit-events.ts` owns the feature hook; `audit-schema.ts` owns the wire/search enums and 200-row bound; `audit-filter-controls.tsx` owns URL inputs; `audit-results.tsx` owns pure filtering and the table; `audit-schema.test.ts` checks the bound; `audit-route.test.tsx` checks the permission guard
- State/cache/URL: TanStack Query solely owns the catalog with the application default 5s stale time; router search params solely own `q`/`outcome`; invalid or missing outcomes replace-canonicalize to `all`; filtering stays render-derived and replace navigation preserves deep-link, reload, and back/forward behavior
- Performance: the server request and schema cap work at 200 rows, so synchronous filtering is cheaper and clearer than the deleted `useMemo`/`useDeferredValue`; TanStack Table remains because it preserves the installed table semantics without a replacement abstraction
- Tests: strict MSW covers loading, failure/retry, malformed 200, empty/no-match, all outcome tones, every case-insensitive field, safe 180-character details truncation, server order, timestamps, unauthenticated copy, URL restore/update/normalization/history, responsive scroll semantics, permission protection, and the 200-event bound; 26 files/80 tests
- Verified: focused Audit 4 files/15 tests; `pnpm --config.verify-deps-before-run=warn verify` green; 0 dependency violations; knip clean except the inherited CSS hint; production build 993.4 kB/520.3 kB gzip; `git diff --check`; old Audit paths/selectors/fetch stubs absent
- Browser QA: Playwright 1/1 twice against fresh disposable databases and current servers covered real populated Audit data plus intercepted loading, malformed, empty and no-match catalogs, URL replace/deep-link/reload/back-forward, filters/search, viewer restriction, keyboard focus, 390px table scrolling, and no horizontal page overflow; both disposable databases were deleted
- Review: findings-first correctness review found no unresolved FE-21 defect; ponytail review removed the private key/schema constants and an unnecessary test provider, net -20 lines; final verdict `Lean already. Ship.`
- Git hygiene: package/lockfiles unchanged; pnpm-generated store/workspace artifacts removed; FE-21 uses hunk staging so inherited shared-file and earlier-ticket changes remain outside its detached-HEAD commit; no push
- NOT verified: screen-reader announcement quality; authenticated visual inspection in the in-app browser, whose independent session reached sign-in only; remote CI; real production-host serving rather than the verified production build plus current dev server
- Deleted: `audit-api.ts`, `audit-hooks.ts`, `audit-keys.ts`, plural schema/test paths, Audit global selectors, fetch stubs, and speculative memo/deferred filtering
- Follow-ups found (not fixed): none

### FE-22 — done — 2026-08-24
- Changed: split all five backup endpoints, added a React-free catalog query, moved mutation failures into the initiating confirmation, reset only that action on close/success, preserved server order and Overview's public `useCreateBackup` contract, and replaced every Backups selector with responsive Tailwind utilities
- Simplest design: the five endpoints, four hooks, and two UI responsibilities earn `api/`, `hooks/`, and `components/`; no generic request/query/invalidation wrapper, mirrored state, sorting pass, memoization, global state, or dependency was added
- New files: `api/get-backups.ts`, `create-backup.ts`, `delete-backup.ts`, `restore-backup.ts`, and `backup-download-url.ts` each own one exact endpoint; `backups-query.ts` owns key/fetcher/default freshness; `backup-schema.ts` owns wire validation; `hooks/use-backups.ts`, `use-create-backup.ts`, `use-delete-backup.ts`, and `use-restore-backup.ts` each own one query or mutation; `components/backup-row.tsx` owns list-row layout/actions; `components/backup-action-dialog.tsx` owns confirmation copy/error/reset semantics; `backup-schema.test.ts` owns contract bounds
- State/cache: TanStack Query solely owns catalog and mutation state; the page solely owns pending intent; validated create/delete/restore successes broadly invalidate all cached views per D-2c; malformed successes do not invalidate or close the Backups dialog
- Behavior: loading/retry, empty/populated catalogs, server ordering, formats, retention copy, permission gating, safe GET downloads, destructive copy, disabled pending controls, focus return, and failure visibility remain; closing a failed action now clears only that action before another opens
- Performance: no client sort/map copy, memo, callback memo, polling, or download query was added; rows consume TanStack's validated array in server order and mobile layout wraps without horizontal overflow
- Tests: strict MSW replaces Backups fetch stubs; 24 focused schema/page cases cover bounds, loading/retry, empty/populated/malformed catalogs, ordering/formatting, create/delete/restore success/failure/malformed responses, confirmations, cancellation/focus, reset, invalidation, CSRF, permissions, pending controls, and download encoding; full suite is 25 files/91 tests
- Verified: focused Vitest 2 files/24 tests; `pnpm --config.verify-deps-before-run=warn verify` green; 0 dependency violations across 147 modules/321 dependencies; Knip only the inherited CSS hint; production build 985.9 kB/517.8 kB gzip; `git diff --check`; endpoint/path/selector/fetch-stub/package-artifact greps clean
- Browser QA: Playwright 1/1 twice against separate disposable API/frontend servers and fresh databases; covered Backups loading, empty/populated/malformed catalogs, unavailable-integration create failure, cancellation/focus, viewer restrictions, keyboard focus, 390px wrapping/no overflow, direct link, and reload; no delete or restore request was sent
- Review: findings-first correctness and ponytail passes found and fixed excess callback plumbing, whole-record pending state, and a weak malformed-browser fixture; final review found no in-scope correctness or over-engineering defect
- Git hygiene: inherited dirty tree preserved; FE-22 hunks in shared CSS, E2E, and progress files were staged separately; no push, dependency, package, lockfile, workspace, store, or protected-ticket ledger change
- NOT verified: real successful backup creation with RCON/world data; real destructive delete or restore; remote CI; screen-reader audit; in-app browser session, because authenticated Playwright supplied the browser and layout evidence
- Deleted: `backups-api.ts`, `backups-hooks.ts`, `backups-keys.ts`, `backup-schemas.ts`, its replaced test path, all 19 Backups-specific CSS selector/override lines, and all Backups fetch stubs
- Follow-ups found (not fixed): shared `ConfirmDialog` and non-Backups global selectors remain for their existing tickets; no FE-22 follow-up

### FE-23 — done — 2026-08-24
- Changed: split Overview into explicit GET/lifecycle endpoints, a React-free polling query, explicit hooks, and lifecycle/player/capacity/warning/confirmation components; failed or malformed mutations now keep their originating confirmation and error visible, while validated success alone closes it
- Simplest design: existing `api`, TanStack Query, Backups' public `useCreateBackup`, native `<meter>`, shared confirmation primitive, and Tailwind cover the feature; no dependency, generic wrapper, mirrored state, memoization, global state, service, factory, or speculative abstraction was added; the ponytail pass removed a redundant page-to-lifecycle state prop
- New files: `api/get-overview.ts` owns GET `/api/v1/overview`; `api/run-server-action.ts` owns POST `/api/v1/server/actions`; `overview-query.ts` owns the key, fetcher, 10-second poll, and default stale-time choice; `hooks/use-overview.ts` exposes the query; `hooks/use-server-action.ts` owns broad and delayed invalidation; `components/server-lifecycle.tsx`, `player-summary.tsx`, `capacity-section.tsx`, `warnings-section.tsx`, and `overview-confirmation.tsx` own those five UI responsibilities; `overview-schema.ts` owns bounded wire contracts; the three new schema/query/endpoint test files check those boundaries
- State/cache: TanStack Query solely owns overview, backup, and lifecycle server state; the page solely owns the pending confirmation; validated backup and lifecycle success broadly invalidate unrelated and session keys per D-2c; lifecycle success also preserves the 1.2-second Overview refresh; failure and malformed 2xx responses neither invalidate nor clean up; closing resets only the originating mutation
- Performance: preserved the 10-second poll and application 5-second stale time; kept server order and render-time derivation; added no memoization because no measured expensive render or referential-stability need exists; final build 988.8 kB, 518.4 kB gzip
- Tests: Overview now has 27 focused tests for schemas/bounds, endpoint method/body/CSRF/parsing, polling/freshness, loading/retry, unavailable and populated data, formatting/order, permissions, pending state, focus, cancellation, failures, malformed query/mutation success, origin reset, and broad invalidation; full suite is 27 files/90 tests
- Verified: focused Vitest 5 files/27 tests; `pnpm --config.verify-deps-before-run=warn verify` green; typecheck/lint/90 tests/0 boundary violations/knip/build green; `git diff --check`; old-path, selector, fetch-stub, forbidden-artifact, and package/lockfile proofs clean
- Browser QA: repository Playwright 1/1 against fresh disposable Go/Rsbuild servers; safe loading, available/unavailable/malformed responses, simulated failed backup/lifecycle actions, cancellation/focus, destructive styling, viewer permissions, keyboard focus, mobile wrapping/no overflow, deep links, and reload passed; no in-app browser was needed beyond this authenticated evidence
- Review verdict: findings-first correctness review found no remaining in-scope defect after moving cleanup from settlement to validated success; ponytail review found no removable abstraction after the redundant state prop was deleted
- Git hygiene: detached dirty tree and inherited hunks preserved; `application.css`, `blockops.spec.ts`, and this ledger were hunk-staged so FE-20 and other inherited work stays separate; no push
- NOT verified: real successful backup, start, stop, or restart against Docker/RCON; screen-reader audit; remote CI; successful destructive flows were intentionally not attempted
- Deleted: `overview-api.ts`, `overview-hooks.ts`, `overview-keys.ts`, plural schema/test paths, every Overview selector and responsive override in `application.css`, and Overview fetch stubs
- Follow-ups found (not fixed): shared `ConfirmDialog`, `PageHeader`, async states, status pills, and eyebrow styles still use legacy global selectors owned by later shared-style work, not FE-23

### FE-24 — done — 2026-08-24
- Changed: split all six Settings/users endpoints, added React-free query options and explicit hooks, made each server mutation own D-2c invalidation, isolated user-action errors by initiating dialog surface, and moved all Settings layout/responsive rules to component Tailwind utilities
- Simplest design: retained the three coherent integration/users/deployment components and page-only orchestration; the two fixed-field RCON form and three fixed-field user form need only local React state plus existing Zod parsing, so no form library, generic request/mutation wrapper, new dependency, global state, memoization, or extra responsibility folder was justified
- New files: `api/get-settings.ts` owns the settings GET; `api/update-rcon.ts` owns the RCON PUT; `api/get-users.ts` owns the users GET; `api/create-user.ts` owns the user POST; `api/disable-user.ts` owns the user DELETE; `api/revoke-user-sessions.ts` owns the revoke POST; `settings-query.ts` owns the settings key/fetcher/default freshness; `users-query.ts` owns the users key/fetcher/default freshness; `hooks/use-settings.ts` and `hooks/use-users.ts` expose the two queries; `hooks/use-update-rcon.ts`, `hooks/use-create-user.ts`, `hooks/use-disable-user.ts`, and `hooks/use-revoke-user-sessions.ts` each own one mutation and broad invalidation; `settings-schema.ts` owns Settings/users wire and form contracts; `settings-schema.test.ts` owns their pure validation coverage
- State/cache: TanStack Query solely owns both server queries and all mutation status/error data; local state owns only form drafts, validation messages, and dialog intent; successful mutations broadly invalidate every cached server view; per-open surface IDs ensure late user-mutation results cannot close or report in a later dialog; editing or closing resets stale mutation feedback only on the initiating surface
- Tests: Settings uses the strict global MSW server with 18 tests covering loading, both retry paths, empty/list/facts/locked states, malformed settings/users/create/RCON/revoke 200s, untrusted-field rejection, validation, secret clearing, CSRF, broad synthetic-key invalidation, self/disabled protection, disable/revoke semantics, error reset, late-failure isolation, cancel focus, and successful revoke focus; full suite is 25 files/82 tests
- Verified: `pnpm --config.verify-deps-before-run=warn verify` green (typecheck, lint, 25 files/82 tests, 0 dependency violations, knip, 993.0 kB/520.1 kB gzip build); repository Playwright fallback 1/1 against temporary current Go/frontend servers; browser QA covered intercepted loading/valid/malformed Settings data, local RCON/user validation, administrator mobile layout with no overflow, disable cancel/focus, and backend-enforced viewer restriction; `git diff --check` green; old Settings API/hook/key/schema paths, Settings CSS selectors, and fetch stubs absent
- QA verdict: pass; Playwright MCP was unavailable, so repo-local Playwright was used; the disposable database and servers were removed after the run, and no real RCON update, disable, or revoke request was sent
- Review verdict: no unresolved FE-24 defect; all acceptance criteria satisfied; React/Vercel review found no waterfall, bundle growth, duplicated server state, speculative memoization, or effect-derived state
- Git hygiene: no dependency/lockfile/backend change or push; inherited FE-20/FE-23/documentation/local artifacts and FE-21/FE-22 ledger rows were preserved; FE-24 was hunk-staged separately because the detached working tree also contains those unrelated changes
- NOT verified: real RCON credential persistence, real user disable/revoke, screen-reader pass, remote CI, or Playwright MCP; React Doctor was not run because its skill requires downloading unpinned `react-doctor@latest` via npx, contrary to this repository's pnpm/no-unjustified-dependency rules
- Deleted: `settings-api.ts`, `settings-hooks.ts`, `settings-keys.ts`, plural schema/test paths, and 36 Settings-specific global CSS selector/responsive lines; dependency-preflight artifacts and the disposable QA database were also removed
- Follow-ups found (not fixed): shared `ConfirmDialog` still uses the already-recorded legacy `modal__actions`/`modal__header` global selectors; pnpm's environment preflight reports MSW's intentionally blocked build script as an out-of-sync warning, though the locked install and complete verify script pass

### FE-25 — done — 2026-08-24
- Changed: moved Console to endpoint/query/hook/component responsibilities, made the WebSocket lifecycle race-safe, kept command results on their initiating surface, and replaced every Console global selector with responsive Tailwind utilities; intended loading/history/live/filter/pause/command/permission behavior is preserved
- Simplest design: two real endpoint files earn `api/`, three real hooks earn `hooks/`, and output/command responsibilities earn `components/`; parsing, URL construction, timers, cleanup, and line merging remain literal feature code with no service, generic stream/request wrapper, global state, dependency, or speculative layer
- New files: `AGENTS.md` records the cross-file lifecycle gate; `api/get-console-history.ts` and `api/execute-console-command.ts` each own one visible method/URL/body/schema boundary; `console-query.ts` owns the React-free history key/fetcher/default freshness; `console-schema.ts` owns wire/command validation; `console-lines.ts` owns pure dedupe/order/bounds; the three `hooks/` files own history query, live React state, and command invalidation respectively; `components/console-output.tsx` owns filters/pause/log/auto-scroll and `components/console-command-form.tsx` owns validation/history/result identity; the three renamed/new focused test files own schema, line, stream, and page contracts
- WebSocket invariants: unknown frames are string/JSON/Zod-validated before state; one mounted stream owns at most one socket and timer; cleanup cancels/detaches/closes/disconnects and blocks later reconnect; connecting/connected/reconnecting/disconnected remain explicit; exponential 500 ms backoff resets on open and caps at 10 s; error only closes and close alone schedules once; live/merged output stays at 2,000 while history stays at 1,000; live wins sequence overlap and sorted order is deterministic; pause snapshots while bounded ingestion continues; live-only scrolling never focuses the log. Mandatory human lifecycle review remains the merge gate
- State/cache: TanStack Query solely owns HTTP history and mutation state; history uses `queryOptions()` and the 5 s application stale-time; successful commands retain D-2c broad `invalidateQueries()` (proved with a synthetic unrelated key); local state owns only search/filter/pause and command draft/validation/history/surface identity; a changed draft hides stale success/error, pending commands cannot overlap, and only the initiating command clears its draft/history
- Performance: `useMemo` remains only around sequence merge/sort (up to 3,000 inputs) and filter/search (up to 2,000 rendered candidates); `useDeferredValue` keeps search input urgent while that bounded scan runs; `startTransition` keeps potentially frequent socket ingestion non-urgent. No `memo`, `useCallback`, or new cache was added because no other measured/structural need exists
- Tests: strict MSW replaces Console fetch stubs and covers loading/retry/empty, malformed successful history and command bodies, CSRF, byte validation with zero request, D-2c synthetic-key invalidation, one-owner failure/reset, stale-result isolation, command history, filters/severity, pause/resume/focus, and permissions; pure tests prove the 2,000 bound/live overlap/order; stream tests prove non-string/malformed/schema-invalid rejection, backoff progression/reset/cap, error-close ownership, duplicate-close suppression, timer cleanup, callback detachment, and no post-cleanup reconnect
- Verified: exact `pnpm install --frozen-lockfile` followed by `pnpm --config.verify-deps-before-run=warn verify` green — 25 files/79 tests, 0 dependency violations, 144 modules/314 dependencies, 988.8 kB/518.4 kB gzip build; focused Console 4 files/17 tests; Playwright 1/1 twice against disposable current Go/frontend servers with every Console command intercepted; `git diff --check`; old paths/selectors/fetch stubs absent; package/lock diff empty and the installer-created forbidden store/workspace file removed
- Browser QA: intercepted delayed/valid/malformed history, valid/malformed/non-string frames, disconnect/reconnect, pause accumulation/resume, invalid command with zero request, success/failure/malformed command responses, CSRF, keyboard history, viewer restriction, mobile stacking, and desktop/mobile no-overflow passed; the in-app browser independently confirmed the current Console at desktop and 390×844 (420 px desktop log floor, column filters, mobile command grid, hidden count, zero overflow) with no new console error
- Review: findings-first correctness review fixed two in-scope defects before final verification — resetting a pending mutation could permit overlapping RCON requests, and locally mirroring a successful mutation response weakened TanStack ownership/stale identity; the ponytail pass found no remaining removable production abstraction (`Lean already. Ship.`). No unresolved FE-25 finding remains
- NOT verified: no meaningful real Minecraft/RCON command, Docker integration, destructive world/server action, remote CI, screen-reader session, sustained-output profiler trace, React Doctor download, or new backend test run; existing backend code/tests were read as evidence and backend behavior was not changed
- Deleted: `console-api.ts`, `console-hooks.ts` and its mixed test, `console-keys.ts`, plural schema paths, every Console selector/responsive override in `application.css`, Console fetch stubs, duplicate mutation-response state, and the duplicate-timer/stale-socket paths
- Follow-ups found (not fixed): mandatory human WebSocket review before merge; detached dirty tree contains inherited FE-20/FE-24/shared/docs/artifact changes, so Console portions of `application.css`, `blockops.spec.ts`, and this ledger require hunk staging for a clean FE-25 commit; no commit or push performed
