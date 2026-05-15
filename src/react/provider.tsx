import { useMemo, useState, type ReactNode } from 'react';
import type { ApiClient } from '../_internal/api-client-base.js';
import { createApiClient } from '../client/api-client.js';
import type { User } from '../types/user.js';
import { AbeonContext, type AbeonContextValue } from './context.js';

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
 * Root context provider for `@abeon/shared/react` hooks (`useAuth`, `useApi`,
 * `useApps`, `useNotifications` in Sprint D).
 *
 * Place high in the tree — Next.js root layout or Inertia App component:
 *
 *     // app/layout.tsx (Next.js App Router)
 *     import { cookies } from 'next/headers';
 *     import { getServerAuthContext } from '@abeon/shared/server';
 *     import { AbeonProvider } from '@abeon/shared/react';
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

    const value = useMemo<AbeonContextValue>(
        () => ({ user, setUser, apiClient: stableApiClient }),
        [user, stableApiClient],
    );

    return <AbeonContext.Provider value={value}>{children}</AbeonContext.Provider>;
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
