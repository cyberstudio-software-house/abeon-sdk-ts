# @abeon/sdk-ts

TypeScript counterpart to [`abeon/sdk`](../abeon-sdk-php) — shared types,
helpers, and React hooks for Abeon Unified frontends (Next.js, Laravel + Inertia).

## Scope

| Subpath | Contents |
|---|---|
| `@abeon/sdk-ts` | Types-only barrel (User, Permission, EventEnvelope, ProblemDetails, …), errors, constants, mappers. Safe in any environment. |
| `@abeon/sdk-ts/client` | Browser-only: `createApiClient` (native fetch wrapper, CSRF, correlation), `createEcho` (Laravel Echo + Reverb). |
| `@abeon/sdk-ts/server` | Node-only: `createServerApiClient(cookies, headers)`, `getServerAuthContext`, `refreshTokenIfExpired`, JWKS cache. |
| `@abeon/sdk-ts/react` | React provider + hooks: `<AbeonProvider>`, `useAuth`, `useApi`, `useApps` (V4), `useNotifications`. |

Tree-shake-friendly via `package.json` `exports` field and `sideEffects: false`. Importing `@abeon/sdk-ts/server` never pulls Node-only code into a browser bundle.

## Status

**Released and in use.** `v0.1.0` is the current tag. `abeon-boilerplate-inertia` consumes it, and
every application forked from that template inherits the dependency.

The Phase 0 scope is complete: types, errors, constants and mappers with contract tests against the
PHP schemas; the fetch wrapper and SSR auth through `jose`; the React layer — provider, hooks, app
registry, tenant switching; and the WebSocket layer over Reverb.

See [`../abeon-shared-phase0-plan.md`](../abeon-shared-phase0-plan.md) for the plan history. It keeps
that filename on purpose — the package was `@abeon/shared` when it was written.

## Installation

**Not published to any registry.** Install it from a tag:

```jsonc
// package.json
"dependencies": {
  "@abeon/sdk-ts": "git+https://github.com/cyberstudio-software-house/abeon-sdk-ts.git#v0.1.0"
}
```

A semver range works too, and picks up the newest matching tag:

```
git+https://github.com/cyberstudio-software-house/abeon-sdk-ts.git#semver:^0.1.0
```

The repository is public, so this needs no token and no `.npmrc`. Use `git+https` rather than the
`github:` shorthand — npm rewrites the shorthand to `git+ssh` in the lock file, which then demands
SSH keys from anybody who clones the consumer.

There is a `publishConfig` pointing at GitHub Packages, and it is unused: the package is
`private: true` and the registry requires a token even for a public package, which a git tag does
not.

## Quick examples

### Next.js — protected SSR fetch

```tsx
// app/page.tsx (Server Component)
import { cookies, headers } from 'next/headers';
import { createServerApiClient } from '@abeon/sdk-ts/server';
import type { User } from '@abeon/sdk-ts';

export default async function Profile() {
    const api = createServerApiClient(cookies(), headers());
    const me = await api.get<{ data: User }>('/api/v1/me');
    return <pre>{JSON.stringify(me.data, null, 2)}</pre>;
}
```

### React — `useAuth` + `useApi`

```tsx
'use client';
import { useAuth, useApi } from '@abeon/sdk-ts/react';

export function Page() {
    const { user, hasPermission } = useAuth();
    const api = useApi();

    if (!hasPermission('crm.contacts.read')) return <Forbidden />;
    // ...
}
```

### Notifications via WebSocket

```tsx
'use client';
import { useMemo, useEffect } from 'react';
import { createEcho } from '@abeon/sdk-ts/client';
import { useNotifications } from '@abeon/sdk-ts/react';

export function Bell() {
    const echo = useMemo(() => createEcho({}), []);
    useEffect(() => () => echo.disconnect(), [echo]);

    const { notifications, unreadCount, markAsRead } = useNotifications({ echo });
    return <NotificationCenter unread={unreadCount} items={notifications} onRead={markAsRead} />;
}
```

Full walkthroughs:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — comprehensive architectural reference: layers, contracts, lifecycle, extension points
- [`docs/nextjs-integration.md`](docs/nextjs-integration.md) — Next.js 15 App Router setup
- [`docs/inertia-integration.md`](docs/inertia-integration.md) — Laravel + Inertia setup
- [`docs/synchronization.md`](docs/synchronization.md) — PHP ↔ TS contract maintenance

## Synchronization with PHP SDK

The canonical JSON schemas live in [`../abeon-sdk-php/schemas/`](../abeon-sdk-php/schemas/). This repo holds a **vendored copy** in `schemas/`, updated via:

```bash
npm run sync-schemas        # copy + report diff
npm run sync-schemas:check  # CI mode — fail if drift
```

PHP DTOs and TS types are written by hand from the same schemas; contract tests validate fixtures against the schemas in **both** repos to catch drift.

## Naming

- **Folder:** `abeon-sdk-ts` (sibling of `abeon-sdk-php`). Renamed from `abeon-shared` on
  2026-09-07. The original choice was deliberately suffix-free — the reasoning was that a
  single-language stack does not need one — and it was wrong for a different reason: the name
  said the package was shared rather than what it is. Directory, repository and npm package now
  carry one name. See `CHANGELOG.md`.
- **npm package:** `@abeon/sdk-ts`.

## Development

```bash
npm install
npm run sync-schemas
npm run typecheck
npm test
npm run build
```

## Dependencies

Runtime:

- `jose` — RS256 JWT verification + JWKS resolution (server only)
- `laravel-echo` — WebSocket abstraction (client only)
- `pusher-js` — Pusher/Reverb protocol implementation

Peer (optional):

- `react` ^19 — required when using `@abeon/sdk-ts/react`
- `react-dom` ^19 — required when using `@abeon/sdk-ts/react`

## `dist/` is built on install

`dist/` is gitignored and the package entry points into it, so an install that only copied the
repository would resolve to a directory that does not exist. `npm ci` would still succeed, and every
later build, test and typecheck would fail on `Could not resolve ./components/...` — which reads as a
broken package rather than a missing build step.

The `prepare` script closes that. npm runs it both for a git dependency and for a `file:` link, which
`prepublishOnly` does not, so a consumer installing from a tag gets a built `dist/` without knowing
this package needs building at all.

## License

Proprietary — internal to the Abeon Unified platform.
