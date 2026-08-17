# Frontend evolution plan

Status: proposed direction for incremental implementation. Last reviewed: 2026-08-17.

## Execution tracker

- Overall status: `in-progress`
- Active checkpoint: `FE-08`
- Last completed checkpoint: `FE-07`
- Next action: complete the Backups feature with validated catalog/create/delete/restore hooks, confirmations, downloads, invalidation, tests, and removal of legacy backup code
- Last green verification: 2026-08-17 — `npm run typecheck`, `npm test`, `npm run build`, `npm audit --audit-level=high`, and the production-embedded Playwright journey passed
- Blockers: none
- Decisions and deviations: local commits replace pull-request slices; no screenshots or image baselines will be stored; checkpoint IDs in commit subjects provide the resumable Git reference

At the start of each work session, read this tracker, then run `git status --short` and `git log --oneline -5`. Before pausing, record the exact next action, relevant failure details, and any decision that changes the implementation. Completed checkpoints are committed with their stable ID, and their SHA can be recovered with `git log --grep='FE-xx'`.

| Checkpoint | Status | Commit subject |
| --- | --- | --- |
| `FE-00` | complete | `chore: establish BlockOps MVP baseline [FE-00]` |
| `FE-01` | complete | `docs(frontend): record refactor baseline [FE-01]` |
| `FE-02` | complete | `build(frontend): migrate from Vite to Rsbuild [FE-02]` |
| `FE-03` | complete | `style(frontend): establish UI foundation [FE-03]` |
| `FE-04` | complete | `refactor(frontend): extract application providers [FE-04]` |
| `FE-05` | complete | `refactor(frontend): introduce data router and shell [FE-05]` |
| `FE-06` | complete | `refactor(frontend): validate and isolate authentication [FE-06]` |
| `FE-07` | complete | `refactor(frontend): migrate overview feature [FE-07]` |
| `FE-08` | in progress | `refactor(frontend): migrate backups feature [FE-08]` |
| `FE-09` | not started | `refactor(frontend): migrate worlds feature [FE-09]` |
| `FE-10` | not started | `refactor(frontend): migrate players feature [FE-10]` |
| `FE-11` | not started | `refactor(frontend): migrate audit feature [FE-11]` |
| `FE-12` | not started | `refactor(frontend): migrate settings feature [FE-12]` |
| `FE-13` | not started | `refactor(frontend): migrate console feature [FE-13]` |
| `FE-14` | not started | `refactor(frontend): remove legacy boundaries [FE-14]` |
| `FE-15` | not started | `docs(frontend): complete frontend evolution [FE-15]` |

### FE-01 baseline evidence

- Tests: all Go race tests passed; both Vitest files and all four unit tests passed.
- Production build: `index.html` 497 bytes, JavaScript 292,406 bytes / 88.46 kB gzip, and CSS 27,003 bytes / 6.42 kB gzip.
- Browser journey: the production-embedded Playwright smoke test passed first-run setup, integration-unavailable states, confirmation cancellation, console connection, player error recovery, empty backups, audit data, settings, and mobile navigation.
- Theme and layout: light background `rgb(243, 245, 242)`, dark background `rgb(15, 20, 17)`, and no horizontal overflow at 390 by 844 pixels.
- Keyboard: the primary navigation buttons are sequentially reachable and expose `:focus-visible`.
- Visual baseline policy: no screenshots are retained; later checkpoints compare these observable behaviors, semantic tokens, and bundle measurements.

### FE-02 verification

- Rsbuild 2.1.13 produces the static `dist/` bundle in 0.16 seconds and preserves the Docker/Go embedding contract.
- Development and production Playwright journeys both pass, including the `/api` HTTP proxy and console WebSocket upgrade.
- Rsbuild defaults to changing proxy origins, which the backend correctly rejects for WebSockets. `changeOrigin: false` is therefore explicit to preserve the Vite behavior and BlockOps origin checks.
- Total production output is 323.2 kB raw / 97.1 kB gzip, approximately two percent above the FE-01 gzip baseline and below the ten-percent investigation threshold.
- `npm audit --audit-level=high` reports zero vulnerabilities.

### FE-03 verification

- Tailwind CSS 4.3.3 runs through PostCSS under Rsbuild; TypeScript and Rsbuild both resolve the `@/*` alias.
- The shadcn project metadata reports Base UI, `base-nova`, CSS variables, `rsc: false`, Lucide, and Tailwind v4. The CLI cannot initialize a manually configured Rsbuild project, so `components.json` was created from the documented schema and then verified with `shadcn info` before adding components.
- Only button, card, input, label, alert, dialog, sheet, and skeleton were generated. Their direct Base UI, variant, class-merging, and animation dependencies are recorded in `package-lock.json`.
- Inter Variable and JetBrains Mono Variable are bundled locally. Legacy typography now uses supported 500, 600, and 700 weights, while the original light/dark BlockOps palette is represented by semantic tokens.
- Production JavaScript plus CSS is 367.2 kB raw / 106.6 kB gzip. The 12.4% gzip increase over FE-01 was investigated: 9.8 kB gzip is the explicit Tailwind preflight/utility layer and styles for the eight checked-in primitives; the JavaScript increase remains approximately two percent. This foundation cost is accepted here and will be re-measured after route splitting and legacy CSS removal.
- The production-embedded Playwright journey passed setup, unavailable/error/empty states, confirmations, WebSocket console, audit/settings, mobile navigation, and horizontal-overflow checks. `npm audit --audit-level=high` reports zero vulnerabilities.

### FE-04 verification

- `QueryProvider` preserves the existing query defaults, `ThemeProvider` preserves the `blockops-theme` storage key and system-theme fallback, and `AppProviders` is the single provider composition boundary.
- `bootstrap.tsx` now owns root discovery, Strict Mode, providers, and rendering; `App.tsx` is composition-only while the manual router remains unchanged for FE-05.
- Typecheck, all four unit tests, the Rsbuild production build, and the production-embedded Playwright journey pass.

### FE-05 verification

- React Router DOM 6.30.3 now owns a statically created browser data router with an authentication boundary, nested application shell, `Outlet` context, permission boundary, route error UI, not-found UI, `NavLink` navigation, and seven lazy route modules. `/` replaces to `/overview`.
- The production journey refreshes every application route directly, verifies the Go SPA fallback returns 200, checks the not-found route, confirms the default route, and signs in as a viewer to verify a restricted direct route. Existing setup, feature, WebSocket, mobile, and error/empty-state checks still pass.
- The `/overview` initial route is 121.6 kB gzip for JavaScript and CSS, 28.2% above FE-01. Investigation attributes 21.4 kB to the required React Router runtime and 9.8 kB to the FE-03 Tailwind foundation; feature pages are now split into 1.9–4.3 kB gzip route chunks. The temporary overhead is accepted and remains scheduled for comparison after legacy cleanup.
- `npm audit --audit-level=high` passes. npm reports three moderate React Router advisories with no v6 fix; the available fix requires v7, which is explicitly out of scope. BlockOps uses only static internal navigation targets, no untrusted redirects, and no SSR hydration, limiting exposure until the plan permits a major upgrade.

### FE-06 verification

- Zod 4.4.3 schemas are now the source of truth for setup status, credentials, roles, users, and sessions. Setup password validation mirrors the Go backend’s UTF-8 byte bounds and Unicode character categories.
- `features/auth` owns setup/login/session/logout APIs, key factories, query and mutation hooks, forms, permission rules, and its authentication boundary. Other code imports only its explicit public API; the former auth definitions and methods were removed from global `types.ts` and `api.ts`.
- The shared HTTP client parses successful payloads before returning them and turns unreadable or schema-invalid payloads into a fixed `ApiError`. Error envelopes are length-, character-, and code-validated; arbitrary thrown errors and malformed bodies are never rendered.
- Vitest now has jsdom, Testing Library, user-event, and jest-dom support with explicit per-test cleanup. Five test files and all 11 tests pass, covering auth schemas, form behavior, permissions, malformed transport responses, and existing formatting behavior.
- Typecheck, the Rsbuild production build, `npm audit --audit-level=high`, and the full production-embedded Playwright setup/login/logout/permission journey pass. The three previously documented moderate Router v6 advisories remain unchanged.

### FE-07 verification

- `features/overview` owns discriminated availability schemas, the 10-second polling query, server-action mutation, query keys, confirmation copy, components, and its lazy route page. Available states require validated values; malformed data cannot reach rendering.
- Overview retains unavailable messaging, clamped utilization meters, permission-aware actions, delayed server-state invalidation, and backup/server confirmation behavior. The legacy global Overview DTOs and API methods were removed.
- `features/backups` now exposes the narrow validated backup schema and creation hook required by Overview. The legacy Backups page retains its existing create path only until FE-08 completes the feature in the immediately following checkpoint.
- Eight test files and all 19 tests pass, including unavailable/invalid Overview payloads and confirmation cancellation. Typecheck, production build, `npm audit --audit-level=high`, and the production-embedded Playwright journey pass; Router’s three documented moderate advisories remain unchanged.

This plan improves the BlockOps frontend without changing its product behavior, security model, or visual identity. The current green palette, quiet surfaces, restrained shadows, and light/dark modes are product assets and should be preserved.

The migration is deliberately incremental. Every milestone must leave the application buildable, testable, and usable. We will not create a second frontend beside the first one or attempt a single large rewrite.

## Goals

- Preserve the current color system and overall visual character.
- Establish a deliberate typography system.
- Use shadcn with Base UI primitives and Tailwind CSS v4.
- Replace Vite with Rsbuild while continuing to produce a static `dist/` bundle.
- Replace the manual history router with React Router v6.30's data-router APIs.
- Validate untrusted API and form data with Zod.
- Put all server state behind feature-owned TanStack Query hooks and key factories.
- Use TanStack Table where a real data grid is useful.
- Organize code by product feature with clear import boundaries.
- Prefer small, cohesive files and direct composition over speculative abstractions.
- Preserve the current backend API, permissions, CSP assumptions, Docker image, and end-to-end journeys.

## Non-goals

- Redesigning the product or replacing its colors with a stock shadcn theme.
- Introducing SSR, React Server Components, or TanStack Start. BlockOps remains a static React SPA.
- Moving server state into Context or Zustand.
- Creating frontend repositories, services, use-case classes, or interfaces that only wrap one implementation.
- Using TanStack Table for cards, small lists, or layouts that do not need table behavior.
- Generating empty folders to make every feature look identical.

## Current frontend assessment

The current frontend is a good MVP with strict TypeScript, accessible native controls, a small dependency set, real browser tests, and an already coherent color palette. The problem is that its initial seams no longer match its size.

The main hotspots are:

| Area | Current responsibility | Consequence |
| --- | --- | --- |
| `src/App.tsx` | Bootstrap, setup, session, login/setup forms, routing, permissions, theme, navigation, shell, and page selection | A 319-line root component couples almost every application concern. |
| `src/api.ts` | HTTP transport and every feature endpoint | Responses are cast to TypeScript types without runtime validation, and feature cache behavior cannot live beside the endpoint. |
| `src/types.ts` | Every DTO, domain concept, role, permission, and permission rule | Unrelated features depend on one global type module and duplicate the server contract without checking it. |
| `src/components/ui.tsx` | UI primitives, state panels, notices, modal behavior, and confirmation flows | Low-level primitives and product-level compositions evolve together in one 218-line file. |
| `src/styles.css` | Theme tokens, resets, typography, primitives, shell, every feature, and responsive rules | The 428-line stylesheet has useful design tokens but no enforceable component or typography boundary. |
| Page components | Network calls, cache keys, invalidation, local interaction state, and rendering | Query details are duplicated and components know too much about transport concerns. |
| Manual route hook | History mutation and path parsing | It cannot naturally own typed paths, search parameters, nested layouts, route-level loading, or not-found states. |

The application already uses TanStack Query, but query keys such as `["session"]` and mutation invalidation are written directly in components. This gives us the dependency without the architectural benefit.

The declared body font is `Inter`, but the font is not loaded. The browser therefore uses an available system fallback. The stylesheet also uses many ad hoc weights such as 630, 680, 690, 760, and 810 without a loaded variable font. That is why the interface feels visually attractive but typographically ungoverned.

## Architecture decisions

### 1. Target source structure

`index.tsx` is the one technical adjustment to the proposed `index.ts`: the bootstrap file renders JSX.

```text
src/
├── index.tsx
├── App/
│   ├── App.tsx
│   ├── bootstrap.tsx
│   ├── providers/
│   │   ├── AppProviders.tsx
│   │   ├── QueryProvider.tsx
│   │   └── ThemeProvider.tsx
│   ├── routing/
│   │   ├── router.tsx
│   │   └── routes.tsx
│   ├── shell/
│   │   ├── AppShell.tsx
│   │   ├── AppSidebar.tsx
│   │   └── AppHeader.tsx
│   └── styles/
│       └── globals.css
├── components/
│   ├── ui/
│   │   └── ... shadcn-managed primitives
│   └── common/
│       └── ... cross-feature BlockOps compositions
├── features/
│   ├── auth/
│   ├── overview/
│   ├── console/
│   ├── players/
│   ├── worlds/
│   ├── backups/
│   ├── audit/
│   └── settings/
└── lib/
    ├── api/
    │   ├── ApiError.ts
    │   └── httpClient.ts
    ├── formatting/
    ├── websocket/
    ├── env.ts
    └── utils.ts
```

A mature feature may contain the following, but it only creates the folders it needs:

```text
features/players/
├── api/
│   ├── players.api.ts
│   └── players.schemas.ts
├── components/
│   ├── PlayerCard.tsx
│   └── PlayerActions.tsx
├── domain/
│   ├── player.ts
│   └── playerActions.ts
├── hooks/
│   ├── playerKeys.ts
│   ├── usePlayers.ts
│   └── usePlayerAction.ts
├── PlayersPage.tsx
└── index.ts
```

Folder rules:

- `App/` composes the application. It may import feature public APIs, global components, and `lib`.
- A feature owns its transport schemas, API functions, query hooks, domain rules, components, and page.
- Features do not import another feature's internal files. If a concept is genuinely shared, move the smallest stable concept to `components/common` or `lib`.
- `components/ui` contains shadcn-generated primitives and local adjustments that retain the component's public contract.
- `components/common` contains BlockOps-specific compositions used by at least two unrelated features, such as `PageHeader`, `AsyncState`, `StatusBadge`, or `ConfirmAction`.
- `lib` contains browser/application infrastructure with no product-feature ownership: the validated HTTP client, WebSocket transport, environment access, and pure formatting utilities.
- `lib/utils.ts` is the small shadcn convention exception for the class-name utility.
- `index.ts` files expose intentional feature APIs. They are not blanket barrel exports for every internal module.

### 2. Engineering reference hierarchy

The frontend should deliberately draw from official documentation and the practical guidance of Matt Pocock, TkDodo, Kent C. Dodds, Cosden Solutions, and the React/Vercel engineering guidance. These are inputs to engineering judgment, not competing rulebooks.

When guidance conflicts, use this order:

1. BlockOps product, security, accessibility, and delivery requirements.
2. The official documentation for the exact installed library version, checked through Context7 before setup, migration, or use of a version-sensitive API.
3. Official React and TypeScript guidance.
4. Practitioner guidance that fits the concrete problem.
5. Local convention.

Convert those sources into reviewable rules:

#### React and Cosden Solutions

- Keep state at the lowest common owner that needs it.
- Derive values during render instead of copying props/query data into state.
- Use Effects only to synchronize with external systems such as the theme DOM attribute, WebSocket lifecycle, or browser APIs. User-triggered work belongs in event handlers.
- Do not add `useMemo` or `useCallback` by habit. Add them only for measured expensive work or a referential-stability contract.
- Extract a custom hook when it gives a cohesive behavior a name and hides reusable React orchestration. Do not create hooks merely to move lines out of a component.
- Prefer composition over large configuration props and boolean-prop combinations.

#### Matt Pocock / Total TypeScript

- Parse runtime values first, then infer types from the parser. Zod schemas are the source of truth for API DTO types.
- Treat network, storage, and decoded JSON values as `unknown` until validated.
- Use discriminated unions to make impossible UI, result, and component-prop states unrepresentable.
- Prefer inference and `satisfies` over broad annotations and assertions.
- Avoid `any`, unsafe `as` casts, wrapper object types, and generics that do not preserve a real relationship between inputs and outputs.
- Add exhaustive `never` checks when every domain state must be handled.

#### TkDodo / TanStack Query

- Queries are declarative. Every value used by a query function that can change its result belongs in the query key.
- Colocate query keys, options, API functions, and hooks with their feature instead of building one global query-key registry.
- Structure keys from general to specific and use one small key factory per feature.
- Keep server state in the query cache and local UI state outside it. Write directly to the cache only for server results, seeding, or deliberate optimistic updates.
- Custom query and mutation hooks own defaults, transformations, invalidation, and optimistic behavior.
- Prefer the Query Options API when loaders, prefetching, hooks, and tests must share the same `queryKey`/`queryFn` definition.

#### Kent C. Dodds

- Colocate code, tests, schemas, styles, and helpers with the feature that uses them; move them only as far away as the number of real consumers requires.
- Test behavior through the same accessible roles, labels, text, and interactions a user experiences.
- Avoid tests that assert component state, hook internals, implementation-specific child structure, or private functions.
- Prefer fewer confidence-building integration tests over many brittle implementation-detail tests.
- Add Testing Library and `user-event` when the first migrated interactive component needs DOM testing; do not add an unused test stack during the build-tool migration.

#### React/Vercel performance guidance

- Prevent avoidable request waterfalls; start independent work together and use `Promise.all` where dependencies permit it.
- Lazy-load route implementations so feature code is not all part of the initial route bundle.
- Avoid broad `export *` barrels and imports that make the bundler traverse large registries. Public feature entry points, when useful, must be narrow and explicit.
- Measure bundle and render behavior before adding memoization, virtualization, or state-store complexity.
- Keep local-storage values minimal and versioned if their shape grows beyond the current theme string.

Primary references:

- [React: Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- [React: Separating Events from Effects](https://react.dev/learn/separating-events-from-effects)
- [Total TypeScript: Discriminated Unions for Frontend Developers](https://www.totaltypescript.com/discriminated-unions-are-a-devs-best-friend)
- [TkDodo: Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)
- [TkDodo: Practical React Query](https://tkdodo.eu/blog/practical-react-query)
- [Kent C. Dodds: Colocation](https://kentcdodds.com/blog/colocation)
- [Kent C. Dodds: Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details)
- [Cosden Solutions: Custom Hooks in React](https://www.youtube.com/watch?v=I2Bgi0Qcdvc)

The reference named “coden” is not yet attached to a rule because the author or source cannot be identified unambiguously from the name alone. Add the exact link when known.

### 3. AHA and SOLID, applied pragmatically

- A component or hook gets one primary reason to change. Split it when it mixes transport, state orchestration, and substantial rendering—not because it crosses an arbitrary line count.
- Review files around 150 lines, but treat cohesion as the rule. Generated shadcn components are an exception.
- Prefer direct code for the first use. Compare the second use. Extract a shared abstraction when the repeated concept and its variation are understood.
- Compose functions and components instead of building inheritance or class hierarchies.
- Depend on a small validated HTTP boundary rather than raw `fetch` throughout features.
- Keep domain modules pure. A frontend domain layer contains permissions, value interpretation, and transformations; it does not mimic backend clean-architecture ceremony.
- Do not add `services/`, `repositories/`, `managers/`, or generic `helpers/` folders.

### 4. Server, URL, provider, and client state

Use the narrowest owner for each kind of state:

| State | Owner |
| --- | --- |
| Session, server status, players, backups, users, settings, audit events | TanStack Query |
| Route, selected page, filters worth sharing/bookmarking, audit pagination | Router URL/search parameters |
| Theme and stable application dependencies | React Context providers |
| Open dialog, selected file, field text, paused console view | Local component/feature state |
| Shared transient client state spanning distant trees | Zustand only when such a case actually exists |

Zustand is not part of the first migration. Duplicating the session or query results in a store would create two sources of truth. Console preferences or a multi-panel workspace may justify a small feature-local store later.

Adopt `react-router-dom@^6.30.3` using `createBrowserRouter` and `RouterProvider`, rather than the older `BrowserRouter`-only setup. The major version is intentionally bounded so a normal install cannot silently move the application to v7. Use nested layout routes and `Outlet` for the authenticated shell, `errorElement`/route error boundaries for failures, `route.lazy` for feature code splitting, and URL search parameters for bookmarkable filters. Authentication and permission checks live at route boundaries, while the Go API remains the authorization boundary.

The production server must continue to return the SPA entry document for valid client routes such as `/players` and `/settings`; otherwise direct navigation and refresh will fail before React Router runs.

### 5. TanStack Query conventions

Each feature owns a key factory and named query/mutation hooks. Components do not use raw endpoint functions or invalidate anonymous arrays.

```ts
export const playerKeys = {
  all: ["players"] as const,
  list: () => [...playerKeys.all, "list"] as const,
};

export function usePlayers() {
  return useQuery({
    queryKey: playerKeys.list(),
    queryFn: listPlayers,
  });
}
```

Mutation hooks own invalidation and optimistic updates. A component should call `usePlayerAction()` and render states; it should not know which cache entries an action invalidates.

Global defaults belong in `App/providers/QueryProvider.tsx`. Feature-specific retry, polling, and stale-time choices stay in the feature hook because they express product semantics.

### 6. Zod and the API boundary

All external JSON starts as `unknown` and is parsed before reaching React:

```ts
export async function getJson<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  const response = await request(path);
  return schema.parse(await response.json());
}
```

Rules:

- Put transport schemas beside the feature API in `features/<feature>/api/*.schemas.ts`.
- Infer transport types from schemas with `z.infer`/`z.output`; do not hand-maintain a duplicate interface.
- Create a separate domain type and mapper only when the UI's meaning differs from the transport shape.
- Put a form schema beside the form when it is private to that form. Move it to `domain` only when multiple workflows share the business rule.
- Normalize Zod failures and HTTP failures into one redacted `ApiError` shape for the UI. Never display arbitrary server bodies.
- Continue to rely on the backend for authorization and security validation. Client validation improves correctness and feedback; it is not a security boundary.

A generic `schemas/` directory is not part of the default feature template. It becomes useful only when a feature has enough shared schemas to justify it.

### 7. TanStack Table scope

Use TanStack Table first for the audit log, where column definitions, filtering, pagination, sorting, and empty/loading rows form a real table model. It may later fit the user and backup lists if those screens gain comparable behavior.

Do not use it for overview metrics, player cards, world actions, or short static fact lists. A semantic HTML table can remain plain when it has no interactive table behavior.

## shadcn Base UI in a static Rsbuild application

shadcn is a source distribution system, not an application runtime. Its CLI writes components into our repository; those components are normal React code after generation. The selected primitive backend is recorded in `components.json`.

The official CLI recognizes the current project as an unconfigured Vite React application. It does not provide a dedicated Rsbuild template. That does not prevent using shadcn with Rsbuild.

The setup order will be:

1. Replace the Vite scripts/configuration with Rsbuild and `@rsbuild/plugin-react`.
2. Keep the entry explicit at `src/index.tsx`, preserve the `dist/` output, and reproduce the `/api` HTTP/WebSocket development proxy.
3. Add Tailwind CSS v4 through `@tailwindcss/postcss` and `postcss.config.mjs`.
4. Add the `@/*` TypeScript alias; Rsbuild reads TypeScript path aliases natively.
5. Create `src/App/styles/globals.css` and map Tailwind/shadcn semantic tokens to the existing BlockOps palette.
6. Initialize shadcn for an existing TypeScript SPA with Base UI, CSS variables, Lucide icons, `src/components/ui`, and `src/lib/utils.ts` aliases.
7. Use the Nova geometry as the starting component style, but replace its palette with BlockOps tokens before migrating any screen.
8. Add only the components required by the current migration slice. Do not install the complete registry.

Base UI composition differs from Radix-based shadcn examples. Use Base UI's `render` prop instead of `asChild`, provide `nativeButton={false}` when a button renders a link, pass `items` to Select when label lookup requires it, and follow the Base UI value shapes for controls such as Toggle Group. Examples must come from the Base UI documentation path.

Useful references:

- [shadcn Base UI documentation](https://ui.shadcn.com/docs/components/base)
- [shadcn Vite installation](https://ui.shadcn.com/docs/installation/vite)
- [React Router v6.30: `createBrowserRouter`](https://reactrouter.com/6.30.3/routers/create-browser-router)
- [React Router v6.30: lazy routes](https://reactrouter.com/6.30.3/route/lazy)
- [Rsbuild migration from Vite](https://rsbuild.rs/guide/migration/vite)
- [Rsbuild Tailwind CSS setup](https://rsbuild.rs/guide/styling/tailwindcss)

## Visual system

### Color

Keep the existing palette as the canonical source and map it to semantic names:

| BlockOps token | Light | Dark | shadcn role |
| --- | --- | --- | --- |
| Background | `#f3f5f2` | `#0f1411` | `--background` |
| Surface/card | `#ffffff` | `#171d19` | `--card`, `--popover` |
| Raised/muted surface | `#f8faf7` / `#eef2ed` | `#202923` / `#1d2520` | `--secondary`, `--muted` |
| Foreground | `#18201c` | `#e9efea` | `--foreground`, `--card-foreground` |
| Muted text | `#66716a` | `#98a49b` | `--muted-foreground` |
| Primary | `#25653f` | `#7bc391` | `--primary`, `--ring` |
| Accent surface | `#e4f2e8` | `#1c3425` | `--accent` |
| Border/input | `#dce2dc` / `#c7d0c8` | `#2b352e` / `#3a463e` | `--border`, `--input` |

Keep success, warning, danger, and information as explicit semantic tokens in addition to the standard shadcn set. Verify text, icon, focus-ring, and control contrast in both themes before removing the old CSS variables.

### Typography

Self-host Inter Variable and JetBrains Mono. This preserves the intended character of the current UI, avoids an external font request under the product CSP, and makes the chosen weights real rather than synthesized.

Use only four weights: 400 for body, 500 for supporting emphasis, 600 for controls/labels, and 700 for titles. Use semantic roles rather than choosing size and weight independently in each component:

| Role | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Display | `clamp(2.5rem, 5vw, 5rem)` / `0.98` | 700 | Authentication/product statement only |
| Page title | `clamp(2rem, 3vw, 3rem)` / `1.05` | 700 | One per page |
| Section title | `1.25rem` / `1.4` | 600 | Card groups and major sections |
| Component title | `1rem` / `1.5` | 600 | Cards, dialogs, rows |
| Body | `1rem` / `1.5` | 400 | Primary reading text |
| Body small | `0.875rem` / `1.43` | 400 | Descriptions and secondary content |
| Label | `0.875rem` / `1.43` | 600 | Fields, controls, table emphasis |
| Metadata | `0.75rem` / `1.33` | 500 | Timestamps, eyebrows, quiet facts |
| Code | `0.8125rem` / `1.54` | 400 mono | Console, IDs, paths, commands |

Headings use tighter letter spacing; body text stays neutral; uppercase metadata uses restrained tracking. Numeric metrics use tabular figures. Pages consume typography utilities/tokens and do not introduce new arbitrary weights.

## Migration sequence

### Milestone 0 — freeze the baseline

- Run type checks, unit tests, the production build, and the Playwright smoke journey.
- Capture light and dark screenshots of authentication, overview, console, audit, and settings at desktop and mobile widths.
- Record current bundle output and key accessibility behavior so visual migration can be compared rather than remembered.

Exit condition: current behavior and visuals have a reproducible baseline.

### Milestone 1 — build and styling foundation

- Replace Vite with Rsbuild while preserving npm/Make targets, static `dist/`, Docker embedding, development API/WebSocket proxying, and Vitest/Playwright.
- Add Tailwind CSS v4, path aliases, `components.json`, Base UI shadcn, `cn`, and the global token file.
- Load the self-hosted variable fonts and encode the typography roles.
- Add only the initial shadcn primitives needed for the shell and authentication.

Exit condition: the existing app still behaves the same, the build/test pipeline is green, and one token source can express both themes.

### Milestone 2 — application boundary

- Create `index.tsx`, `App/bootstrap.tsx`, `AppProviders`, Query and Theme providers.
- Add React Router v6.30's data router and move navigation, permission-aware routes, route errors, not-found behavior, and shell composition into `App/routing` and `App/shell`.
- Extract authentication as the first reference feature.
- Keep the authenticated session in TanStack Query; do not mirror it to another store.

Exit condition: `App.tsx` is composition only, and auth/shell behavior is covered by tests.

### Milestone 3 — validated data boundary

- Add Zod and the shared HTTP error/JSON parsing boundary.
- Move setup/session/auth endpoints and types into the auth feature.
- Establish feature query-key and mutation-invalidation conventions.
- Add contract fixtures for successful and malformed responses.

Exit condition: migrated features cannot receive unparsed JSON, and malformed responses fail predictably without exposing raw server content.

### Milestone 4 — migrate vertical feature slices

Migrate one feature completely before starting the next:

1. Overview — read-only reference slice.
2. Backups — query plus confirmation mutations.
3. Worlds — upload/download and destructive confirmation flows.
4. Players — repeated mutations and permission-aware actions.
5. Audit — TanStack Table, typed URL filters, and eventual server pagination.
6. Settings — forms, users, and integration mutation flows.
7. Console — reconnecting WebSocket, bounded history, filters, and command state; migrate last because it has the most specialized runtime behavior.

For each slice:

- Add schemas and API functions.
- Add keys and `useX` hooks.
- Move domain rules and components.
- Replace old primitives with the required shadcn/Base UI components.
- Add/adjust unit and browser coverage.
- Delete the old page/API/type/CSS code made unreachable by that slice.

Exit condition: no feature is split indefinitely between old and new architecture.

### Milestone 5 — remove transitional code and enforce boundaries

- Remove `src/pages`, the global `api.ts`, global `types.ts`, `components/ui.tsx`, and feature rules from the legacy stylesheet after their final consumers are gone.
- Add focused lint rules for React hooks, TanStack Query, and feature import boundaries.
- Check for cycles and unused exports.
- Run React Doctor, type checks, unit tests, production build, and Playwright.
- Compare final screenshots and accessibility behavior with the baseline.

Exit condition: the target tree is real, not an overlay on the old structure, and all repository delivery checks pass.

## Definition of done for every pull request

- The change is one coherent migration slice and does not mix an unrelated redesign.
- Existing security and permission behavior is preserved.
- New external data is parsed with Zod before use.
- Server access is exposed through a named feature hook with a stable query key.
- New reusable UI uses a shadcn/Base UI primitive before custom reimplementation.
- New colors and type styles come from semantic tokens.
- Values derivable from props, query data, or existing state are not duplicated in state.
- Effects synchronize external systems; interaction logic stays in event handlers.
- Component tests exercise accessible user behavior rather than implementation details.
- Keyboard, focus, loading, empty, error, and reduced-motion behavior are considered.
- Type checks, relevant unit tests, production build, and applicable browser journeys pass.
- Superseded code is removed in the same slice when safe.

## First implementation slice

Start with Milestone 0 and Milestone 1 only. The first code change should establish Rsbuild, Tailwind, shadcn Base UI, aliases, tokens, and typography while keeping routes, API behavior, and page structure unchanged. That gives every later feature migration a stable foundation and a visual regression baseline.
