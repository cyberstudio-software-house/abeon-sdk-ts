import { createContext } from 'react';
import type { ApiClient } from '../_internal/api-client-base.js';
import type { User } from '../types/user.js';

export interface AbeonContextValue {
    user: User | null;
    setUser: (user: User | null) => void;
    apiClient: ApiClient;
}

/**
 * Internal context. Use `useAuth()`, `useApi()`, etc. from this module
 * instead of consuming the context directly.
 */
export const AbeonContext = createContext<AbeonContextValue | null>(null);
AbeonContext.displayName = 'AbeonContext';
