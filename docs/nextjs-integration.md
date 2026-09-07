# Next.js integration

Wzorce setup-u `@abeon/sdk-ts` w aplikacji Next.js 15 (App Router) — auth flow, SSR ↔ CSR, basePath, WebSocket. Wszystkie przykłady działają z PHP-owym `abeon/sdk` po stronie backendu.

## 1. Env vars

`.env.local` per aplikacja:

```dotenv
# Publiczne — embedded w client bundle
NEXT_PUBLIC_ABEON_API_URL=https://app.abeon.pl
NEXT_PUBLIC_ABEON_BASE_PATH=/cms
NEXT_PUBLIC_ABEON_WS_URL=wss://app.abeon.pl/notifications/ws
NEXT_PUBLIC_ABEON_PUSHER_KEY=cms_reverb_key

# Server-only
ABEON_INTERNAL_API_URL=http://cms-service.abeon.svc.cluster.local
ABEON_JWKS_URL=https://app.abeon.pl/auth/.well-known/jwks.json

# MUSZĄ pokrywać PHP SDK `auth.cookies.*` (commit 26c7bae w abeon-sdk-php)
ABEON_JWT_COOKIE_NAME=abeon_token
ABEON_REFRESH_COOKIE_NAME=abeon_refresh
```

## 2. `next.config.js`

```js
/** @type {import('next').NextConfig} */
module.exports = {
    basePath: process.env.NEXT_PUBLIC_ABEON_BASE_PATH,
    reactStrictMode: true,
    output: 'standalone',
};
```

## 3. `middleware.ts` — auth gate + token rotation

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getServerAuthContext, refreshTokenIfExpired } from '@abeon/sdk-ts/server';

export async function middleware(req: NextRequest) {
    const cookies = req.cookies as unknown as Parameters<typeof getServerAuthContext>[0];

    // 1. Try to refresh if access token is near expiry (N6).
    const refresh = await refreshTokenIfExpired(cookies, {
        authBaseUrl: process.env.ABEON_INTERNAL_API_URL!,
    });

    // 2. Re-read auth state (after potential refresh).
    const { user } = await getServerAuthContext(cookies);

    if (!user) {
        return NextResponse.redirect(new URL('/auth/login', req.url));
    }

    // 3. Propagate new cookies (if refresh fired) to the actual response.
    const response = NextResponse.next();
    for (const cookie of refresh.setCookieHeaders) {
        response.headers.append('Set-Cookie', cookie);
    }
    return response;
}

export const config = {
    matcher: ['/((?!auth/login|_next/static|_next/image|favicon.ico).*)'],
};
```

## 4. Root `layout.tsx` — hydration-safe provider

```tsx
import { cookies } from 'next/headers';
import { getServerAuthContext } from '@abeon/sdk-ts/server';
import { AbeonProvider } from '@abeon/sdk-ts/react';

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user } = await getServerAuthContext(cookies());
    return (
        <html lang="pl">
            <body>
                <AbeonProvider initialAuth={{ user }}>{children}</AbeonProvider>
            </body>
        </html>
    );
}
```

`initialAuth` jest konsumowane synchronicznie przy pierwszym renderze klienta — żaden flash niezalogowanego stanu, żaden hydration mismatch.

## 5. Server Component — SSR fetch via `createServerApiClient`

```tsx
import { cookies, headers } from 'next/headers';
import { createServerApiClient } from '@abeon/sdk-ts/server';
import type { User } from '@abeon/sdk-ts';

export default async function ProfilePage() {
    const api = createServerApiClient(cookies(), headers());
    const me = await api.get<{ data: User }>('/api/v1/me');
    return <pre>{JSON.stringify(me.data, null, 2)}</pre>;
}
```

**V1 contract** (kluczowe): `createServerApiClient` czyta JWT z cookie `abeon_token` i wystawia jako `Authorization: Bearer <jwt>`. NIE forwarduje `Cookie` header — PHP `AuthMiddleware` ignoruje cookies, czyta tylko Authorization.

**V3:** forwarduje `X-Correlation-ID` z `headers()` na pierwszym hop, fallback do nowego UUIDv4.

## 6. Client Component — `useAuth` + `useApi`

```tsx
'use client';
import { useAuth, useApi } from '@abeon/sdk-ts/react';
import { useEffect, useState } from 'react';
import type { Contact } from '@/types';

export function ContactsList() {
    const { user, hasPermission } = useAuth();
    const api = useApi();
    const [contacts, setContacts] = useState<Contact[]>([]);

    useEffect(() => {
        if (!hasPermission('crm.contacts.read')) return;
        api.get<{ data: Contact[] }>('/api/v1/contacts').then((r) => setContacts(r.data));
    }, [api, hasPermission]);

    if (!user) return null;
    return <ul>{contacts.map((c) => <li key={c.id}>{c.email}</li>)}</ul>;
}
```

## 7. `<AppSwitcher>` data via `useApps` (V4)

`@abeon/ui`'s `<AppSwitcher>` consumes the federated app list:

```tsx
'use client';
import { useApps } from '@abeon/sdk-ts/react';
import { AppSwitcher } from '@abeon/ui';

export function Sidebar() {
    const { apps, loading } = useApps();
    if (loading) return <SidebarSkeleton />;
    return <AppSwitcher apps={apps} currentApp="cms" />;
}
```

Source of truth: PHP `Abeon\SDK\Services\ServiceRegistry::list()` exposed at `/api/v1/auth/apps`, filtered server-side by user permissions.

## 8. WebSocket notifications (V5)

```tsx
'use client';
import { useEffect, useMemo } from 'react';
import { createEcho } from '@abeon/sdk-ts/client';
import { useNotifications } from '@abeon/sdk-ts/react';
import { NotificationCenter } from '@abeon/ui';

export function TopbarBell() {
    const echo = useMemo(
        () =>
            createEcho({
                // V5: backend declares Broadcast::routes(['middleware' => ['abeon.auth']]).
                // Default authEndpoint = `${basePath}/broadcasting/auth` — works with Sanctum.
            }),
        [],
    );

    useEffect(() => () => echo.disconnect(), [echo]);

    const { notifications, unreadCount, markAsRead, markAllAsRead, connected } =
        useNotifications({ echo });

    return (
        <NotificationCenter
            notifications={notifications}
            unreadCount={unreadCount}
            connected={connected}
            onRead={markAsRead}
            onReadAll={markAllAsRead}
        />
    );
}
```

### Backend pre-requisite (V5)

The Laravel backend behind this app must register `/broadcasting/auth` with the SDK auth middleware:

```php
// routes/web.php (or where Broadcast::routes lives)
use Illuminate\Support\Facades\Broadcast;

Broadcast::routes(['middleware' => ['abeon.auth']]);

// channels.php
Broadcast::channel('user.{userId}', fn ($user, $userId) => (string) $user->id === (string) $userId);
```

This wires Echo's `/broadcasting/auth` POST through `AuthMiddleware` so Reverb authorizes the channel against the JWT.

## Gotchas

- **`req.cookies` vs `cookies()`**: in middleware use `req.cookies` (RequestCookies). In Server Components use `cookies()` from `next/headers` (ReadonlyRequestCookies). Both satisfy the `CookieReader` interface duck-typed by `@abeon/sdk-ts/server`.
- **`process.env.NEXT_PUBLIC_*`**: only `NEXT_PUBLIC_`-prefixed vars are exposed to client bundle. Server-only vars (`ABEON_INTERNAL_API_URL`, `ABEON_JWKS_URL`) are stripped in client builds.
- **Hydration mismatch**: always pass `initialAuth` from SSR to `AbeonProvider`. Without it, server renders "logged in" while client first paints "logged out" → React warns.
- **basePath in Echo authEndpoint**: `createEcho()` joins `NEXT_PUBLIC_ABEON_BASE_PATH` automatically. Override with `authEndpoint` option only if your backend is mounted differently.
- **Server Actions**: same flow as Server Components — `cookies()` from `next/headers`, build a `createServerApiClient`, hit your backend. Server Actions have built-in CSRF via encrypted action ID, so the XSRF flow is unnecessary inside actions.

## Related

- [ADR-0001 (PHP SDK)](../../abeon-sdk-php/docs/adr/0001-jwt-format.md) — JWT format, cookie ↔ Authorization translation responsibility.
- [ADR-0003 (PHP SDK)](../../abeon-sdk-php/docs/adr/0003-correlation-id.md) — Correlation ID propagation.
- [Phase 0 plan](../../abeon-shared-phase0-plan.md) — V1 / V3 / V4 / V5 fix references.
