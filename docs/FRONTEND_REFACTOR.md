# Frontend Refactor Plan

> **Status:** Not started. Baseline is commit `890c1a8` (FE-14).
> **Rules:** [AGENTS.md](../AGENTS.md) is the enforceable contract. This file holds
> the reasoning and the migration sequence, and gets deleted when FE-28 merges.

---

## 0. Requirements — verbatim

Kept word-for-word. Do not reinterpret into generic clean-architecture patterns.

> want to use tailwind i dont want to use styles.css (the tokens and stuff from shadcn should be there and stuff that actually is global, but else i want to use tailwind in small testable components). I want it to be STUPID SIMPLE, AHA, SOLID, with focus on preformance, code quality, and follow all best practises for the libs used but also react and code in general. I want it to be feature proof and easy to maintain, and also somewhat modular.

> I want a production grade system, with small modular files, i want it to be STUPID SIMPLE, follow priciples like AHA and SOLID. I want each file to do one job and that one job really well. I want preformance, as few re-renders possible.

> I want folders in the features, since it would be easier to develop the feature, and if there is one file its easy for the file to become big, i dont want that.

> No i dont like it i dont like the bad namings, i dont like anything of this.

> And what kind of interface is this? Do you call this production grade code with good code quliaty?

```ts
interface PlayerService {
  getPlayers(): Promise<Player[]>
}

class PlayerServiceImpl implements PlayerService {}
```

> This sucks, we hide to much:

```ts
httpRequest("/api/v1/players", playersSchema)
```

> We can create a request abstraction from fetch, but we shouldn't hide the url, nor nothing else. Like api.get is fine, api.post is fine. but not this.

> I dont like how you name stuff, PlayerCard.tsx, queries should be hooks useX.ts i dont like camel case i think.

> I like useX and stuff like that but i do not like PlayerCard then player-card.tsx is better.

> Follow tkdoko, Kent c dodds, matt pocock, context7 best practises, shadcn documentation.

> I would like to use pnpm insted of npm

> I want as few deps as possible.

> NO:

```ts
export const playersApi = {
  get: async () => {
    const response = await api.get("/api/v1/players")

    return playersSchema.parse(response)
  },
}
```

> Yes:

```ts
export function usePlayers() {
  return useQuery(playersQuery())
}
```

These outrank architectural fashion, generated templates, and any model's
preferred patterns unless changed by explicit agreement.

---

## 1. What is actually wrong today

Concrete, verified against `890c1a8`. This is the case for doing the work.

| ID | Evidence | Why it matters |
|---|---|---|
| F-1 | `src/lib/api/httpClient.ts:8` — `httpRequest(path, schema, options)` | The exact rejected signature. Method is buried in `options.method`; a reader cannot see whether a call mutates. |
| F-2 | `src/App/styles/application.css` — 358 lines | Feature selectors in a central stylesheet. Deleting a feature leaves dead CSS; changing a component means editing two files. |
| F-3 | `PlayerCard.tsx`, `PlayersPage.tsx`, `PlayerActionDialog.tsx`, `AuthForm.tsx` | Mixed conventions. `player.hooks.ts` dot-namespacing appears nowhere in the requirements. |
| F-4 | `package-lock.json` | npm, not pnpm. Blocks every documented command. |
| F-5 | `OverviewPage.tsx` 158 lines, `ConsolePage.tsx` 140, `AuditPage.tsx` 128 | Pages carrying implementation, not orchestration. Only `overview`, `players`, `settings` have `components/` at all. |
| F-6 | `src/pages/` alongside `src/App/routing/route-modules/` | Two homes for the same concept. |
| F-7 | `components/common/ActionDialog.tsx` | Generic name; verify it represents one concept and not two callers coincidentally sharing markup. |
| F-8 | No MSW, no bench, no bundle baseline | Cannot prove behavior preserved or performance unchanged while refactoring. |

Anything not on this list is not a known problem. Do not fix it speculatively.

---

## 2. Priority order

1. **Correctness**
2. **Security**
3. **Simplicity**
4. **Maintainability & accessibility**
5. **Measured performance**

Simplicity outranks performance because a measured hot path can justify
complexity, and a theoretical rerender cannot. Nothing below "measured
performance" belongs in a priority list — cleverness is not a goal.

---

## 3. Why these principles, in one paragraph each

**STUPID SIMPLE.** Prefer the smallest correct, testable, readable implementation.
No service class with one implementation, no interface wrapping one concrete type,
no factory with one product, no config for a value that never changes, no wrapper
that only shortens a call site. Complexity must earn its existence.

**AHA over premature DRY.** Similar-looking code is not the same concept. First
use: write it. Second: notice. Third: ask whether both uses mean the same thing.
Only then extract. Duplicated Tailwind classes are cheaper than a wrong
abstraction. Abstract concepts, not coincidental syntax.

**SOLID without ceremony.** Useful parts: one reason to change per module, narrow
public surfaces, dependency direction that does not leak infrastructure into
high-level behavior. Not useful: translating that into Java-style frontend layers.
An interface needs multiple real implementations to exist.

**Small files, for a reason.** Cohesion, reviewability, testability, smaller merge
conflicts, and precise AI edits. File size is a review signal, not a metric —
when a file grows, ask whether it now has more than one reason to change. Split by
responsibility, never to satisfy a line count.

---

## 4. The API helper — decided, not deferred

The design, so nobody re-invents it mid-migration.

```ts
// src/lib/api/api.ts
export const api = {
  get: (path: string) => request("GET", path),
  post: (path: string, init?: { body?: unknown }) => request("POST", path, init),
  put: (path: string, init?: { body?: unknown }) => request("PUT", path, init),
  delete: (path: string) => request("DELETE", path),
};
```

- Returns `Promise<unknown>`. Parsing is the caller's job, at the call site.
- Throws `ApiError` on a non-2xx response. `ApiError` keeps its current shape and
  safe messages — that behavior is already correct.
- Sets `Accept`, `Content-Type` for a body, `credentials: "same-origin"`, and the
  CSRF header on mutating methods. **Security behavior stays inside the helper on
  purpose** — it must not be possible to forget it. This is the one thing the
  helper hides, and it is documented here because of it.
- 204 returns `undefined`; the caller's schema decides whether that is valid.

Feature usage:

```ts
export async function kickPlayer(input: KickPlayerInput) {
  const data = await api.post("/api/v1/players/actions", {
    body: { action: "kick", playerId: input.playerId },
  });

  return playerActionResponseSchema.parse(data);
}
```

Removing repetition is allowed. Hiding the method, URL, body, or schema is not.

---

## 5. Sequence

FE-15 … FE-28, stacked PRs on an `fe/refactor` umbrella branch, continuing the
existing FE-NN series. One purpose per PR, zero-risk first, app working after every
merge.

Full plan with per-ticket goals, files, risks, and verification gates:
**[FRONTEND_REFACTOR_PLAN.md](FRONTEND_REFACTOR_PLAN.md)**.

Kept in one place on purpose — two copies of a sequence drift, and then neither is
trusted.

---

## 6. Testing

Tests exist to make refactoring safe, not to raise a coverage number.

- **Pure logic** — filtering, matching, permission rules, formatters: focused unit tests.
- **Components** — Testing Library, by role and visible text. Loading, error, and
  empty states; destructive confirmations; disabled-by-permission; success and failure.
- **Network** — MSW. Unexpected request fails the test. Cover malformed 200s and
  mutation invalidation.
- **E2E** — few, high value, against the production build. Critical paths only.
- **Performance** — render- or request-count gates only where a regression is
  expensive. Not on every component.

Avoid coupling tests to implementation details; they are what makes FE-19 through
FE-25 possible.

---

## 7. Non-negotiable through all of it

Preserve behavior, API contracts, security properties, accessibility, and UX.

Do **not** preserve an abstraction because it exists. Every abstraction in the new
frontend justifies itself again: what repeated concept is it, how many real
consumers, what complexity does it remove, what does it add.

The finished frontend should not feel architected. It should feel obvious.

---

## 8. Definition of done

`pnpm verify` green, E2E green against the production build, plus:

- [ ] Every F-1…F-8 finding in §1 is resolved or explicitly waived with a reason.
- [ ] No file left with more than one reason to change (reviewed, not measured).
- [ ] No cross-feature internal imports, no cycles, no `export *`.
- [ ] `httpClient.ts`, `application.css`, `src/pages/` gone.
- [ ] pnpm is the only package manager; every dependency justified; none removable.
- [ ] Console streaming and players table profiled; budgets set from FE-15 numbers.
- [ ] Embedded Go server, deep links, refresh, mobile, keyboard all verified.
- [ ] This file deleted.

One checklist, tied to findings. Not ninety boxes nobody ticks.
