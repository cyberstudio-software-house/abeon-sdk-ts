import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ApiClient } from '../_internal/api-client-base.js';
import { createApiClient } from '../client/api-client.js';
import type { Preferences } from '../types/preferences.js';
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
     * Preferences resolved on the server for the same request. Seeds the shared
     * preferences state so the saved theme and layout apply from the first render
     * instead of after a client fetch. Ignored unless it is a version 1 document.
     */
    initialPreferences?: Preferences | null;
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
    initialPreferences,
    apiClient,
}: AbeonProviderProps): ReactNode {
    // M6: validate initialAuth shape at the entry point; see docs/notes/react-provider.md.
    const validatedInitial = isValidUser(initialAuth?.user) ? initialAuth!.user! : null;
    const [user, setUser] = useState<User | null>(validatedInitial);

    // C1: stable apiClient reference; see docs/notes/react-provider.md.
    const stableApiClient = useMemo<ApiClient>(
        () => apiClient ?? createApiClient(),
        [apiClient],
    );

    // Invalidation signal for tenant-scoped state (ADR-0017); see docs/notes/react-provider.md.
    const [tenantEpoch, setTenantEpoch] = useState(0);
    const onTenantSwitched = useCallback(() => setTenantEpoch((n) => n + 1), []);

    const value = useMemo<AbeonContextValue>(
        () => ({ user, setUser, apiClient: stableApiClient, tenantEpoch, onTenantSwitched }),
        [user, stableApiClient, tenantEpoch, onTenantSwitched],
    );

    // Mounted here so the whole tree shares one preferences state;
    // see docs/notes/react-provider.md.
    return (
        <AbeonContext.Provider value={value}>
            <PreferencesProvider initialPreferences={initialPreferences}>{children}</PreferencesProvider>
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
