# Refactor Run Prompt

Paste as the opening message of a Codex session, or:

```bash
codex --profile migrate "$(cat docs/refactor-run-prompt.md)"
```

Everything below the line is the prompt.

---

You are executing the BlockOps frontend refactor. Work continuously, ticket by
ticket, until every ticket is `done` or you hit a hard stop defined below. Do not
stop to ask whether to continue — continuing is the instruction.

## Read these first, in this order

1. `docs/refactor-progress.md` — current state. **This is the source of truth for
   what is finished.** Not your memory, not the conversation history.
2. `AGENTS.md` — the rules. Non-negotiable.
3. `docs/FRONTEND_REFACTOR_PLAN.md` — the ticket you are about to do.
4. `docs/FRONTEND_REFACTOR.md` §1 — the findings, if you need to know why.

Re-read `AGENTS.md` at the start of every ticket, not once per session. Rule drift
across a long run is the main failure mode here.

## Ticket queue

Execute in this order. Skip anything already `done` in the progress file.

| Ticket | What | Profile to use |
|---|---|---|
| FE-15 | Baseline + MSW | `mech` |
| FE-16 | pnpm | `mech` |
| FE-17 | Kebab-case rename + filename lint rule | `mech` |
| FE-18 | `api` helper, delete `httpClient` | `design` |
| FE-19 | Reference feature `players` | `design` |
| FE-20 | `worlds` | `migrate` |
| FE-21 | `audit` | `migrate` |
| FE-22 | `backups` | `migrate` |
| FE-23 | `overview` | `migrate` |
| FE-24 | `settings` | `migrate` |
| FE-25 | `console` | `design` |
| FE-26 | Delete `application.css` | `migrate` |
| FE-27 | Enforcement rules | `mech` |
| FE-28 | Verification + budgets | `design` |

If the session's profile does not match the ticket's, say so and continue anyway —
note it in the log. Do not silently switch models.

## Loop protocol

For each ticket:

1. **Read** the ticket in the plan file. Read the existing tests for the code you
   are about to touch — they are the behavioral contract.
2. **State it back** in two sentences: what changes, what must not change. If those
   two sentences are not clear from the plan, that is a hard stop.
3. **Do the work.** This ticket's scope only.
4. **Verify.** Run `pnpm verify`. Run the ticket's specific verification steps from
   the plan — they are listed per ticket and are not optional.
5. **Commit.** One commit per ticket, matching the existing convention:
   `refactor(frontend): <what> [FE-NN]`. Use the type that fits (`build:` for
   FE-16, `style:` for FE-26, `chore:` for FE-15).
6. **Update `docs/refactor-progress.md`**: set the status, record the commit SHA,
   append the log entry.
7. **Next ticket.** No summary-and-wait. Keep going.

## Hard stops — stop and ask

These are the only reasons to stop before the queue is empty:

- **D-1, D-2, or D-3 is undecided and the ticket needs it.** FE-18 needs D-1.
  FE-19 needs all three. Present the options and your recommendation, then stop.
  Do not decide them yourself — they change every later ticket.
- **FE-19 is complete.** Stop for human design review before FE-20. Every problem
  left in the reference feature ships seven more times. This stop is the point of
  having a reference feature.
- **FE-25 is complete.** Console has WebSocket lifecycle invariants that tests do
  not fully cover. Stop for review.
- **FE-28 needs a human.** Mobile, keyboard-only, and visual checks are not yours
  to sign off. Do the profiling and bundle comparison, then hand over the list.
- **`pnpm verify` fails twice on the same ticket.** Do not attempt a third fix.
  Report the failure output verbatim and stop.
- **You need a new dependency.** MSW in FE-15 is the only one pre-approved.
  Anything else: stop and justify.
- **The plan is wrong.** If a ticket contradicts the code, say so and stop rather
  than improvising a different design.

Anything else — keep going.

## Rules for the whole run

- **Scope discipline.** Problems found outside the current ticket go in the log's
  "Follow-ups found" line. Do not fix them. "While I was in there" is how a
  reviewable refactor becomes an unreviewable one.
- **Preserve the worktree.** `CONTRIBUTING.md`, `README.md`, `docs/ARCHITECTURE.md`,
  and `frontend/e2e/blockops.spec.ts` have uncommitted changes that are not yours.
  `docs/FRONTEND_EVOLUTION.md` is deleted on purpose. Leave all of it alone.
- **Delete as you go.** Every ticket removes the code it replaces, in the same
  commit. Two architectures side by side is a failure state.
- **Tests are contracts, not output.** Migrate the existing tests. Do not
  regenerate them — a rewritten test that passes proves nothing about behavior.
- **No new abstraction without a stated reason.** Before adding one, answer in the
  log: what repeated concept, how many real consumers, what complexity removed,
  what added. Weak answer means don't.
- **Don't hand-edit bulk renames.** FE-17 is 128 files. Script the `git mv` and the
  import rewrite, then verify with `tsc`. A by-hand pass will miss one silently.
- **Check library docs before writing library code.** TanStack Query's
  `queryOptions`, Zod v4, Tailwind v4, and shadcn/Base UI all have current docs.
  Use context7. Do not write API signatures from memory.
- **The app works after every commit.** Build it, serve it from the Go binary, load
  a deep link. A green `pnpm verify` with a broken embedded build is not green.

## Per-ticket report

Append to the log in `docs/refactor-progress.md`. Short lines, no prose:

```
### FE-NN — done — 2026-08-17
- Changed: <one line>
- Verified: pnpm verify green; <ticket-specific checks + results>
- NOT verified: <honest list — write "nothing" only if that is true>
- Deleted: <old code removed>
- Follow-ups found (not fixed): <out-of-scope items, or "none">
```

The "NOT verified" line is mandatory and is the most useful line in the report.
Never write "production ready".

## On resume

If this is a fresh session or context was compacted: read
`docs/refactor-progress.md`, find the first ticket that is not `done`, verify the
working tree is clean and the last commit matches what the log claims, then
continue from there. Do not redo finished tickets. Do not trust your own summary of
prior work over the file.
