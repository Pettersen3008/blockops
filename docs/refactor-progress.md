# Refactor Progress

Machine-maintained. The agent updates this after every ticket, before starting the
next one. This is the resume point after a crash, a context compaction, or a new
session — read it first, trust it over memory.

**Status values:** `todo` · `in-progress` · `blocked` · `done` · `waived`

| Ticket | Status | Commit | Notes |
|---|---|---|---|
| FE-15 baseline + MSW | done | `0740168` | strict global MSW server |
| FE-16 pnpm | todo | — | |
| FE-17 rename + filename lint | todo | — | script the renames, do not hand-edit |
| FE-18 api helper | todo | — | **gate:** needs D-1 decided |
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
| D-1 | Who owns the CSRF token | — | — | — |
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
