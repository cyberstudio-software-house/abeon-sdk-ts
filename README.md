# @abeon/shared

TypeScript counterpart to [`abeon/sdk`](../abeon-sdk-php) — shared types,
helpers, and React hooks for Abeon Unified frontends (Next.js, Laravel + Inertia).

## Scope

| Subpath | Contents | Sprint |
|---|---|---|
| `@abeon/shared` | Types-only barrel (User, Permission, EventEnvelope, ProblemDetails, …), errors, constants, mappers. Safe in any environment. | A |
| `@abeon/shared/client` | Browser-only: API client (native fetch wrapper), CSRF, WebSocket helpers. | B + D |
| `@abeon/shared/server` | Node-only: `createServerApiClient(cookies)`, `getServerAuthContext`, `refreshTokenIfExpired`, JWKS cache. | B |
| `@abeon/shared/react` | React hooks + provider: `<AbeonProvider>`, `useAuth`, `useApi`, `useApps`, `useNotifications`. | C + D |

Tree-shake-friendly via `package.json` `exports` field and `sideEffects: false`. Importing `@abeon/shared/server` never pulls Node-only code into a browser bundle.

## Status

**Sprint A in progress** — Foundation: scaffold, types, errors, mappers, schema sync, contract tests, CI.

See [`../abeon-shared-phase0-plan.md`](../abeon-shared-phase0-plan.md) for the full plan (v1.1).

## Naming

- **Folder:** `abeon-shared` (sibling of `abeon-sdk-php`, no `-ts` suffix since single-language).
- **npm package:** `@abeon/shared`.
- Published to GitHub Packages (`https://npm.pkg.github.com`).

## Synchronization with PHP SDK

The canonical JSON schemas live in [`../abeon-sdk-php/schemas/`](../abeon-sdk-php/schemas/). This repo holds a **vendored copy** in `schemas/`, updated via:

```bash
npm run sync-schemas        # copy + report diff
npm run sync-schemas:check  # CI mode — fail if drift
```

PHP DTOs and TS types are written by hand from the same schemas; contract tests validate fixtures against the schemas in **both** repos to catch drift.

## Development

```bash
npm install
npm run sync-schemas
npm run typecheck
npm run test
npm run build
```

## License

Proprietary — internal to the Abeon Unified platform.
