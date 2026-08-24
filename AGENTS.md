# AGENTS.md

Non-negotiable rules for the BlockOps frontend. Read before editing `frontend/`.

Reasoning, trade-offs, and the migration plan: [docs/FRONTEND_REFACTOR.md](docs/FRONTEND_REFACTOR.md).
Rules here are the short version. When they disagree, this file wins.

## The one rule

**Complexity must earn its existence, and important behavior must stay visible at the call site.**

Everything below is that rule applied.

## Naming

- Files are kebab-case: `player-row.tsx`, `use-players.ts`, `players-api.ts`.
- React identifiers stay PascalCase: `player-row.tsx` exports `PlayerRow`.
- Hooks: `use-players.ts` exports `usePlayers`.
- No `Impl`, `Manager`, `Service`, `Handler`, `Helper`, `Base`, `Abstract`.
- No default `-card` / `-container` / `-wrapper` / `-item` unless that is the real term.
- Enforced by `eslint` filename rule — a violation fails `pnpm verify`.

## HTTP

`api.get|post|put|delete` return `unknown`. Parse at the call site.

```ts
export async function getPlayers() {
  const data = await api.get("/api/v1/players");

  return playersSchema.parse(data);
}
```

Method, URL, body, and schema must all be readable in the calling function. No
`httpRequest(path, schema)`. No `playersApi = { get }` object wrappers.

## Runtime validation

Everything crossing a trust boundary is `unknown` until parsed: HTTP responses,
WebSocket frames, search params, `localStorage`. Types come from `z.infer`, never
from a hand-written parallel interface. Never `as Player` on network data.

## State ownership

One owner per piece of state.

| State | Owner |
|---|---|
| Server | TanStack Query |
| Shareable / URL | router search params |
| Local UI | `useState` / `useReducer` |
| Shared client | Zustand — only if genuinely shared, not installed today |
| Derived | computed during render |

Never mirror query data into `useState`. Effects synchronize with systems outside
React; they do not derive data.

## TanStack Query

- Reusable config via `queryOptions()`.
- Feature-facing hooks are good: `usePlayers()` wrapping `useQuery(playersQuery())`.
- Invalidation lives next to the mutation that causes it.
- No custom hook that only renames a TanStack hook.

## Features

`frontend/src/features/<feature>/`. Folders reflect real responsibilities — a
feature without domain logic gets no `domain/` folder. Public surface is
`index.ts` with named exports; no `export *`. Inside a feature, import directly.
Never reach into another feature's internals.

## Feature shape

`features/players/` is the worked example. Copy the rules, not its folder list.

- A folder once a responsibility has two or more non-test files. `players` earns
  `api/`, `hooks/` and `components/`. It did not earn `schemas/` for one schema.
- One file per endpoint, always.
- React-free modules sit at the feature root: `<feature>-query.ts` for the key,
  fetcher and freshness policy, `<feature>-schema.ts` for the wire contract and
  its limits. Neither may import React, so a route loader can prefetch without
  pulling in a component.
- A per-feature `AGENTS.md` only when an invariant spans files — `console`'s
  WebSocket lifecycle earns one. Otherwise the comment goes at the call site.
- A feature with nothing to put in a folder gets no folder. `worlds` is
  correctly flat.

## Styling

Tailwind utilities in components. One global stylesheet (`styles/globals.css`)
for the Tailwind import, shadcn tokens, theme variables, fonts, and genuine
global behavior. No feature selectors in global CSS. No CSS-in-JS. No per-component
CSS files.

## Dependencies

pnpm only. Before adding anything: can the platform, React, or an installed
dependency do it? A new dependency needs written justification in the PR body.

## Performance

Optimize measured work, not theoretical renders. `useMemo` / `useCallback` /
`memo` need a reason: profiling, referential stability a library requires, or
genuinely expensive work. They are not decoration.

## Before you claim done

```bash
pnpm verify
```

Every non-trivial change reports: what changed, why it is the simplest design that
works, new files and their one job, state/cache behavior changes, tests
added, commands run, **what was not verified**, and what old code was deleted.
Never write "production ready" without evidence.
