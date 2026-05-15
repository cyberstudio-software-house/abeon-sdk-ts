# Code Review — `@abeon/shared` (Phase 0)

**Reviewer:** Michał Mucha (z udziałem 3 równoległych code-analyst agentów)
**Date:** 2026-05-15
**Scope:** Sprint A-D implementation (6 commitów, ~32 plików, ~1600 linii TS w `src/`, 80 tests)
**Method:** trzy niezależne perspektywy — security audit, correctness/reliability/async-safety audit, TypeScript quality + React/Next.js conventions audit. Findings curated; część claims agentów odrzucona po fact-check.

---

## Executive summary

| Aspekt | Ocena | Komentarz |
|---|---|---|
| **Architektura** | 9 / 10 | Subpath exports (`.`/`/client`/`/server`/`/react`), tree-shake-friendly, federacja typed events, jose-based JWT verification. |
| **Correctness** | 6 / 10 | Provider memoization bug (C1) realnie szkodliwy. Reszta to edge cases (multi Set-Cookie, race między decodeJwt a jwtVerify). |
| **Security** | 7 / 10 | Brak hardych vuln-ów. Główne braki: algorithm allowlist w jose, brak walidacji niektórych zewnętrznych wartości (cookies, refresh tokens) przed użyciem w HTTP headerach. |
| **Code quality** | 8 / 10 | Strict TS wszędzie, jose properly used, dobra struktura. Kilka unsafe `as unknown as` casts do uprzątnięcia. |
| **Test coverage** | 7 / 10 | 80 tests (unit + contract + server + react/jsdom). Brak testów dla websocket.ts (createEcho), refreshTokenIfExpired multi-cookie cases, AbeonProvider memoization stability. |
| **Documentation** | 9 / 10 | 3 docs files (nextjs-integration, inertia-integration, synchronization), pełne JSDoc na publicznym API. |

**Verdict:** **Production-ready dla pierwszego Next.js boilerplate-u** po naprawie C1 + H1-H5. Reszta (H6-H8, M, L) to inkrementalne ulepszenia, które można aplikować podczas pierwszych dwóch tygodni użycia z realnymi serwisami (zgodnie z "tight loop" filozofią).

---

## Top 5 action items (priorytet)

1. **C1 — AbeonProvider memoization fix.** Stabilize `apiClient` reference: utworzyć przez `useState(() => createApiClient())` lub `useRef` zamiast `useMemo([user, apiClient])`. **Realny bug** powodujący niepotrzebne refetche w każdym child component.
2. **H1 — `algorithms: ['RS256']` w jwtVerify.** Defense-in-depth przeciw algorithm confusion. 1-line change.
3. **H3 — `window.Pusher` overwrite guard.** Sprawdzić `if (window.Pusher && window.Pusher !== Pusher)` przed assignment, ostrzec lub fail. Inaczej cichy hijack innych usage-ów Pusher w app.
4. **H4 — Authorization header override semantics.** `createServerApiClient` nie powinien overwrite-ować explicit `options.headers.Authorization`. Cookie wins tylko gdy brak explicit.
5. **H5 — `wsPort` vs `wssPort` — różne porty.** Typowy Reverb używa 8080/8443 (różne). Aktualnie obie zmienne dostają ten sam parsed port → connection failure dla apek za proxy.

---

## Critical findings (1)

### C1 — AbeonProvider memoization causes apiClient instability

**Location:** `src/react/provider.tsx:54-62`

**Issue:**
```tsx
const [user, setUser] = useState<User | null>(initialAuth?.user ?? null);
const value = useMemo<AbeonContextValue>(() => {
    return {
        user,
        setUser,
        apiClient: apiClient ?? createApiClient(),
    };
}, [user, apiClient]);
```

`apiClient ?? createApiClient()` jest wewnątrz `useMemo`. Gdy caller NIE przekazuje `apiClient` prop (typowy case), `createApiClient()` jest wywoływany za każdym razem gdy `user` się zmienia → nowa instancja → child `useApi()` zwraca nowy reference → wszystkie `useEffect`/`useCallback` z `api` w deps tracą stabilność.

**Scenario:** Parent `setUser(newUser)` (np. profile update) → provider re-memoize → `useApi()` zwraca nowy client → child component z `useEffect(() => fetchContacts(), [api])` re-fetchuje contacts mimo że "tylko" się zmienił avatar usera. W skrajnym przypadku: dwukierunkowa zależność user ↔ fetch może spowodować infinite loop.

**Impact:** Wzmożone tła network calls, dziwne re-render storms, race conditions w child components. Występuje w każdej app która używa `<AbeonProvider>` bez explicit `apiClient` prop — domyślny use case.

**Suggested fix:**
```tsx
const [user, setUser] = useState<User | null>(initialAuth?.user ?? null);
const [stableClient] = useState(() => apiClient ?? createApiClient());

const value = useMemo<AbeonContextValue>(() => {
    return { user, setUser, apiClient: stableClient };
}, [user, stableClient]);
```

`useState` z lazy initializer wywołuje factory tylko raz na lifecycle component-u. `stableClient` jest stabilny przez cały lifetime.

**Test:** `it('apiClient reference is stable across user updates', ...)` z `result.current.apiClient` snapshot przed i po `setUser()`.

---

## High severity findings (8)

### H1 — `jwtVerify()` lacks explicit `algorithms: ['RS256']`

**Location:** `src/server/auth.ts:60-63`

**Issue:**
```ts
const { payload } = await jwtVerify(token, jwks, {
    issuer: options.issuer ?? DEFAULTS.AUTH_ISSUER,
    audience: options.audience ?? DEFAULTS.AUTH_AUDIENCE,
});
```

`jose` jako default accept-uje wszystkie algorithms obecne w JWK header. Algorithm confusion attack: jeśli ktoś kiedyś doda HS256 key do JWKS (np. by błąd po stronie Auth, albo by intencjonalny atak na konfigurację), atakujący może podpisać własny JWT używając public key jako shared secret HS256.

**Severity rationale:** Defense-in-depth, nie immediate vuln (JWKS jest HTTPS z trusted Auth source). Ale RFC 8725 §3.1 explicitly recommends algorithm allowlist.

**Fix:**
```ts
const { payload } = await jwtVerify(token, jwks, {
    issuer: options.issuer ?? DEFAULTS.AUTH_ISSUER,
    audience: options.audience ?? DEFAULTS.AUTH_AUDIENCE,
    algorithms: ['RS256'],
});
```

### H2 — getServerAuthContext silent catch hides JWKS failures

**Location:** `src/server/auth.ts:79-81`

**Issue:**
```ts
try {
    const { payload } = await jwtVerify(token, jwks, {...});
    // ...
} catch {
    return { user: null, payload: null };
}
```

Wszystkie błędy (expired token, malformed, network timeout do JWKS, JWKS HTTP 5xx, key rotation race) zwracają identyczny rezultat = `{ user: null, payload: null }`. Operator nie odróżni "user wylogowany" od "Auth service down" — middleware redirect do `/auth/login` w obu przypadkach.

**Impact:** Trudność debugowania ("dlaczego użytkownicy są nagle wylogowani?"). Brak signal-u do alarmowania monitoring system o problemach z Auth.

**Fix:** Optional logger callback w options:
```ts
export interface GetServerAuthContextOptions {
    // ...
    onError?: (error: Error, kind: 'expired' | 'invalid' | 'jwks' | 'unknown') => void;
}

} catch (err) {
    options.onError?.(err as Error, classifyError(err));
    return { user: null, payload: null };
}
```

Caller (middleware) może zalogować do PSR/console/Sentry.

### H3 — `window.Pusher` global mutation silently overwrites

**Location:** `src/client/websocket.ts:75-78`

**Issue:**
```ts
if (typeof window !== 'undefined') {
    (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;
}
```

Jeśli aplikacja konsumująca już ma `window.Pusher` (np. załadowany z CDN, inna biblioteka), zostaje cicho nadpisany. Wersja może być inna → runtime errors w aplikacji z istniejącymi subskrypcjami.

**Fix:**
```ts
if (typeof window !== 'undefined') {
    const w = window as unknown as { Pusher?: typeof Pusher };
    if (w.Pusher && w.Pusher !== Pusher) {
        console.warn(
            '[@abeon/shared] window.Pusher already defined with different reference. ' +
            'Echo will use the existing instance. ' +
            'Pass options.pusherClass to createEcho() to disable this assignment.',
        );
    } else {
        w.Pusher = Pusher;
    }
}
```

Lepsze: zmienić `createEcho()` żeby przyjmował opcjonalny `pusherClass` — wtedy consumer może kontrolować.

### H4 — Authorization header silently overwritten by JWT cookie

**Location:** `src/server/api-client.ts:60-65`

**Issue:**
```ts
const defaultHeaders: Record<string, string> = { ...(options.headers ?? {}) };

// V1: cookie JWT → Authorization Bearer
const jwt = cookies.get(jwtCookieName)?.value;
if (jwt) {
    defaultHeaders[HEADERS.AUTHORIZATION] = `Bearer ${jwt}`;
}
```

Order: najpierw `...options.headers`, potem JWT cookie. Jeśli caller przekaże `options.headers: { Authorization: 'Bearer service-token' }` (np. dla service-to-service call używającego inny token), cookie wins silently. Caller dostaje request z wrong token bez ostrzeżenia.

**Impact:** W multi-tenant / service-calling-service patterns gdzie consumer może mieć własną logikę uwierzytelniania, cichy override → wrong-token calls → 401 → debugowanie trudne.

**Fix:**
```ts
const jwt = cookies.get(jwtCookieName)?.value;
if (jwt && !defaultHeaders[HEADERS.AUTHORIZATION]) {
    defaultHeaders[HEADERS.AUTHORIZATION] = `Bearer ${jwt}`;
}
```

Explicit caller header wins. Cookie jest fallback. Document w JSDoc.

### H5 — `wsPort` i `wssPort` ustawiane na ten sam parsed port

**Location:** `src/client/websocket.ts:64-90`

**Issue:**
```ts
const wsPort = parsed.port ? Number(parsed.port) : parsed.protocol === 'wss:' ? 443 : 80;
// ...
return new Echo({
    // ...
    wsPort,
    wssPort: wsPort,  // ← same value!
    // ...
});
```

URL `wss://app.abeon.pl:8443/ws` → wsPort=8443, wssPort=8443. Ale typowy Laravel Reverb setup: `ws:8080, wss:8443` (różne porty). Echo internally probuje ws najpierw → trafia na port 8443 traktowany jako ws → fail → fallback retry → opóźnienia.

**Fix:** Parse URL z założeniem że dany port to TYLKO ws lub TYLKO wss zależnie od scheme. Allow override via options dla typowych konfiguracji:
```ts
export interface EchoOptions {
    // ...
    wsPort?: number;
    wssPort?: number;
}

const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'wss:' ? 443 : 80);
const wsPort = options.wsPort ?? (parsed.protocol === 'ws:' ? port : 80);
const wssPort = options.wssPort ?? (parsed.protocol === 'wss:' ? port : 443);
```

### H6 — Set-Cookie response propagated without validation

**Location:** `src/server/auth.ts:196-203`

**Issue:**
```ts
function extractSetCookies(headers: Headers): string[] {
    const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
    if (typeof withGetSetCookie.getSetCookie === 'function') {
        return withGetSetCookie.getSetCookie();
    }
    const single = headers.get('set-cookie');
    return single ? [single] : [];
}
```

Wartości są zwracane do callera bez sanityzacji. Caller (middleware.ts) bezpośrednio appenduje na `NextResponse.headers.append('Set-Cookie', ...)`. Jeśli upstream Auth jest skompromitowany (lub bug po jego stronie wstrzykuje CRLF), Set-Cookie z `\r\nX-Injected: header` może być propagowany.

**Severity:** Trust upstream Auth as same-platform — ale defense-in-depth.

**Fix:** Reject Set-Cookie zawierające `\r` lub `\n`:
```ts
return raw.filter((cookie) => !cookie.includes('\r') && !cookie.includes('\n'));
```

### H7 — notificationsRef written in render phase (not useEffect)

**Location:** `src/react/use-notifications.ts:90-92`

**Issue:**
```ts
const notificationsRef = useRef<NotificationDto[]>([]);
notificationsRef.current = notifications;
```

Drugie wyrażenie wykonuje się **w render phase** (poza useEffect). Pattern jest niekonwencjonalny — w React 18+ z Suspense/Transitions, render może być przerwany i wznowiony. Ref dostaje zapisaną wartość a state może być rolled back przez Suspense → ref out of sync z state.

**Impact:** Edge case, ale realny w Next.js 15 z heavy Suspense usage. Symptom: rare race między WS push handler (czytający ref) a Suspense-interrupted render → handler widzi stary state.

**Fix:**
```ts
const notificationsRef = useRef<NotificationDto[]>([]);
useEffect(() => {
    notificationsRef.current = notifications;
}, [notifications]);
```

Wykonuje się po commit phase, gdy state jest finalized.

### H8 — `getSetCookie()` fallback drops multi-Set-Cookie (and engines.node ≥ 20 makes fallback dead code)

**Location:** `src/server/auth.ts:196-203`

**Issue:** Fallback `headers.get('set-cookie')` zwraca single string nawet gdy serwer wysłał wiele Set-Cookie (RFC dopuszcza). Token refresh response z `Set-Cookie: abeon_token=...` + `Set-Cookie: abeon_refresh=...` traci jedno cookie. User dostaje rotated access token ale STARY refresh token → następna rotacja będzie używać stale refresh → 401.

`package.json` deklaruje `engines.node >= 20` → wszystkie target runtime mają `Headers.getSetCookie()`. Fallback to dead code introducing fragility.

**Fix:** Wymagać Node 20+ i usunąć fallback:
```ts
function extractSetCookies(headers: Headers): string[] {
    return headers.getSetCookie();
}
```

Jeśli engines.node bumping nie planowane, dodać proper multi-cookie parser zamiast fallback do single get.

---

## Medium findings (12)

### M1 — Browser correlationId frozen for client lifetime

**Location:** `src/client/api-client.ts:42-43`

`createApiClient()` generuje UUID raz w konstruktorze. Wszystkie wywołania z tego samego klienta dzielą jedno correlation ID — nawet 10 minut później. Distributed tracing nie odróżnia request-ów.

**Fix opcje:** (1) Rename na `contextId` (clarifies semantics — per-component-tree), (2) Generate per-request inside `request()`, (3) Accept per-call override w `RequestOptions.headers`.

### M2 — `readCookie` regex edge cases

**Location:** `src/client/api-client.ts:64-68`

- Cookie z `=` w value (`foo=bar=baz`) — regex captures `bar=baz` ✓ (greedy `[^;]*`).
- Empty value (`foo=`) — zwraca empty string, nieodróżnialne od missing.
- `decodeURIComponent` może rzucić na malformed `%ZZ` — uncaught throws break request.

**Fix:** Try/catch wokół decode + early return null gdy match[1] === '':
```ts
try {
    return match && match[1] !== '' ? decodeURIComponent(match[1]) : null;
} catch {
    return null;
}
```

### M3 — Refresh cookie value bez CRLF validation w HTTP header

**Location:** `src/server/auth.ts:166`

```ts
headers: { Cookie: `${refreshName}=${refresh}` },
```

`$refresh` to wartość z user's request cookies — gdyby zawierała `\r\n`, mogłaby zostać przemycona jako kolejny header. W praktyce browser-side nie generuje takich cookies, ale defense-in-depth.

**Fix:** Walidacja przed użyciem:
```ts
if (refresh.includes('\r') || refresh.includes('\n')) {
    return { refreshed: false, setCookieHeaders: [] };
}
```

### M4 — Brak HTTPS enforcement na JWKS_URL

**Location:** `src/server/jwks.ts:18-25`

```ts
fn = createRemoteJWKSet(new URL(jwksUrl), {...});
```

URL akceptowany jak jest. Konfiguracja `ABEON_JWKS_URL=http://...` (HTTP, nie HTTPS) przepuści MITM atak — atakujący może serwować zfałszowany JWKS. W K8s cluster-internal traffic to często HTTP — ale jeśli Auth jest exposed publicznie, MUSI być HTTPS.

**Fix:** Optional enforce z env flag `ABEON_ALLOW_INSECURE_JWKS=1` dla dev:
```ts
if (parsed.protocol !== 'https:' && !process.env.ABEON_ALLOW_INSECURE_JWKS) {
    throw new Error(`JWKS URL must be HTTPS (or set ABEON_ALLOW_INSECURE_JWKS=1 for dev): ${jwksUrl}`);
}
```

### M5 — WebSocket payload bez schema validation przed render

**Location:** `src/react/use-notifications.ts:163-176`

```ts
channel.listen(eventName, (payload) => {
    const notification = (payload as { notification?: NotificationDto } | NotificationDto)
        ?.constructor === Object
        ? ((payload as { notification?: NotificationDto }).notification ??
          (payload as NotificationDto))
        : (payload as NotificationDto);

    if (notification && typeof notification === 'object' && 'id' in notification) {
        setNotifications((prev) => [notification as NotificationDto, ...prev]);
```

Heurystyczny cast bez walidacji typów pól. Malformed payload (np. `read_at: 123` zamiast `string|null`) przemyca się do state. Subsequent `notification.read_at === null` → false → unread inflation; subsequent `.read_at.substring()` w UI → throw.

**Fix:** Lightweight validator (bez dep na Zod):
```ts
function isNotificationDto(v: unknown): v is NotificationDto {
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    return typeof o.id === 'string'
        && typeof o.type === 'string'
        && typeof o.title === 'string'
        && (o.read_at === null || typeof o.read_at === 'string');
}
```

Skip silently (z log) jeśli false. Optional dep na Zod w Sprint E.

### M6 — `initialAuth` shape nie walidowane w AbeonProvider

**Location:** `src/react/provider.tsx:54`

```ts
const [user, setUser] = useState<User | null>(initialAuth?.user ?? null);
```

Bezpośredni passthrough. Jeśli SSR omyłkowo przekaże `initialAuth: { user: 'STRING' }` (nieprawidłowy shape), state ma niewłaściwą wartość → consumer code crashes na `user.email`. Brak walidacji shape, defense-in-depth.

**Fix:** Light validator:
```ts
function validateUserShape(u: unknown): User | null {
    if (u === null) return null;
    if (!u || typeof u !== 'object') return null;
    const o = u as Record<string, unknown>;
    return typeof o.id === 'string' && typeof o.email === 'string' ? o as User : null;
}
```

### M7 — `void refresh()` hides promise rejections

**Location:** `src/react/use-apps.ts:71`, `src/react/use-notifications.ts:121`

```ts
useEffect(() => {
    if (autoLoad) {
        void refresh();
    }
}, [autoLoad, refresh]);
```

`void` tłumi unhandled rejection warning. Jeśli `refresh()` rzuca (rzadkie — błąd już zapamiętany w state), promise rejection jest mute. W React 19 Suspense-error-boundary mechanics, błędy mogłyby się przerwać UI.

**Fix:** Explicit catch:
```ts
useEffect(() => {
    if (!autoLoad) return;
    refresh().catch((err) => {
        // refresh() already stores error in state — this catch just prevents
        // unhandled rejection warnings in dev tools.
        if (process.env.NODE_ENV === 'development') console.error(err);
    });
}, [autoLoad, refresh]);
```

### M8 — 204 No Content typed as `T` (runtime mismatch)

**Location:** `src/_internal/api-client-base.ts:107`

```ts
if (response.status === 204) {
    return undefined as T;
}
```

Caller declares `await api.delete<User>('/x')` → expects User → gets undefined at runtime. TS compiles bez ostrzeżenia.

**Fix:** Either:
1. Document w JSDoc że 204 zwraca undefined niezależnie od T — caller odpowiada za poprawne typowanie (`<User | undefined>` lub `<void>`).
2. Specialized method: `apiClient.delete(path): Promise<void>` (no body).
3. Throw na 204 gdy `T !== void` — wymaga reflection nieobsługiwana w TS.

Najprostsze: dodać `@returns Promise<T | undefined>` w JSDoc + przykład.

### M9 — AJV w sync-schemas używa `strict: false`

**Location:** `scripts/sync-schemas.ts:88-89`

```ts
const instance = new Ajv2020({ strict: false, allErrors: true });
```

Schemas bez explicit `additionalProperties: false` akceptują extra fields → drift między PHP i TS schemas nie łapany przez contract tests.

**Fix:** `strict: true`. Verify że wszystkie schemas mają explicit `additionalProperties` declared.

### M10 — Cleanup order w useNotifications: brak try/finally

**Location:** `src/react/use-notifications.ts:182-186`

```ts
return () => {
    channel.stopListening(eventName);
    echo.leave(channelName);
    setConnected(false);
};
```

Jeśli `stopListening` rzuca (np. channel już rozłączony), `echo.leave` się nie wykona → channel subscription pozostaje → memory leak.

**Fix:**
```ts
return () => {
    try { channel.stopListening(eventName); }
    finally {
        try { echo.leave(channelName); } finally { setConnected(false); }
    }
};
```

### M11 — Unsafe `as unknown as UserJwtPayload` cast po jose

**Location:** `src/server/auth.ts:64`

```ts
const userPayload = payload as unknown as UserJwtPayload;
```

`jose.jwtVerify<T>` jest generic — może zwrócić typed payload bezpośrednio bez double-cast:
```ts
const { payload } = await jwtVerify<UserJwtPayload>(token, jwks, {...});
```

Cleaner, plus runtime check via jose's claim verification still applies.

### M12 — Empty body 5xx response loses status context

**Location:** `src/_internal/api-client-base.ts:87-103`

Generic `AbeonError` z `type: 'about:blank', title: 'HTTP 500'` dla wszystkich empty-body errors. Consumer code nie odróżni transient (5xx, retry-friendly) od permanent (4xx).

**Fix:** Lifesplit `type` based on status range:
```ts
type: status >= 500
    ? 'https://api.abeon.pl/errors/server-error'
    : 'https://api.abeon.pl/errors/client-error',
```

Plus helper `isTransient(err)`:
```ts
export function isTransientAbeonError(err: AbeonError): boolean {
    return err.problem.status >= 500 && err.problem.status < 600;
}
```

---

## Low / Nit findings (7)

### L1 — Brak `readonly` na DTO arrays

`User.roles: string[]`, `User.permissions: string[]`, `AppDescriptor.permissions: string[]`, `EventEnvelope.actor: Actor` etc. Pozwala na mutację. **Fix:** `readonly string[]` w DTO interfaces (style + safety).

### L2 — Cookie name z env nie walidowany

`ABEON_JWT_COOKIE_NAME` user-controllable env. CRLF / spaces / equals signs powinny być odrzucone przy boot. **Fix:** Regex check w `createServerApiClient` przy konstrukcji.

### L3 — `process.env` reads w hot path

`readEnv()` wywoływany per-request w `getServerAuthContext`, `createServerApiClient`. Można cachować at module load. **Performance, nie correctness.**

### L4 — Brak JSDoc examples na `ROUTING_KEY_REGEX`, `PERMISSION_NAME_REGEX`

Exports mają regex bez przykładu pattern-u. Dodać `@example`:
```ts
/**
 * AMQP topic routing key — `{service}.{entity}.{action}`.
 * @example 'crm.contact.created', 'finance.invoice.paid'
 */
export const ROUTING_KEY_REGEX = /.../;
```

### L5 — Brak type guards `isAuthError`, `isContractViolationError`

Consumer musi `err instanceof AuthError`. Dla TS narrowing wygodniejsze byłyby type guard functions. **Fix:** Export helper functions.

### L6 — ENV var sync z PHP tylko w docs

`ABEON_JWT_COOKIE_NAME` musi match PHP `auth.cookies.access`. Tylko docs note — brak runtime validation. **Optional:** `validateEnv()` helper porównujący znane wartości.

### L7 — AbeonError detail "Non-RFC-7807 error from ${url}" może leakować URL

Pełna URL w error message → jeśli baseUrl wygenerowany dynamicznie z secrets, leak w logach. **Fix:** Truncate do pathname:
```ts
detail: `Non-RFC-7807 error from ${new URL(url).pathname}`,
```

---

## Odrzucone findings (overstated lub false-positive)

### Rejected #1 — "Unsigned JWT decode w refreshTokenIfExpired = Critical"

**Claim:** `decodeJwt(access)` (bez signature verify) jest unsafe pattern.

**Reality:** Code czyta TYLKO `exp` claim do decyzji czy refresh wykonać. Nawet jeśli atakujący sfałszuje `exp`, worst case: caller wykonuje spurious refresh call do Auth — który odrzuci jeśli refresh cookie nie jest valid. Brak attack vector. Pattern jest standard (jose docs same to robią).

**Verdict:** Reject.

### Rejected #2 — "TOCTOU race w refresh = Critical"

**Claim:** Race między `decodeJwt(exp)` a późniejszym `jwtVerify` w innym call site.

**Reality:** Next.js middleware uruchamia się per-request, nie concurrent dla tego samego usera w typowej deployment. Race window to sub-millisecond (zwykłe wywołanie funkcji w tym samym Node.js process). Concurrent middleware dla tego samego usera w high-concurrency setup ma race window ~1µs vs ~15min token TTL. Nieaktionable bez realnego scenariusza.

**Verdict:** Reject.

### Rejected #3 — "Cookie name attacker-controlled via env"

**Claim:** Atakujący z K8s env access może ustawić `ABEON_JWT_COOKIE_NAME` na malformed value.

**Reality:** Env vars to trusted platform boundary. Jeśli atakujący ma write access do K8s envs, już ma platform compromise — cookie name jest najmniejszym z problemów.

**Verdict:** Reject jako security finding. Accept jako L2 — input validation hygiene przy boot.

### Rejected #4 — "Open redirect via baseUrl = Medium"

Same reasoning jako Rejected #3. baseUrl z env = trusted.

### Rejected #5 — "No rate-limit na refresh calls"

**Claim:** Brak per-user throttling w refreshTokenIfExpired umożliwia DoS Auth.

**Reality:** Rate-limit to architectural/operations concern (Traefik middleware, Auth-side rate limiter, K8s NetworkPolicy). Nie odpowiedzialność `@abeon/shared`. Adding per-process token cache (in-memory) komplikuje SSR (one process per request w niektórych deployment-ach).

**Verdict:** Reject — out of scope.

### Rejected #6 — "ReDoS w cookie regex"

**Claim:** Long cookie name z metacharacters może spowodować regex backtracking.

**Reality:** Cookie names w browser context ograniczone do typowo <100 chars. Pathological scenarios `(((((...)))))` × 10k chars unrealistic — browser wcześniej odrzuci.

**Verdict:** Reject.

### Rejected #7 — "Correlation ID Math.random fallback weak"

**Claim:** UUID fallback do Math.random w `_internal/uuid.ts` to security risk.

**Reality:** Fallback ścieżka tylko dla legacy IE (no crypto.getRandomValues). Modern Node 20+ i wszystkie nowoczesne browsery używają `crypto.randomUUID()` direct branch. Correlation IDs **nie są secrets** — visible w logach, headerach, intentionalnie shareable.

**Verdict:** Reject.

---

## Strengths (co działa dobrze)

| Aspekt | Notatka |
|---|---|
| **Subpath exports** | `.`/`/client`/`/server`/`/react` z `sideEffects: false` — tree-shake-friendly, bundle splits czyste. |
| **Strict TypeScript** | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` — wszystkie on. |
| **jose dla JWT** | Modern, well-maintained library. `createRemoteJWKSet` z cooldownDuration handluje key caching. |
| **as const + literal types** | `HEADERS`, `ENV`, `DEFAULTS` jako `as const` — literal type preservation. |
| **Hook patterns** | `useMemo` na context value (mimo C1 bugu w impl), `useCallback` na refresh, proper cleanup w useEffect returns. |
| **Test setup** | jose generuje real RSA keys w server/auth tests — replicable w CI. Per-file `// @vitest-environment jsdom` directive dla React. |
| **File naming** | kebab-case consistent (`use-auth.ts`, `use-notifications.ts`). |
| **Documentation** | 3 docs files (`nextjs-integration`, `inertia-integration`, `synchronization`), README aligned. |
| **package.json hygiene** | exports field z `types` przed `import`, peer deps optional, engines.node pinned, publishConfig restricted. |
| **Build (tsup)** | ESM-only (zgodne z Next.js 15), sourcemaps, `.d.ts` per entry. |

---

## Test coverage gap

**80/80 tests green, ale gaps w pokryciu:**

- **`src/client/websocket.ts` — createEcho NIE testowane.** Mocking laravel-echo + pusher-js w jsdom skomplikowane, ale przynajmniej testy walidacji wsUrl i window.Pusher behavior.
- **AbeonProvider memoization stability — brak testu** (C1 by się złapał przez `it('apiClient stable across user updates')`).
- **`refreshTokenIfExpired` multi-cookie response** — fixture z 2 Set-Cookie headers + assert że oba propagated.
- **204 No Content handling** — test że `await api.delete()` zwraca undefined.
- **Cookie regex edge cases** — `foo=bar=baz`, `foo=`, malformed `%ZZ`.
- **WebSocket payload validation negative cases** — malformed notification w `notification.read_at`.

**Action:** Sprint E powinien dodać przynajmniej 10 nowych testów na ww. obszary.

---

## Action plan

### Sprint E — Critical + High fixes + selektywne Medium (~3-5 dni)

| Task | Priority | Effort |
|---|---|---|
| C1 AbeonProvider apiClient stability | Critical | 0.5d |
| H1 jwtVerify algorithms allowlist | High | 0.25d |
| H2 getServerAuthContext error classification | High | 0.5d |
| H3 window.Pusher overwrite guard | High | 0.5d |
| H4 Authorization header override semantics | High | 0.25d |
| H5 wsPort vs wssPort separate | High | 0.5d |
| H6 Set-Cookie sanitization | High | 0.25d |
| H7 notificationsRef → useEffect | High | 0.25d |
| H8 remove getSetCookie fallback (Node 20+) | High | 0.25d |
| M5 + M6 lightweight validators (WS payload, initialAuth) | Medium | 0.5d |
| M10 cleanup order try/finally | Medium | 0.25d |
| M11 jose generic instead of cast | Medium | 0.25d |
| Tests — coverage gaps (≥10 nowych) | Critical | 1.5d |

**Total Sprint E:** ~5.25d.

### Sprint F — Reszta Medium (~2-3 dni rozłożone)

M1 correlationId rename/per-request, M2 cookie regex edge cases, M3 refresh CRLF guard, M4 HTTPS JWKS enforcement, M7 explicit catch dla refresh, M8 204 docs, M9 AJV strict:true, M12 transient vs permanent helper.

### Sprint G — Low + nice-to-haves

L1-L7 + opcjonalne: ESLint `no-explicit-any` rule, JSDoc examples na regex, type guards, ENV sync validator.

---

## Conclusion

`@abeon/shared` jest **architectonicznie solid** i **dobrze otestowany** (80 tests). C1 to realny bug (provider memoization) który musi być naprawiony przed pierwszym Next.js boilerplate-em. H1-H5 to defense-in-depth + correctness wins, prosty do aplikowania. M i L to inkrementalne polish.

**Production-readiness:** **Po fixie C1 + H1-H5 (~2.5 dnia w Sprint E) — gotowe do produkcji** dla pierwszego konsumenta (CMS / AI Assistant Next.js). Pozostałe findings można aplikować inkrementalnie podczas tight-loop hardening z pierwszymi 2 boilerplate-ami (zgodnie z S.5 filozofią z code review SDK PHP).

**Recommendation:** Sprint E (C1 + H1-H8 + selected Medium) jako warunek SDK 1.0 stable (zgodnie z "tight loop" model). Sprint F + G jako parallel work podczas Fazy 1 boilerplate-u.

---

## Załączniki

- Pełne raw outputy 3 review-ów zapisane w `/home/mmucha/.claude/projects/-home-mmucha-projects-abeon-suit/ff2e62d7-5df7-4470-bc56-785595d3e569/tool-results/`.
- Cross-references do `file:line` w `abeon-shared/src/`.
- Wcześniejsze docs: `../abeon-shared-phase0-plan.md` (v1.1 z V1-V5), `../abeon-sdk-php/CODE_REVIEW.md` (companion PHP-side review).
