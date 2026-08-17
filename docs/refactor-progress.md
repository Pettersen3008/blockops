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
| FE-19 reference feature `players` | todo | — | **gate:** needs D-1/D-2/D-3 + human design review |
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
| D-2 | Cross-feature cache invalidation | — | — | — |
| D-3 | Is `ActionDialog` one concept | — | — | — |

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
