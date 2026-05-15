import { useContext } from 'react';
import type { User } from '../types/user.js';
import { AbeonContext } from './context.js';

export interface UseAuthReturn {
    /** Currently authenticated user, or null. */
    user: User | null;
    /** Sugar for `user !== null`. */
    isAuthenticated: boolean;
    /**
     * Check whether the current user has a specific permission claim.
     * Returns `false` when no user.
     *
     * Permission names follow `{app}.{resource}.{action}`
     * (e.g. `'crm.contacts.read'`). See `PERMISSION_NAME_REGEX`.
     */
    hasPermission: (permission: string) => boolean;
    /** Check whether the current user holds a specific role name. */
    hasRole: (role: string) => boolean;
    /**
     * Update the auth state — typically called after login or logout.
     * Pass `null` to clear.
     */
    setUser: (user: User | null) => void;
}

/**
 * Access the current Abeon auth state from any component inside
 * `<AbeonProvider>`. Throws when used outside the provider — provider
 * must be mounted high in the tree (typically root layout).
 */
export function useAuth(): UseAuthReturn {
    const ctx = useContext(AbeonContext);
    if (!ctx) {
        throw new Error(
            '@abeon/shared/react: useAuth() must be used inside <AbeonProvider>',
        );
    }
    return {
        user: ctx.user,
        isAuthenticated: ctx.user !== null,
        hasPermission: (permission) =>
            ctx.user?.permissions.includes(permission) ?? false,
        hasRole: (role) => ctx.user?.roles.includes(role) ?? false,
        setUser: ctx.setUser,
    };
}
