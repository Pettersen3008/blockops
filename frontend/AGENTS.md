# Frontend contract

Non-negotiable rules for `frontend/` and `packages/ui/`. Repository-wide rules and
the security boundary are in the [root AGENTS.md](../AGENTS.md).

## The one rule

**Complexity must earn its existence, and important behavior must stay visible at
the call site.**

Everything below is that rule applied. Rules that `bun run verify` already enforces
are not repeated here: kebab-case filenames, no `export *`, no cross-feature
internals, React-free `*-query.ts` and `*-schema.ts`, no `@/lib/api/api` import
inside `components/`, and unused exports.

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
| Shared client | Zustand, only if genuinely shared, not installed today |
| Derived | computed during render |

Never mirror query data into `useState`. Effects synchronize with systems outside
React; they do not derive data.

Reusable query config goes in `queryOptions()`. Feature-facing hooks are good:
`usePlayers()` wrapping `useQuery(playersQuery())`. Invalidation lives next to the
mutation that causes it. No custom hook that only renames a TanStack hook.

## Naming

- A React identifier matches its file: `player-row.tsx` exports `PlayerRow`,
  `use-players.ts` exports `usePlayers`.
- No `Impl`, `Manager`, `Service`, `Handler`, `Helper`, `Base`, `Abstract`.
- No default `-card` / `-container` / `-wrapper` / `-item` unless that is the real
  term for the thing.

## Feature shape

`frontend/src/features/<feature>/`. `players` is the worked example. Copy the
rules, not its folder list.

- A folder once a responsibility has two or more non-test files. `players` earns
  `api/`, `hooks/` and `components/`. It did not earn `schemas/` for one schema.
  `worlds` is correctly flat.
- One file per endpoint, always.
- React-free modules sit at the feature root: `*-query.ts` for the key, fetcher and
  freshness policy, `*-schema.ts` for the wire contract and its limits. Name them
  after what they describe, not the folder: `players-query.ts` beside
  `player-schema.ts`. Staying React-free lets a route loader prefetch without
  pulling in a component.
- Public surface is `index.ts`, named exports only. Inside a feature, import
  directly.
- A per-feature `AGENTS.md` only when an invariant spans files. `console`'s
  WebSocket lifecycle earns one. Otherwise the comment goes at the call site.

## packages/ui

Shared interface behavior built on Base UI and Tailwind. A component moves here
only when two product call sites need the same behavior, or when it defines a
deliberate BlockOps-wide interaction rule. Feature components for players, backups,
worlds, console, and server views stay in their features.

Base UI owns focus, keyboard, and popup behavior. BlockOps owns component APIs,
variants, tokens, and visual design. Exports stay named and small: no Base UI
internals, no generic styling configuration object.

## Styling

Tailwind utilities in components. Two stylesheets exist and no more:
`packages/ui/src/styles/tokens.css` owns the design tokens, and
`frontend/src/app/styles/globals.css` owns the Tailwind import, theme variables,
fonts, and genuine global behavior. No feature selectors in global CSS. No
CSS-in-JS. No per-component CSS files.

## Dependencies

Bun only. Before adding anything: can the platform, React, or an installed
dependency do it? A new dependency needs written justification in the PR body.

## Performance

Optimize measured work, not theoretical renders. `useMemo` / `useCallback` / `memo`
need a reason: profiling, referential stability a library requires, or genuinely
expensive work. They are not decoration.

## Accessibility

Every moved or new interactive component keeps keyboard behavior, focus visibility,
accessible names, disabled behavior, and destructive-action semantics. Check both
themes, narrow screens, and focus restore after a dialog closes.

## Before you claim done

```bash
bun run --cwd frontend verify
```

Report as described in the [root AGENTS.md](../AGENTS.md).
