import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ApiClient } from '../_internal/api-client-base.js';
import { createApiClient } from '../client/api-client.js';
import type { User } from '../types/user.js';
import { AbeonContext, type AbeonContextValue } from './context.js';
import { PreferencesProvider } from './use-preferences.js';

export interface AbeonProviderProps {
    children: ReactNode;
    /**
     * Initial auth state from SSR. Pass `{ user }` resolved via
     * `getServerAuthContext()` so the first client render matches what
     * the server rendered — no hydration mismatch, no flash.
     */
    initialAuth?: { user: User | null };
    /**
     * Pre-built API client. If omitted, the provider constructs one via
     * `createApiClient()` with default env-driven configuration.
     * Provide explicitly in tests to inject a mocked fetch.
     */
    apiClient?: ApiClient;
}

/**
 * Root context provider for `@abeon/sdk-ts/react` hooks (`useAuth`, `useApi`,
 * `useApps`, `useNotifications` in Sprint D).
 *
 * Place high in the tree — Next.js root layout or Inertia App component:
 *
 *     // app/layout.tsx (Next.js App Router)
 *     import { cookies } from 'next/headers';
 *     import { getServerAuthContext } from '@abeon/sdk-ts/server';
 *     import { AbeonProvider } from '@abeon/sdk-ts/react';
 *
 *     export default async function RootLayout({ children }) {
 *         const { user } = await getServerAuthContext(cookies());
 *         return (
 *             <html>
 *                 <body>
 *                     <AbeonProvider initialAuth={{ user }}>{children}</AbeonProvider>
 *                 </body>
 *             </html>
 *         );
 *     }
 */
export function AbeonProvider({
    children,
    initialAuth,
    apiClient,
}: AbeonProviderProps): ReactNode {
    // M6: validate initialAuth shape at the entry point. Most callers pass
    // the result of `getServerAuthContext()` directly — but a typo, an old
    // SSR helper, or hydration from a stale cache may yield something that
    // type-checks `User` only by structural coincidence. Bad shape → render
    // as anonymous rather than crash a deep child accessing `user.roles`.
    const validatedInitial = isValidUser(initialAuth?.user) ? initialAuth!.user! : null;
    const [user, setUser] = useState<User | null>(validatedInitial);

    // C1: stable apiClient reference — recreates only when caller swaps the
    // `apiClient` prop, not when `user` changes. Otherwise every `setUser`
    // would mint a fresh client, busting downstream `useEffect([api,...])`.
    const stableApiClient = useMemo<ApiClient>(
        () => apiClient ?? createApiClient(),
        [apiClient],
    );

    // Invalidation signal for tenant-scoped state (ADR-0017). A counter rather
    // than an event emitter: it composes with React's own dependency tracking, so
    // a hook opts in by listing it, and nothing needs to subscribe or unsubscribe.
    const [tenantEpoch, setTenantEpoch] = useState(0);
    const onTenantSwitched = useCallback(() => setTenantEpoch((n) => n + 1), []);

    const value = useMemo<AbeonContextValue>(
        () => ({ user, setUser, apiClient: stableApiClient, tenantEpoch, onTenantSwitched }),
        [user, stableApiClient, tenantEpoch, onTenantSwitched],
    );

    // Mount PreferencesProvider here so every `usePreferences()` (and
    // `useAppOrder()`) call inside the tree returns the SAME state instance.
    // A single PATCH then propagates instantly to every consumer (sidebar,
    // settings page, theme toggle, etc.) without anyone needing to re-fetch.
    return (
        <AbeonContext.Provider value={value}>
            <PreferencesProvider>{children}</PreferencesProvider>
        </AbeonContext.Provider>
    );
}

function isValidUser(u: unknown): u is User {
    if (u === null || u === undefined) return false;
    if (typeof u !== 'object') return false;
    const o = u as Record<string, unknown>;
    return (
        typeof o.id === 'string' &&
        typeof o.email === 'string' &&
        Array.isArray(o.roles) &&
        Array.isArray(o.permissions)
    );
}
