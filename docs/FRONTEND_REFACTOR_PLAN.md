# Frontend Refactor — Execution Plan

> **Baseline:** `890c1a8` (FE-14). 4 965 lines across 128 files in `frontend/src`.
> **Rules:** [AGENTS.md](../AGENTS.md). **Findings and rationale:** [FRONTEND_REFACTOR.md](FRONTEND_REFACTOR.md).
> **This file:** what to do, in what order, with what proof. Delete when FE-28 merges.

Branch `fe/refactor` as umbrella. One PR per ticket, stacked. **The app builds, serves,
and passes E2E after every merge.** No ticket leaves two architectures side by side.

Each ticket below states what it changes, what it must not change, and how you know.
"Verify" is the gate — a ticket is not done because the code looks right.

---

## Decisions to make before FE-19

Three things the audit surfaced that have no obvious answer. Decide them once,
in FE-19, and every later ticket follows. Do not rediscover them per feature.

### D-1 — Who owns the CSRF token

Today: `usePlayerAction(csrfToken, onSuccess)`, `useCreateBackup(session.csrfToken, …)`,
`useServerAction(session.csrfToken, …)`. Every mutation hook takes a token as its
first positional argument, threaded from `session` through every page.

**Proposal:** the `api` helper attaches it on mutating methods, reading it from the
auth feature. Hooks lose the parameter. Rationale in [AGENTS.md](../AGENTS.md) §HTTP —
security behavior you can forget is worse than a hidden header.

**Cost:** `api` gains a dependency on auth state. Mitigate by injecting a getter at
app bootstrap, not by importing the auth feature from `lib/`.

**Alternative if rejected:** keep it explicit, but move it into an options object
(`usePlayerAction({ csrfToken })`) so it is not a positional argument.

### D-2 — Cross-feature cache invalidation

A player action invalidates overview. Today `players.hooks.ts` imports
`@/features/overview/keys` — a barrel that exists for no other reason, and a boundary
violation FE-27's dependency-cruiser rules will reject.

**Options:**

| | Approach | Cost |
|---|---|---|
| a | Feature exports its keys from `index.ts` | Legal, explicit, widens the public surface |
| b | Shared `lib/query-keys.ts` | Central, but a global module every feature edits |
| c | Broad `invalidateQueries()` on server-state mutations | Simplest; extra refetches |

**Proposal:** (a). It is the smallest change, keeps ownership with the feature, and
makes the dependency visible in the importing file. Delete `overview/keys.ts`.

### D-3 — Does `ActionDialog` represent one concept

`components/common/ActionDialog.tsx` (68 lines) exports `ConfirmDialog`, used by
overview and players. AHA says three uses of the *same concept*, not two uses of
similar markup. Read both call sites in FE-19 and decide: shared primitive, or two
feature-local dialogs that happen to look alike.

**Bias:** keep it if both need identical destructive-confirmation semantics
(a11y contract, focus restore, danger styling). Split it if one is growing
feature-specific fields — `PlayerActionDialog` already wraps it with a reason field.

---

## FE-15 — Baseline

**Goal:** make regression detectable. Nothing after this is verifiable without it.

**Do**

- Record, in `docs/refactor-baseline.md`: per-chunk production bundle sizes, `tsc`
  and `eslint` output, `vitest` pass count, `playwright` result, `depcruise` and
  `knip` output, current dependency audit warnings.
- Add MSW to `src/test/setup.ts`. Unhandled request → `onUnhandledRequest: "error"`.
- Screenshot or note the behaviors in the FRONTEND_REFACTOR.md §1 findings as they
  exist today, so "preserve behavior" has a referent.

**Files:** `src/test/setup.ts`, `package.json` (msw devDependency), new
`docs/refactor-baseline.md`.

**Dependency justification:** MSW is the only new dependency this refactor adds. It
replaces hand-rolled `fetch` mocks and is what makes FE-18 through FE-25 safe to
review — network contracts get tested instead of asserted.

**Verify:** existing suite green with MSW in place, unchanged. An intentionally
unmocked request fails a scratch test.

**Done when:** the baseline file is committed and no source file changed.

---

## FE-16 — pnpm

**Goal:** every documented command works. Zero source changes.

**Do**

- `pnpm import` → `pnpm-lock.yaml`, delete `package-lock.json`.
- `"packageManager": "pnpm@<version>"` in `package.json`.
- Add `"verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm boundaries && pnpm knip && pnpm build"`.
- Update `Dockerfile`, `Makefile`, `compose.yaml`, CI → `pnpm install --frozen-lockfile`.

**Files:** `frontend/package.json`, `pnpm-lock.yaml`, `Dockerfile`, `Makefile`,
`compose.yaml`, CI workflow. No files under `src/`.

**Risk:** the Go binary embeds `frontend/dist`. A broken build here breaks the
backend, not just the frontend.

**Verify:** `pnpm verify` green. Docker image builds. Run the Go server and load the
dashboard from the embedded assets. Deep link + refresh still resolve.

**Done when:** no `package-lock.json` anywhere, CI green on pnpm.

---

## FE-17 — Rename (mechanical, no logic)

**Goal:** one naming convention, enforced. Pure movement so the diff is reviewable
at a glance and later tickets are content-only.

**Do**

- `git mv` every file to kebab-case. Fix import paths. **Change nothing else** —
  no reformatting, no refactoring, no extraction, even where it is tempting.
- Drop dot-namespacing: `players.api.ts` → `api/players.ts` is FE-19's job, but
  `players.api.ts` → `players-api.ts` happens here.
- `PlayersPage.tsx` → `players-page.tsx`, `PlayerCard.tsx` → `player-card.tsx`,
  `AuthForm.tsx` → `auth-form.tsx`, `App/` → `app/`, and so on for all 128 files.
- Delete the empty `src/pages/` directory.
- Land the eslint filename rule in this PR. The rule and compliance must arrive
  together or the convention rots — this is the point of the ticket.

**Files:** all of `src/`. Zero content diffs outside import specifiers.

**Verify:** `git log --follow` still traces renamed files. `pnpm verify` green.
`git diff --stat` shows only renames and import lines — any other change in the
diff is a mistake in this ticket.

**Done when:** the filename rule fails on a deliberately misnamed scratch file.

---

## FE-18 — The `api` helper

**Goal:** kill `httpRequest(path, schema)`. Method and URL visible at every call site.

**Do**

- Add `src/lib/api/api.ts` per [FRONTEND_REFACTOR.md](FRONTEND_REFACTOR.md) §4:
  `get` / `post` / `put` / `delete`, returning `Promise<unknown>`, throwing `ApiError`.
- Implement D-1.
- Migrate all callers: `audit-api.ts`, `auth-api.ts`, `backups-api.ts`,
  `console-api.ts`, `overview-api.ts`, `players-api.ts`, `settings-api.ts`,
  `worlds-api.ts`. Each function parses its own schema.
- Delete `httpClient.ts` and `httpClient.test.ts` in the same PR. Port the two
  behaviors its tests cover (204 handling, malformed payload) onto `api.ts`.
- Keep `ApiError` and `safeErrorMessage` exactly as they are. That code is correct.

**Files:** new `lib/api/api.ts` + test; deleted `lib/api/http-client.ts` and its test;
8 feature api files edited. `ApiError.ts` unchanged.

**Verify:** a test asserts the CSRF header is present on POST/PUT/DELETE and absent
on GET. A test asserts a malformed 200 throws `invalid_response` and never reaches a
component. A test asserts 204 → `undefined`. Auth flow works end to end against the
Go server — this is the ticket most likely to break login.

**Done when:** `grep -r httpRequest src/` is empty.

---

## FE-19 — Reference feature: `players`

**Goal:** one feature that fully matches AGENTS.md, and that we would be happy to
see copied seven times. This is the only ticket where design is still open.

**Why players:** smallest feature that still exercises everything — queries with
`refetchInterval`, a mutation with cross-feature invalidation, permission gating,
a destructive confirmation with a reason field, a table, and Zod on both request
and response.

**Do**

- Resolve D-1, D-2, D-3.
- Restructure:

```text
features/players/
  api/
    get-players.ts            # api.get + playerCatalogSchema.parse
    run-player-action.ts      # api.post + request/response schemas
  schemas/
    player-schema.ts
  hooks/
    use-players.ts            # useQuery(playersQuery())
    use-player-action.ts      # useMutation + invalidation
  components/
    player-row.tsx            # was player-card.tsx — it is a row in a table
    player-action-dialog.tsx
  players-query.ts            # queryOptions(), the reusable config
  player-action-copy.ts       # was player.actions.ts — it is copy, not actions
  players-page.tsx
  index.ts
```

- Introduce `queryOptions()` here first: `playersQuery()` holds key, fn, and
  `refetchInterval`; `usePlayers()` is the React-facing hook.
- `player.actions.ts` is renamed by responsibility, not shortened — it is a copy
  table, and calling it "actions" hides that.
- Move any styling that lives in `application.css` for this feature into Tailwind
  utilities on the components. Do not delete the file yet; other features still use it.

**Verify**

- MSW: malformed 200 → error state, no crash, no `undefined` render.
- MSW: successful kick → `players` key invalidated, and per D-2 the overview key too.
- Testing Library: dialog opens by role, reason field required for actions that need
  it, focus returns to the trigger on close, action hidden without permission.
- Profile the table with React DevTools. Record the render count in the PR body.
- `pnpm verify` green.

**Done when:** we would copy this. Review it critically and fix it here — every
problem left in this feature ships seven more times.

---

## FE-20 … FE-25 — One feature per PR

Order is deliberate: cheapest first, riskiest last.

| Ticket | Feature | Today | The actual work |
|---|---|---|---|
| FE-20 | `worlds` | 96-line page, 4 files | Smallest. Confirms the FE-19 pattern transfers before betting on it. |
| FE-21 | `audit` | 128-line page, has `audit.filters.ts` | Filters are pure logic with tests already — keep them, they are the good part. Page splits into filters + results. |
| FE-22 | `backups` | 100-line page | Destructive confirmations and `useCreateBackup` consumed by overview — the cross-feature surface from D-2 again. |
| FE-23 | `overview` | **158-line page**, 6 imports of shared components, 3 mutation hooks | Largest page. Orchestration vs implementation: `MetricCard` and `Unavailable` exist but the page still holds permission checks, pending-action state, and layout. Delete `overview/keys.ts` (re-export barrel). |
| FE-24 | `settings` | 3 component files already, 115-line test | Mostly structural. Forms — do **not** add a form library; check whether complexity actually justifies one and record the answer. |
| FE-25 | `console` | 140-line page, `console.stream.ts` | Riskiest. WebSocket lifecycle, line buffer bounds, reconnect. Add `features/console/AGENTS.md` recording those invariants. |

**Per feature, every time**

1. Preserve behavior. Read the existing tests first — they define the contract.
2. Split by responsibility, not by line count. If a file has one reason to change, leave it.
3. Move that feature's rules out of `application.css` into Tailwind utilities.
4. Adopt `queryOptions()` + `use*` hooks.
5. Delete the code you replaced, **in the same PR**.
6. Verify: MSW malformed-response test, mutation invalidation test, user-visible
   component tests, `pnpm verify`, and the feature exercised against the Go server.

**Not allowed:** adding a folder because FE-19 has one. A feature with no domain
logic gets no `domain/`. A feature with two components does not need `components/`
if the flat files are already clear.

---

## FE-26 — Delete `application.css`

**Goal:** one global stylesheet, tokens and genuine globals only.

**Do:** confirm nothing imports `application.css`, delete its 358 lines. `globals.css`
keeps the Tailwind import, shadcn tokens, theme variables, `@fontsource` setup,
reduced-motion, and focus-visible behavior.

**Verify:** visual pass over all seven routes, light and dark. Reduced-motion
honored. Keyboard focus visible everywhere. Mobile viewport — the sheet/sidebar
behavior is the most likely casualty. Compare bundle CSS size against FE-15.

**Done when:** `App/styles/application.css` is gone and no route regressed.

---

## FE-27 — Enforcement

**Goal:** rules that hold without a reviewer remembering them.

**Do**

- dependency-cruiser: no cycles; no cross-feature internal imports (only via
  `index.ts`); no React import from pure modules; no `lib/api` import from a
  component file.
- eslint: no `any`, hooks rules, no `export *`, filename rule from FE-17.
- knip: fail on dead files, dead exports, unused dependencies.
- CI blocks merge on `pnpm verify`.

**Verify:** each rule fails on a deliberately introduced violation, then passes once
reverted. A rule not proven to fail is not a rule.

**Done when:** the FE-19-era cross-feature import would be rejected by CI.

---

## FE-28 — Verification and budgets

**Goal:** evidence, then numbers.

**Do**

- Profile console streaming under sustained output and the players table at scale.
- Compare bundle output to the FE-15 baseline. **Set budgets from those numbers** —
  not from a round figure someone likes.
- Full pass: deep links, hard refresh, mobile, keyboard-only, permissions per role,
  destructive confirmations, malformed responses, unavailable integrations,
  WebSocket disconnect and reconnect.
- Delete this file and `FRONTEND_REFACTOR.md`. Keep `AGENTS.md`.

**Done when:** every finding in FRONTEND_REFACTOR.md §1 is closed or waived with a
written reason, and `pnpm verify` plus E2E are green against the production build.

---

## What this plan will not do

Named so nobody adds them mid-refactor and calls it scope:

- No Zustand. No feature has demonstrated shared client state.
- No form library. FE-24 decides on evidence; the default is no.
- No route-level code splitting. Measure in FE-28 first; the bundle may not need it.
- No test rewrite. Existing tests are the behavioral contract — migrate them, do not
  regenerate them.
- No new dependency other than MSW without a written justification in the PR body.
