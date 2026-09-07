# `@abeon/sdk-ts` — Architecture

**Version:** 0.2 (Phase 0.5 chrome additions on top of Sprint A–D baseline)
**Status:** Sprint A–D complete + chrome data layer added; 136 Vitest tests green; `tsc --noEmit` clean
**Date:** 2026-05-15

This document is the source of truth for how the TypeScript counterpart to
[`abeon/sdk`](../../abeon-sdk-php) is structured, what its public surface
contracts to do, and how its subsystems interact at runtime — across the
three execution contexts the package targets (browser, Node SSR, React).

It complements:

- [`README.md`](../README.md) — install, scope, quick examples.
- [`docs/nextjs-integration.md`](nextjs-integration.md) — Next.js 15 App Router walkthrough.
- [`docs/inertia-integration.md`](inertia-integration.md) — Laravel + Inertia walkthrough.
- [`docs/synchronization.md`](synchronization.md) — schema sync with the PHP SDK.

Audience: frontend engineers integrating the package into a new Abeon
service (Next.js or Inertia), package maintainers, and platform reviewers
evaluating changes that touch the cross-package contract.

---

## 1. Purpose

`@abeon/sdk-ts` is the **frontend half** of the Abeon Unified cross-service
contract. Every Abeon service that has a React frontend (11 Inertia apps +
4 Next.js apps + future chrome consumers) installs this package and uses
its types, helpers, hooks, and providers to speak the same on-the-wire
contract as the PHP backends.

The package **does**:

- Export canonical TypeScript types that mirror the JSON Schemas owned by
  the PHP SDK (`User`, `Permission`, `AppDescriptor`, `EventEnvelope`,
  `ProblemDetails`, `NotificationDto`, `Preferences`, …).
- Provide a browser-side `fetch` wrapper with auto-injected
  `X-Correlation-ID` + CSRF + RFC 7807 error mapping.
- Provide a Node-side `fetch` wrapper for SSR that translates the
  `abeon_token` cookie into `Authorization: Bearer` and forwards
  correlation IDs from inbound headers.
- Verify user JWTs in SSR via JWKS using `jose`, with proactive refresh
  flow.
- Provide a Laravel Echo / Reverb factory tuned for the Abeon WS topology
  (per-app path-prefix, TLS sidecar port resolution).
- Expose React 19 hooks for the federated chrome: `useAuth`, `useApi`,
  `useApps`, `useNotifications`, `usePreferences`, `useAppOrder`,
  `useCurrentApp`, `useRegisterCommands`, plus a `<AbeonProvider>` root.
- Stay tree-shakable: importing `@abeon/sdk-ts/server` never pulls
  Node-only code into a browser bundle.

The package **does not**:

- Render any UI — that's `@abeon/ui` (separate repo).
- Implement business logic — service apps own that.
- Implement the Auth, Notifications, or CMS services — those are
  separate PHP repos.
- Re-host the JSON Schemas — the PHP SDK at
  [`../abeon-sdk-php/schemas/`](../../abeon-sdk-php/schemas/) is the
  canonical source; this repo vendors a synced copy at `schemas/` and a
  CI check fails on drift.

---

## 2. Architectural principles

Five rules that drive every decision in this codebase:

1. **Three execution contexts, three doors.** Browser (`/client`), Node
   SSR (`/server`), React (`/react`) are exposed as distinct subpath
   exports. The root barrel is types-only and is safe in any context. The
   bundler / runtime resolves the doors; consumers never wonder "can I
   import this here?"

2. **Snake_case on the wire, your choice in the app.** All wire types use
   `snake_case` matching the PHP/JSON schemas exactly. We ship recursive
   `wireToCamel` / `camelToWire` mappers — consumers opt in. Default is
   zero mapping, so types match wire bytes and a `console.log` matches a
   `tcpdump`.

3. **Hydration-safe by construction.** Every server-rendered piece of
   state must survive arriving at the client without re-fetching or
   flashing. `<AbeonProvider initialAuth>` validates the SSR-injected user
   structurally before adopting it, then `useAuth` re-renders only on
   explicit `setUser` calls.

4. **Echo-shape over Echo-class.** Hooks that talk to WebSockets type-hint
   a duck-typed `EchoLike` interface, not the concrete `laravel-echo`
   class. Tests inject a fake; consumers in non-Reverb environments can
   adapt; the bundle stays free of WS code paths it doesn't use.

5. **Contracts mirror, not re-invent.** Every type, error class, and
   header constant has a PHP twin. When the contract changes, it changes
   in `abeon-sdk-php` first (ADR + schema), then the TS side syncs.
   `npm run sync-schemas:check` is the CI gate that catches drift.

---

## 3. Layered architecture / subpath exports

```
┌────────────────────────────────────────────────────────────────────┐
│  @abeon/sdk-ts/react   (React 19 hooks + providers)                │
│    <AbeonProvider>, <CurrentAppProvider>, <CommandRegistryProvider>│
│    useAuth, useApi, useApps, useNotifications,                     │
│    useAppOrder, usePreferences, useRegisterCommands, ...           │
├────────────────────────────────────────────────────────────────────┤
│  @abeon/sdk-ts/server  (Node-only — Next middleware, Server Comp.) │
│    getServerAuthContext (jose JWKS)                                │
│    refreshTokenIfExpired                                            │
│    createServerApiClient (cookie → Authorization Bearer)            │
├────────────────────────────────────────────────────────────────────┤
│  @abeon/sdk-ts/client  (Browser-only — credentials: include)       │
│    createApiClient (native fetch + CSRF + correlation)             │
│    createEcho (Laravel Echo + Reverb)                              │
│    crossAppHref (page-reload navigation between apps)              │
├────────────────────────────────────────────────────────────────────┤
│  @abeon/sdk-ts        (Types + errors + constants, env-agnostic)   │
│    Types (User, AppDescriptor, NotificationDto, Preferences, ...)  │
│    Errors (AbeonError, AuthError, ContractViolationError)          │
│    HEADERS, ENV, DEFAULTS, PREFERENCES_DEFAULTS                    │
│    wireToCamel / camelToWire                                       │
├────────────────────────────────────────────────────────────────────┤
│  _internal/  (private — never exported via public surfaces)        │
│    api-client-base (buildApiClient, ApiClient interface)           │
│    uuid (UUIDv4 generation — crypto.randomUUID + fallback)         │
│    cookies (CookieReader / HeaderReader interfaces)                │
│    url (joinUrl, buildQueryString)                                 │
└────────────────────────────────────────────────────────────────────┘
```

`package.json` `exports` field gates each door; importing a subpath you
don't own (e.g. `@abeon/sdk-ts/_internal/...`) fails at build time.

Each higher layer may depend on lower layers, **never the reverse**. The
`/react` door depends on `/client` (via `createApiClient` in
`AbeonProvider`); `/client` and `/server` depend on `_internal` and the
root types; `_internal` depends only on the root types.

### Direction-of-dependency rule

A module in subpath N may import from N and from any lower subpath. It
may **not** import upward. `tsc --noEmit` plus the `exports` map enforce
this — a `/server` file that tries to import `/react` won't resolve at
build time.

One deliberate exception: `/react/use-preferences.ts` calls hooks
(`useApi`, `useAuth`) that themselves use the API client from `/client`.
That's fine — `/react` is at the top of the stack.

---

## 4. Module map

### `@abeon/sdk-ts` (root)

The types-only barrel. **Safe everywhere** (no Node, no browser, no React
imports). Pure value/type re-exports.

| Module | Exports |
|---|---|
| `types/user.ts` | `User` |
| `types/permission.ts` | `Permission`, `PERMISSION_NAME_REGEX` |
| `types/role.ts` | `Role` |
| `types/pagination.ts` | `Pagination`, `PaginatedResponse<T>` |
| `types/actor.ts` | `Actor`, `ActorType` |
| `types/app-descriptor.ts` | `AppDescriptor` |
| `types/problem-details.ts` | `ProblemDetails` |
| `types/envelope.ts` | `EventEnvelope`, `EventMetadata`, `ROUTING_KEY_REGEX` |
| `types/notification.ts` | `NotificationDto` |
| `types/jwt.ts` | `UserJwtPayload`, `ServiceJwtPayload`, `AbeonJwtPayload` |
| `types/preferences.ts` | `Preferences`, `ChromePreferences`, `PinnedItem`, `RecentEntry`, `ThemePreference`, `PREFERENCES_DEFAULTS`, `THEME_STORAGE_KEY` |
| `errors.ts` | `AbeonError`, `AuthError`, `ContractViolationError`, `isProblemDetails()` type guard |
| `constants.ts` | `HEADERS` (X-Correlation-ID, Authorization, …), `ENV` (env var names), `DEFAULTS` (cookie names, issuer, TTLs) |
| `mappers.ts` | `wireToCamel<T>()`, `camelToWire<T>()` — recursive, Array/Date-aware |

### `@abeon/sdk-ts/client` (browser)

Anything that depends on `window`, `document`, `fetch`, or Laravel Echo's
client runtime.

| Module | Exports | Notes |
|---|---|---|
| `client/api-client.ts` | `createApiClient(options)` | `credentials: 'include'`, X-Correlation-ID auto, X-XSRF-TOKEN from cookie for unsafe methods, RFC 7807 → `AbeonError` |
| `client/websocket.ts` | `createEcho(options)` | Wraps `laravel-echo` for Reverb; H3 install-Pusher-once; H5 separate ws/wss ports for TLS-sidecar deployments |
| `client/cross-app-href.ts` | `crossAppHref(appPath, path?)` | Page-reload navigation builder (per arch §3.7) — strips/adds prefixes, passes absolute URLs through unchanged |

### `@abeon/sdk-ts/server` (Node SSR)

Anything that depends on `process.env`, `fetch` for SSR, or the `jose`
JWT verification library.

| Module | Exports | Notes |
|---|---|---|
| `server/auth.ts` | `getServerAuthContext`, `refreshTokenIfExpired`, types `ServerAuthContext`, `GetServerAuthContextOptions`, `RefreshOptions`, `RefreshResult` | H1: RS256 pinned (no algo confusion); H8: `Headers#getSetCookie` native; H6: CRLF guard on forwarded set-cookies |
| `server/api-client.ts` | `createServerApiClient(cookies, headers?, options?)` | V1: cookie → Authorization Bearer; V3: forward inbound X-Correlation-ID; H4: respect explicit Authorization override |
| `server/jwks.ts` | `getJwks(url, opts?)`, `clearJwksCache()` | Module-scope cache of `createRemoteJWKSet` instances; `cooldownDuration: 30_000` default |

### `@abeon/sdk-ts/react` (React 19)

| Module | Exports | Purpose |
|---|---|---|
| `react/context.ts` | `AbeonContext` (internal) | Holds user + apiClient |
| `react/provider.tsx` | `<AbeonProvider>` | Hydration-safe root provider; validates `initialAuth.user` structurally before adopting |
| `react/use-auth.ts` | `useAuth()` returning `{user, isAuthenticated, hasPermission, hasRole, setUser}` | Throws if outside `<AbeonProvider>` |
| `react/use-api.ts` | `useApi()` | Returns the stable `ApiClient` from context |
| `react/use-apps.ts` | `useApps(options?)` | GET `/api/v1/auth/apps` → AppDescriptor[]; loading/error/refresh |
| `react/use-notifications.ts` | `useNotifications(options?)` | REST initial fetch + Echo live updates + optimistic markAsRead/markAllAsRead |
| `react/current-app.ts` | `<CurrentAppProvider>`, `useCurrentApp()`, `deriveCurrentApp(pathname, apps)` | Active-app identification for chrome highlighting |
| `react/use-preferences.ts` | `usePreferences(options?)` | GET/PATCH `/api/v1/auth/me/preferences`, optimistic deep-merge |
| `react/use-app-order.ts` | `useAppOrder(options?)` | Thin wrapper over `usePreferences` for `chrome.appOrder` + `chrome.pinned` |
| `react/command-registry.ts` | `<CommandRegistryProvider>`, `useRegisterCommands(commands)`, `useCommandRegistry()`, types `Command`, `CommandRunContext`, `CommandRegistryValue` | Cmd+K palette source (per ADR-0007); mount-order-safe via initial-sync subscribe |
| `react/theme.ts` | `THEME_STORAGE_KEY`, `ABEON_THEME_DEFAULTS`, type `ThemePreference` | Re-exports; actual `ThemeProvider` lives in `@abeon/ui` (avoids `next-themes` peer-dep here) |

---

## 5. Runtime contracts

The package enforces these on-the-wire contracts on the frontend side.
Every Abeon TS frontend speaks them; this package is what makes that
automatic.

| Contract | Where | Source |
|---|---|---|
| User JWT (RS256) | `Authorization: Bearer <jwt>` outbound; cookie inbound (SSR translates) | [PHP ADR-0001](../../abeon-sdk-php/docs/adr/0001-jwt-format.md) — schema `schemas/auth/jwt-user.json` |
| Correlation ID | `X-Correlation-ID` (browser-generated, SSR-forwarded) | [PHP ADR-0003](../../abeon-sdk-php/docs/adr/0003-correlation-id.md) |
| REST envelope | Consume `{data, meta}`; throw `AbeonError(problem)` on non-2xx with `application/problem+json` body | [PHP ADR-0004](../../abeon-sdk-php/docs/adr/0004-rest-envelope-and-errors.md) |
| CSRF | `X-XSRF-TOKEN` from `XSRF-TOKEN` cookie on unsafe methods | Laravel Sanctum convention |
| Notifications | REST `/api/v1/notifications`, Reverb channel `private-user.{id}`, event `NotificationCreated` | [PHP ADR-0006](../../abeon-sdk-php/docs/adr/0006-notifications-contract.md) |
| Apps list | `GET /api/v1/auth/apps` → `{ data: AppDescriptor[] }` | [PHP ADR-0010](../../abeon-sdk-php/docs/adr/0010-auth-me-and-apps-endpoints.md) |
| Preferences | `GET/PATCH /api/v1/auth/me/preferences` returning versioned blob | [PHP ADR-0009](../../abeon-sdk-php/docs/adr/0009-user-preferences.md) |
| Broadcasting auth | Echo POSTs to `${basePath}/broadcasting/auth` with cookies; backend translates | [PHP ADR-0008](../../abeon-sdk-php/docs/adr/0008-broadcasting-auth.md) |
| Cmd+K commands | Per-service in-memory registry (no cross-app FT in Phase 0.5) | [PHP ADR-0007](../../abeon-sdk-php/docs/adr/0007-search-and-command-registry.md) |
| Cross-app links | Full page reload via `<a href>` from `crossAppHref(app.path, path)` | Arch doc §3.7 |

---

## 6. SSR auth flow

Lifecycle when a Next.js / Inertia request first lands on the server.

```
HTTP request (browser ─ HttpOnly cookies ─ origin server)
   │
   ▼
┌──────────────────────────────────────────────────────────┐
│ Server runtime (Next middleware / Inertia controller)    │
│                                                          │
│   ★ refreshTokenIfExpired(cookies, {authBaseUrl, ...})   │
│       - Read access cookie (`abeon_token`)               │
│       - decodeJwt → exp                                  │
│       - If within 60s of expiry:                         │
│           POST {auth}/api/v1/auth/refresh                │
│           with Cookie: abeon_refresh=...                 │
│         On success → return setCookieHeaders[]           │
│         (caller appends them to outgoing response)       │
│                                                          │
│   ★ getServerAuthContext(cookies, {jwksUrl, ...})        │
│       - Read access cookie                               │
│       - jwtVerify with jose, algorithm: ['RS256']        │
│         issuer: 'abeon-auth', audience: 'abeon'          │
│       - JWKS resolved via getJwks(url) → module cache    │
│         (cooldownDuration: 30_000ms — fetches refresh    │
│          at most every 30s even on miss)                 │
│       - Assert payload.type === 'user'                   │
│       - Build User from {sub, email, name, roles,        │
│         permissions, org_id}                             │
│       Returns { user, payload } or { user:null, ... }    │
│                                                          │
│   ★ createServerApiClient(cookies, headers)               │
│       - V1 cookie → Authorization Bearer                 │
│       - V3 forward X-Correlation-ID (or generate)        │
│       - CSRF: XSRF-TOKEN cookie → X-XSRF-TOKEN header    │
│       - Returns ApiClient bound to ABEON_INTERNAL_API_URL│
│                                                          │
│   Server Component / Inertia handler runs                │
│       const me = await api.get<{data: User}>('/me')      │
│       const apps = await api.get('/auth/apps')           │
│                                                          │
│   Render <AbeonProvider initialAuth={{user}}>            │
│       ↓ (hydration → browser)                            │
└──────────────────────────────────────────────────────────┘
   │
   ▼
HTML + serialised initial state → browser
```

The TS side accepts a wider `CookieReader` interface than Next.js's own
type — it just needs `get(name): { value: string } | undefined`. This
covers Next 13/14/15 `cookies()`, Inertia shared props, mocked cookies in
tests, and any future runtime.

Three subtle properties:

- **H1 — RS256 pinned.** `jose`'s default `jwtVerify` will accept any
  algorithm the JWK advertises. Pinning `algorithms: ['RS256']` closes the
  `alg: none` / HS256-with-public-key confusion attack surface.
- **H2 — `onError` callback distinguishes "no token" from "bad token".**
  Missing cookie → silently anonymous. Present-but-failing-verification →
  `onError(err)` fires, letting callers redirect to login instead of
  rendering an anonymous shell with stale data.
- **H8 — `Headers#getSetCookie()` native.** Node 20+, no fallback needed.
  The old `.get('set-cookie')` collapsed multiple cookies into a
  comma-joined string, which is wrong for cookies with internal commas.

---

## 7. Browser API client flow

```
React component
   │
   const api = useApi();
   await api.post('/api/v1/contacts', body);
   │
   ▼
┌──────────────────────────────────────────────────────────┐
│ ApiClient (built by createApiClient)                     │
│                                                          │
│   baseUrl: NEXT_PUBLIC_ABEON_API_URL | window.origin     │
│   basePath: NEXT_PUBLIC_ABEON_BASE_PATH (per-app prefix) │
│                                                          │
│   Headers built per request:                             │
│     Accept: application/json                             │
│     X-Correlation-ID: <stable UUIDv4 per client>         │
│     X-XSRF-TOKEN: <from XSRF-TOKEN cookie>  (if unsafe)  │
│     Content-Type: application/json          (if JSON body)│
│                                                          │
│   credentials: 'include'  →  browser sends cookies       │
│                                                          │
│   fetch(...) → Response                                  │
│                                                          │
│   If !response.ok:                                       │
│     parse body as JSON                                   │
│     isProblemDetails(parsed) → throw AbeonError(parsed)  │
│     else → throw AbeonError({type:'about:blank',         │
│                  title:'HTTP {n}', status:{n}, ...})     │
│                                                          │
│   If 204: return undefined                               │
│   If application/json: response.json()                   │
│   else: response.text()                                  │
└──────────────────────────────────────────────────────────┘
```

The correlation ID is **stable per ApiClient instance**, not per request.
Generating fresh-per-request would make ApiClient construction a side
effect and break memoisation in `useApi`. The trace ID for a single
session matches across all API calls — which is what observability tools
expect.

CSRF only applies to non-safe methods (POST/PUT/PATCH/DELETE). On safe
methods (GET/HEAD/OPTIONS) it's omitted to keep responses cacheable.

---

## 8. Server-side API client flow

Identical surface to the browser ApiClient (`get`/`post`/`put`/`patch`/`delete`/`request`),
different head wiring. Critical translations:

| Browser client | Server client |
|---|---|
| Cookies sent by browser | Cookies must be **read manually** and translated |
| Origin → cookie domain match | Internal K8s DNS (`crm-service.abeon.svc.cluster.local`); no cookie domain |
| `Authorization` omitted (cookie auth) | `Authorization: Bearer <jwt>` set from cookie (V1 contract — PHP `AuthMiddleware` reads header only) |
| `X-Correlation-ID` generated per client | Forwarded from inbound `headers()` if present; generated if not (V3) |
| CSRF: cookie → header for unsafe methods | Same (Sanctum convention) |
| Base URL: public URL | `ABEON_INTERNAL_API_URL` (not exposed to browser) |

The H4 escape hatch: if a service endpoint is system-only (cron, internal
worker), the caller can pass an explicit `Authorization` in `options.headers`
and the cookie-translation is skipped. Lets us use the same client for
user-impersonation and service-to-service patterns.

---

## 9. React subsystem

### 9.1 Provider stack

The canonical composition for a chrome-enabled app (Inertia or Next):

```tsx
<ThemeProvider {...ABEON_THEME_DEFAULTS}>        {/* @abeon/ui or next-themes */}
  <AbeonProvider initialAuth={{ user }}>          {/* @abeon/sdk-ts/react */}
    <CurrentAppProvider currentApp="crm">         {/* @abeon/sdk-ts/react */}
      <CommandRegistryProvider>                   {/* @abeon/sdk-ts/react */}
        <App />
      </CommandRegistryProvider>
    </CurrentAppProvider>
  </AbeonProvider>
</ThemeProvider>
```

Why outside-in:

- `<ThemeProvider>` writes `class="dark"` on `<html>` during initial paint;
  it must be the outermost provider so SSR and CSR agree on the markup.
- `<AbeonProvider>` provides auth + apiClient; depends on no other Abeon
  provider but must wrap everything that uses `useAuth` / `useApi`.
- `<CurrentAppProvider>` is independent of auth (you may render chrome on
  a login page) but should sit inside `AbeonProvider` so chrome subtrees
  see both.
- `<CommandRegistryProvider>` holds an in-memory registry; mounting it
  here means the palette can be rendered anywhere inside.

### 9.2 `AbeonProvider` — hydration safety

`<AbeonProvider initialAuth={{ user }}>` accepts a user from SSR and:

1. **Structural validation** — `isValidUser(u)` checks `id`, `email`,
   `roles`, `permissions` are present and shaped correctly. A stale cache
   or a typo at the call site is treated as "anonymous" rather than
   crashing a deep child that accesses `user.permissions[0]`.
2. **`useState` with the validated value** — initial render matches SSR.
3. **Stable `ApiClient`** — built once via `useMemo`; never recreated on
   `setUser` so downstream `useEffect([api, ...])` doesn't re-fire.

Re-rendering happens only when the consumer calls `setUser(...)` (e.g.
after login, logout, refresh). No internal polling, no auto-refetch.

### 9.3 `useNotifications` — REST + Echo + optimistic

```
mount
   │
   ├─ user from useAuth() — if null, hook is a no-op
   │
   ├─ refresh()  (autoLoad=true by default)
   │   ├─ GET /api/v1/notifications              → list
   │   └─ GET /api/v1/notifications/unread-count → count
   │       (falls back to in-list scan on 404)
   │
   ├─ if options.echo:
   │   echo.private(`user.${user.id}`)
   │   .listen('NotificationCreated', (payload) => {
   │     // M5: lightweight runtime validator (id/title/body/type strings)
   │     // — drops malformed payloads instead of corrupting state
   │     setNotifications(prev => [validated, ...prev]);
   │     if (read_at === null) setUnreadCount(c => c + 1);
   │   })
   │
   └─ markAsRead(id) / markAllAsRead():
       optimistic local state update FIRST,
       then PATCH/POST to backend (errors leave the optimistic state — by
       design; UX prefers "looks done" + later toast over "stalls then
       updates" since most failures here are transient network blips)

unmount
   │
   └─ M10: try { channel.stopListening } finally { echo.leave } finally setConnected(false)
       — defensive against teardown-during-network-blip
```

### 9.4 `usePreferences` — optimistic deep-merge

`PATCH /api/v1/auth/me/preferences` is **optimistic**: state updates
immediately with the deep-merged result, then the network call fires. On
failure the previous state is restored and an `AbeonError` surfaces in
`error`. The merge function on the client mirrors the PHP
`PreferencesController::mergeTopLevel()` so client and server see the
same shape after either side resolves.

`useAppOrder` is a thin convenience wrapper providing `setOrder` and
`setPinned` setters over `usePreferences.update({chrome: {...}})`.

### 9.5 Command registry

The Cmd+K palette in `@abeon/ui` consumes `useCommandRegistry()`. Apps
register commands inside `<CommandRegistryProvider>`:

```tsx
useRegisterCommands(
  useMemo(() => [
    { id: 'crm.nav.contacts', title: 'Kontakty', group: 'Navigation', run: () => router.visit('/crm/contacts') },
    {
      id: 'crm.search.contacts',
      title: 'Search CRM contacts',
      group: 'Search',
      provider: async (q) => api.get(`/crm/api/v1/contacts/search?q=${q}`).then(/* ... */),
    },
  ], []),
);
```

Internals:

- Registrations keyed by a `Symbol` token; unregistered on effect cleanup.
- Snapshot dedup by `id` (last write wins per id, but order preserves
  first-seen).
- `useCommandRegistry` subscribes via `version` counter + initial sync
  on effect mount — fixes the mount-order race where
  `useRegisterCommands` registers BEFORE `useCommandRegistry` subscribes
  in the same tree.

The palette UI runs async `provider()` calls with 250ms debounce; that
lives in `@abeon/ui` not here.

---

## 10. WebSocket / Echo

`createEcho()` constructs a `laravel-echo` instance configured for the
Reverb (Pusher protocol) broadcaster. Five environment-driven config
points:

| Setting | Source | Default |
|---|---|---|
| `key` | `NEXT_PUBLIC_ABEON_PUSHER_KEY` | required |
| `wsHost` | parsed from `NEXT_PUBLIC_ABEON_WS_URL` | required |
| `wsPort` / `wssPort` | parsed from `wsUrl`, override-able (H5) | inferred (443 for wss:, 80 for ws:) |
| `forceTLS` | inferred from URL scheme | matches scheme |
| `authEndpoint` | `${basePath}/broadcasting/auth`, override-able | basePath from `NEXT_PUBLIC_ABEON_BASE_PATH` |

Three opinionated behaviours:

- **H3 — Install-Pusher-once on `window`.** `laravel-echo` expects
  `window.Pusher` to be set. We do it only if absent — preventing accidental
  overwrites when an app vendors its own Pusher (phased deploy, dual-use
  apps).
- **H5 — Separate ws / wss ports.** When TLS terminates at a sidecar /
  ingress, the WSS port often differs from the WS port. Override either
  via `options.wsPort` / `options.wssPort`. Without this, Pusher silently
  fails over to the wrong port and never connects.
- **`authEndpoint: ''` disables.** Pass empty string when channel auth is
  fully public (no private/presence channels).

Channels follow the convention `private-user.{id}` for the unified
notification feed (ADR-0006), `private-org.{id}` for org-scoped feeds,
and `private-{service}.{entity}.{id}` for service-specific channels.
The PHP-side `BroadcastingAuthController` handles auth (ADR-0008).

---

## 11. Synchronization with PHP SDK

The single source of truth for every wire shape is the JSON Schema in
[`abeon-sdk-php/schemas/`](../../abeon-sdk-php/schemas/). This repo
maintains a synced copy at `schemas/`, plus hand-written TS types that
mirror them.

```
abeon-sdk-php/schemas/dto/user.json    ←──── canonical
      │
      ▼  npm run sync-schemas
abeon-sdk-ts/schemas/dto/user.json     ←──── vendored (copy)
      │
      └──── npm run sync-schemas:check (CI gate)
                fails build if vendored copy drifts

      ┌──── tests/contract/schema-fixtures.test.ts
      │     loads BOTH copies, validates fixtures against EACH,
      │     so we catch the case where the PHP side updated the
      │     schema but the TS vendored copy is stale.
      │
      ▼
abeon-sdk-ts/src/types/user.ts          ←──── hand-written
      (matches schema field-for-field, snake_case preserved)
```

Two contract tests run on every CI build:

1. **Schema-fixtures test** loads each fixture from `schemas/fixtures/`
   and validates it against both the local-vendored and PHP-source schema
   using `ajv`. Any drift = build red.
2. **Type-shape test** instantiates the TS type from a fixture; failure
   here means hand-written TS lost sync with the schema (`tsc`
   structural mismatch).

This is the cheapest reliable cross-language contract test we could
build without a code generator. Auto-generation (e.g. `json-schema-to-typescript`)
is deferred to Phase 1 once the schemas stabilise — for now,
hand-written types are clearer to read and easier to evolve.

---

## 12. Tree-shaking + bundle isolation

The `exports` field has four entries:

```json
"exports": {
  ".":        { "types": "./dist/index.d.ts",       "import": "./dist/index.js" },
  "./client": { "types": "./dist/client/index.d.ts","import": "./dist/client/index.js" },
  "./server": { "types": "./dist/server/index.d.ts","import": "./dist/server/index.js" },
  "./react":  { "types": "./dist/react/index.d.ts", "import": "./dist/react/index.js" }
}
```

`sideEffects: false` in `package.json` tells bundlers it's safe to drop
unused exports. The result:

- A Next.js client bundle that only imports `@abeon/sdk-ts` (types) gets
  zero runtime cost — types are erased.
- A client component that imports `@abeon/sdk-ts/client` gets `fetch`
  wrapper + `laravel-echo`/`pusher-js` (~30 KB). No `jose`. No Node-only
  code.
- A Server Component that imports `@abeon/sdk-ts/server` gets `jose` (~50 KB)
  but no `laravel-echo`. Tree-shake-friendly because `/server` and
  `/client` are separate entries.
- A consumer of `@abeon/sdk-ts/react` pulls React peer-dep code plus
  whatever hooks it actually invokes — `useNotifications` brings
  `EchoLike` (interface only, zero runtime cost), `usePreferences` brings
  the optimistic merge function, etc.

The four entries are built by `tsup` from four `entry` points; one bundle
each, no code splitting, full DTS generation, ESM-only.

---

## 13. Build / test / dev

```bash
# Setup
npm install
npm run sync-schemas         # vendor schemas/ from abeon-sdk-php

# Verify
npm run typecheck            # tsc --noEmit
npm test                     # vitest run (currently 136 tests)
npm run test:coverage        # v8 coverage report

# Build
npm run build                # tsup → dist/ (ESM + DTS)
npm run dev                  # tsup --watch
```

`vitest.config.ts` defaults to `environment: 'node'`. React tests opt
into `jsdom` via `// @vitest-environment jsdom` directive at the top of
the file. This keeps the unit-test suite fast (no jsdom init for pure
modules) while letting React tests run against a real DOM.

`tsup.config.ts` external-marks `react`, `react-dom`, `next/headers`,
`next/server`, `laravel-echo`, `pusher-js` — those resolve in the
consumer. The result is a tiny `dist/` (single-digit KB per subpath for
TS, plus `react/index.js` for the bundled hooks).

Test taxonomy:

| Folder | Purpose | Env |
|---|---|---|
| `tests/unit/` | Pure-module tests (mappers, errors, cross-app-href, theme, derive-current-app) | node |
| `tests/contract/` | Schema fixture validation against both schema copies | node |
| `tests/client/` | `createApiClient`, `createEcho` (mocked) | node |
| `tests/server/` | `getServerAuthContext`, `createServerApiClient` (mocked jose, mocked fetch) | node |
| `tests/react/` | `<AbeonProvider>`, hooks (React Testing Library + jsdom) | jsdom |

---

## 14. Extension points

How services and the chrome plug in.

| Need | Mechanism |
|---|---|
| Custom auth issuer/audience | Pass `{issuer, audience}` to `getServerAuthContext` |
| Per-tenant JWKS | Build a custom `JwksFn` and pass via `options.jwks` |
| Replace fetch (tests / Bun / Deno) | Pass `fetchImpl` to `createApiClient` or `createServerApiClient` |
| Custom CSRF cookie name | Pass `csrfCookieName` option |
| Service-to-service Authorization in SSR | Pass explicit `Authorization` in `headers` — H4 ensures cookie translation is skipped |
| Non-default API base URL | Pass `baseUrl` to either client; otherwise env vars |
| Register Cmd+K commands | `useRegisterCommands` inside `<CommandRegistryProvider>` |
| Read/write preferences from a custom location | Pass `path` to `usePreferences({path: '/admin/preferences'})` |
| Override notifications endpoints | Pass `fetchPath` / `unreadCountPath` to `useNotifications` |
| Custom notification channel | Pass `channelName` to `useNotifications` (defaults to `user.${id}`) |
| Echo-less tests for `useNotifications` | Pass an `EchoLike` fake — no real WS dependency |
| New app-shell variant | Wrap with your own provider; chrome components in `@abeon/ui` accept props |

All factory functions take an `options` object with defaults. Adding a
new option later is a non-breaking minor change.

---

## 15. Versioning & evolution

SemVer with one additional rule: **schemas evolve additively within a
major**.

- **PATCH** — bug fixes, doc changes, internal refactors. Safe to take.
- **MINOR** — new exports, new types, additive fields. Roll Auth first,
  then canary frontend, then bake 1 week, then platform-wide.
- **MAJOR** — breaking shape changes. Coordinated with `abeon-sdk-php`
  major bump because they share the JSON schemas.

Cross-package compatibility windows:

- TS package `1.x` consumes PHP `1.x` and `1.(x-1)`.
- A frontend running shared `1.5` may call backends on SDK `1.4` or `1.5`
  during a phased rollout, but not `1.3` (drop after one major).
- New fields in event payloads or DTOs must default to optional
  (`field?: T`) so consumers on the older version simply ignore them.

`CHANGELOG.md` (per release) lists every change. The schema sync check
catches the case where a contract changes in PHP without TS catching up.

---

## 16. What this document does not cover

Out of scope, deliberately:

- **Per-app implementation details** — each Inertia/Next service repo
  has its own README and layout files.
- **`@abeon/ui` chrome components** — see [`abeon-ui`](https://github.com/abeon/abeon-ui)
  (sibling repo). `docs/chrome-composition.md` in that repo shows how
  this package's providers compose with the UI components.
- **Backend implementation** — `@abeon/sdk-ts` describes the *frontend
  half* of every contract. The backend half lives in
  [`abeon-sdk-php`](../../abeon-sdk-php) with its own
  [`ARCHITECTURE.md`](../../abeon-sdk-php/docs/ARCHITECTURE.md).
- **CI/CD pipelines** — separate concern; the package only exposes a
  `typecheck` + `test` + `build` triple and assumes the pipeline wires
  them.
- **Threat model / security audit** — separate document (Phase 2).
  Notable defenses in place: H1 (RS256 pinned), H2 (verify-fail vs
  no-token distinction), H3 (Pusher singleton), H6 (CRLF guard on
  forwarded Set-Cookie), H8 (`getSetCookie` native).
