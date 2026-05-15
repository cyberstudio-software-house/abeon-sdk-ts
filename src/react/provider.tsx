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
    const [user, setUser] = useState<User | null>(initialAuth?.user ?? null);

    const value = useMemo<AbeonContextValue>(() => {
        return {
            user,
            setUser,
            apiClient: apiClient ?? createApiClient(),
        };
    }, [user, apiClient]);

    return <AbeonContext.Provider value={value}>{children}</AbeonContext.Provider>;
}
