# Inertia + Laravel integration

For apps where the Laravel backend renders Inertia React (variant B from arch doc), the `@abeon/sdk-ts` surface is **smaller** — Laravel already handles auth via Inertia shared props, no separate SSR flow.

## Stack assumptions

- Laravel 11+ with `abeon/sdk` (PHP) installed.
- Inertia.js + React adapter on the frontend.
- Vite as the bundler (Laravel default).
- `@abeon/ui` for components, `@abeon/sdk-ts` for types and hooks.

## What you use from `@abeon/sdk-ts`

| Subpath | What's used |
|---|---|
| `@abeon/sdk-ts` | All types (`User`, `Permission`, `EventEnvelope`, `ProblemDetails`, …) for typing Inertia props. Errors and constants. |
| `@abeon/sdk-ts/client` | `createApiClient()` for occasional same-origin AJAX calls outside Inertia. `createEcho()` for WebSocket. |
| `@abeon/sdk-ts/react` | `<AbeonProvider>` (fed from Inertia shared props), `useAuth`, `useApi`, `useApps`, `useNotifications`. |
| `@abeon/sdk-ts/server` | **NOT USED** — Laravel server is PHP, not Node. JWT verification happens via `Abeon\SDK\Auth\AuthMiddleware`. |

## 1. Inertia shared props (Laravel side)

```php
// app/Http/Middleware/HandleInertiaRequests.php
public function share(Request $request): array
{
    return [
        ...parent::share($request),
        'abeon' => fn () => [
            'user' => abeon_user(),  // null when not authenticated
        ],
    ];
}
```

The shared `abeon.user` payload mirrors `Abeon\SDK\DTO\User::toArray()` — same shape as the `User` TS type in `@abeon/sdk-ts`.

## 2. React entry — fed by Inertia

```tsx
// resources/js/app.tsx
import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { AbeonProvider } from '@abeon/sdk-ts/react';
import type { User } from '@abeon/sdk-ts';

interface AbeonProps {
    user: User | null;
}

createInertiaApp({
    resolve: (name) =>
        resolvePageComponent(`./Pages/${name}.tsx`, import.meta.glob('./Pages/**/*.tsx')),
    setup({ el, App, props }) {
        const abeon = (props.initialPage.props.abeon as AbeonProps) ?? { user: null };
        createRoot(el).render(
            <AbeonProvider initialAuth={{ user: abeon.user }}>
                <App {...props} />
            </AbeonProvider>,
        );
    },
});
```

## 3. Components consume `useAuth`

```tsx
import { useAuth } from '@abeon/sdk-ts/react';
import { Head } from '@inertiajs/react';

export default function Dashboard() {
    const { user, hasPermission } = useAuth();
    return (
        <>
            <Head title="Dashboard" />
            <h1>Witaj, {user?.name ?? user?.email}</h1>
            {hasPermission('crm.contacts.write') && <NewContactButton />}
        </>
    );
}
```

## 4. CSRF — Inertia handles it

Inertia automatically reads the `XSRF-TOKEN` cookie and sends `X-XSRF-TOKEN` on POST/PUT/PATCH/DELETE. **No extra setup needed** — when you use `<Link method="post">` or `router.post()`, CSRF is automatic.

When you bypass Inertia and use `createApiClient()` directly (rare), the same flow works because `createApiClient` also reads `XSRF-TOKEN` from `document.cookie`.

## 5. WebSocket — same as Next.js

The Echo setup from [nextjs-integration.md](nextjs-integration.md) works identically:

```tsx
import { createEcho } from '@abeon/sdk-ts/client';
import { useNotifications } from '@abeon/sdk-ts/react';

const echo = useMemo(() => createEcho({}), []);
const { notifications, markAsRead } = useNotifications({ echo });
```

Cookie-based auth → broadcasting auth at `/broadcasting/auth` → Reverb authorizes channel. Backend has the same `Broadcast::routes(['middleware' => ['abeon.auth']])` requirement.

## 6. App registry — `useApps`

```tsx
import { useApps } from '@abeon/sdk-ts/react';
import { AppSwitcher } from '@abeon/ui';

export function AppSidebar() {
    const { apps } = useApps();
    return <AppSwitcher apps={apps} currentApp="crm" />;
}
```

Backend serves `GET /api/v1/auth/apps` via `Abeon\SDK\Services\ServiceRegistry::list()`. The list is filtered by the current user's permissions.

## Differences vs Next.js

| Concern | Inertia | Next.js |
|---|---|---|
| Auth source | Laravel session middleware + Inertia shared props | JWT in cookie + `getServerAuthContext` (SSR) |
| Initial user data | `initialPage.props.abeon.user` | `await getServerAuthContext(cookies())` in root layout |
| CSRF | Inertia automatic | `createApiClient` reads XSRF-TOKEN cookie automatically |
| basePath | Laravel route prefixes | `next.config.js basePath` + `NEXT_PUBLIC_ABEON_BASE_PATH` |
| Server-to-server | Laravel's `Abeon\SDK\Client\ServiceClient` | `createServerApiClient` in Server Components / route handlers |
| `/server` subpath | **NOT USED** | Heavy user (auth + API client) |

## Related

- [`nextjs-integration.md`](nextjs-integration.md) — sibling document for the Next.js variant.
- [`synchronization.md`](synchronization.md) — PHP ↔ TS contract maintenance flow.
