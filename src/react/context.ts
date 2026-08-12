import { createContext } from 'react';
import type { ApiClient } from '../_internal/api-client-base.js';
import type { User } from '../types/user.js';

export interface AbeonContextValue {
    user: User | null;
    setUser: (user: User | null) => void;
    apiClient: ApiClient;
    /**
     * Bumped whenever the active organisation changes (ADR-0017).
     *
     * Everything tenant-scoped — the app list, preferences — includes this in its
     * refresh dependencies, so a switch re-derives them without a page reload and
     * without the hooks having to know about each other. Switching organisation
     * changes not just a label but the app set and the user's permissions, so
     * stale tenant-scoped state is wrong state.
     */
    tenantEpoch: number;
    /** Signal that the active organisation changed. Called by `useTenant()`. */
    onTenantSwitched: () => void;
}

/**
 * Internal context. Use `useAuth()`, `useApi()`, etc. from this module
 * instead of consuming the context directly.
 */
export const AbeonContext = createContext<AbeonContextValue | null>(null);
AbeonContext.displayName = 'AbeonContext';
