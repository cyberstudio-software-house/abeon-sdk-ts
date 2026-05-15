# @abeon/shared

TypeScript counterpart to [`abeon/sdk`](../abeon-sdk-php) — shared types,
helpers, and React hooks for Abeon Unified frontends (Next.js, Laravel + Inertia).

## Scope

| Subpath | Contents |
|---|---|
| `@abeon/shared` | Types-only barrel (User, Permission, EventEnvelope, ProblemDetails, …), errors, constants, mappers. Safe in any environment. |
| `@abeon/shared/client` | Browser-only: `createApiClient` (native fetch wrapper, CSRF, correlation), `createEcho` (Laravel Echo + Reverb). |
| `@abeon/shared/server` | Node-only: `createServerApiClient(cookies, headers)`, `getServerAuthContext`, `refreshTokenIfExpired`, JWKS cache. |
| `@abeon/shared/react` | React provider + hooks: `<AbeonProvider>`, `useAuth`, `useApi`, `useApps` (V4), `useNotifications`. |

Tree-shake-friendly via `package.json` `exports` field and `sideEffects: false`. Importing `@abeon/shared/server` never pulls Node-only code into a browser bundle.

## Status

**Sprint A-D complete.** Phase 0 TypeScript counterpart fully implemented:

- Foundation (types, errors, constants, mappers, sync-schemas, contract tests, CI).
- HTTP + Auth (native fetch wrapper, SSR auth via `jose`, refresh rotation).
- React layer (provider, hooks, app registry).
- WebSocket (Laravel Echo + Reverb), notifications, complete docs.

See [`../abeon-shared-phase0-plan.md`](../abeon-shared-phase0-plan.md) for the plan history.

## Installation

```bash
npm install @abeon/shared
```

Published to GitHub Packages (`https://npm.pkg.github.com`). Configure `.npmrc` in your consumer app:

```
@abeon:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

## Quick examples

### Next.js — protected SSR fetch

```tsx
// app/page.tsx (Server Component)
import { cookies, headers } from 'next/headers';
import { createServerApiClient } from '@abeon/shared/server';
import type { User } from '@abeon/shared';

export default async function Profile() {
    const api = createServerApiClient(cookies(), headers());
    const me = await api.get<{ data: User }>('/api/v1/me');
    return <pre>{JSON.stringify(me.data, null, 2)}</pre>;
}
```

### React — `useAuth` + `useApi`

```tsx
'use client';
import { useAuth, useApi } from '@abeon/shared/react';

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
import { createEcho } from '@abeon/shared/client';
import { useNotifications } from '@abeon/shared/react';

export function Bell() {
    const echo = useMemo(() => createEcho({}), []);
    useEffect(() => () => echo.disconnect(), [echo]);

    const { notifications, unreadCount, markAsRead } = useNotifications({ echo });
    return <NotificationCenter unread={unreadCount} items={notifications} onRead={markAsRead} />;
}
```

Full walkthroughs:

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

- **Folder:** `abeon-shared` (sibling of `abeon-sdk-php`, no `-ts` suffix — single-language stack).
- **npm package:** `@abeon/shared`.

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

- `react` ^19 — required when using `@abeon/shared/react`
- `react-dom` ^19 — required when using `@abeon/shared/react`

## License

Proprietary — internal to the Abeon Unified platform.
