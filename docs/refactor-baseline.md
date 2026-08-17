# Frontend refactor baseline

Captured from `890c1a8` on 2026-08-17 with Node.js 24.19.0 and npm 11.17.0.
The repository did not yet define `pnpm verify`; FE-16 introduces that command.

## Production bundle

`npm run build` completed successfully with Rsbuild 2.1.13.

| Asset | Size | Gzip |
|---|---:|---:|
| `assets/44.9b293f1ff4.js` | 0.29 kB | 0.25 kB |
| `assets/264.42d09ff9ca.js` | 6.3 kB | 2.7 kB |
| `assets/126.457067f833.js` | 9.5 kB | 4.1 kB |
| `assets/384.a8ad7896a4.js` | 11.0 kB | 4.3 kB |
| `assets/8.b05adf2dcb.js` | 11.1 kB | 4.2 kB |
| `assets/499.88b87315ee.js` | 12.1 kB | 4.2 kB |
| `assets/785.27d12dc0d3.js` | 13.7 kB | 5.0 kB |
| `assets/786.e8b1a84833.js` | 19.6 kB | 6.6 kB |
| `assets/index.466185bc3c.js` | 23.2 kB | 8.4 kB |
| `assets/728.c7978a1bdc.js` | 29.5 kB | 9.3 kB |
| `assets/88.65f5dc2aed.js` | 52.0 kB | 17.5 kB |
| `assets/lib-router.f71eb4869a.js` | 64.4 kB | 21.6 kB |
| `assets/index.8d558daa38.css` | 68.8 kB | 15.7 kB |
| `assets/850.fc9f14d1b1.js` | 154.7 kB | 45.9 kB |
| `assets/lib-react.86e364a435.js` | 189.0 kB | 59.7 kB |

Font assets total 303.8 kB. Rsbuild reported 968.6 kB total and 512.3 kB gzip.

## Static checks and tests

| Check | Baseline result |
|---|---|
| `npm run typecheck` | passed; no diagnostics |
| `npm run lint` | passed; no diagnostics or warnings |
| `npm test` | 23 files passed; 54 tests passed |
| `npm run boundaries` | passed; 130 modules and 282 dependencies, no violations |
| `npm run knip` | passed; one configuration hint for excluded `.css` imports |
| `npm audit --audit-level=high` | 3 moderate vulnerabilities in React Router 6; available fix requires React Router 7 |
| production Playwright | 1 test passed in 10.7 seconds |
| embedded deep link | `GET /players` returned the production `index.html` from the Go binary |

## Preserved behavior referent

The production browser journey covers first-admin setup, login and logout, role
permission gating, unavailable Docker and RCON states, light and dark themes,
reduced motion, visible keyboard focus, destructive-dialog focus restoration,
console disconnect and reconnect, audit search parameters, mobile navigation,
deep links and the not-found route, and a safe error state for a malformed response.

The structural findings in `FRONTEND_REFACTOR.md` section 1 were also present:

- F-1: feature API functions called `httpRequest(path, schema, options)`.
- F-2: `application.css` contained 358 lines of feature selectors.
- F-3: filenames mixed PascalCase and dot-namespacing.
- F-4: npm and `package-lock.json` owned dependency installation.
- F-5: overview, console, and audit pages held multiple responsibilities.
- F-6: `src/pages/` existed beside route modules.
- F-7: overview and players shared `ActionDialog` without a recorded concept decision.
- F-8: no MSW harness, performance profile, or bundle baseline existed.

FE-15 adds only the strict MSW harness and this evidence; it does not change the
production behavior described above.
