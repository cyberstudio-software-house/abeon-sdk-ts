import { useCallback, useEffect, useRef, useState } from 'react';
import { AbeonError } from '../errors.js';
import type { Preferences } from '../types/preferences.js';
import { PREFERENCES_DEFAULTS } from '../types/preferences.js';
import { useApi } from './use-api.js';
import { useAuth } from './use-auth.js';

export interface UsePreferencesOptions {
    /**
     * Endpoint path. Default `/api/v1/auth/me/preferences` (Auth service,
     * see ADR-0009).
     */
    path?: string;
    /** Auto-fetch on mount when the user is authenticated. Default `true`. */
    autoLoad?: boolean;
}

export interface UsePreferencesReturn {
    preferences: Preferences;
    loading: boolean;
    saving: boolean;
    error: AbeonError | null;
    /**
     * Deep-merge the given patch into the preferences blob and PATCH it
     * to the server. Optimistic — the in-memory state updates immediately;
     * on failure the previous state is restored.
     */
    update: (patch: Partial<Preferences>) => Promise<void>;
    /** Re-fetch from the server. */
    refresh: () => Promise<void>;
}

/**
 * Hook for the user's preferences blob (chrome layout, theme, pinned items,
 * cross-app settings). Wraps `GET / PATCH /api/v1/auth/me/preferences`.
 *
 * Behaviour:
 *   - When unauthenticated, returns defaults and no-ops on writes.
 *   - First mount fetches; subsequent mounts of the same hook DO refetch
 *     (no cross-component cache yet — that's a v0.2 enhancement; in
 *     practice the chrome mounts this once at the layout root).
 *   - `update()` is optimistic: state updates before the PATCH completes.
 *     A failed PATCH restores the previous state and surfaces the error.
 */
export function usePreferences(options: UsePreferencesOptions = {}): UsePreferencesReturn {
    const api = useApi();
    const { user } = useAuth();
    const path = options.path ?? '/api/v1/auth/me/preferences';
    const autoLoad = options.autoLoad ?? true;

    const [preferences, setPreferences] = useState<Preferences>(PREFERENCES_DEFAULTS);
    const [loading, setLoading] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [error, setError] = useState<AbeonError | null>(null);

    const lastFetched = useRef<Preferences | null>(null);

    const refresh = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const response = await api.get<{ data: Preferences }>(path);
            const fresh = isPreferences(response?.data) ? response.data : PREFERENCES_DEFAULTS;
            setPreferences(fresh);
            lastFetched.current = fresh;
        } catch (err) {
            setError(toAbeonError(err, 'Preferences fetch failed'));
        } finally {
            setLoading(false);
        }
    }, [api, path, user]);

    const update = useCallback(
        async (patch: Partial<Preferences>) => {
            if (!user) return;
            const before = preferences;
            const optimistic = mergeTopLevel(before, patch);
            setPreferences(optimistic);
            setSaving(true);
            setError(null);
            try {
                const response = await api.patch<{ data: Preferences }>(path, patch);
                const fresh = isPreferences(response?.data) ? response.data : optimistic;
                setPreferences(fresh);
                lastFetched.current = fresh;
            } catch (err) {
                setPreferences(before);
                setError(toAbeonError(err, 'Preferences update failed'));
            } finally {
                setSaving(false);
            }
        },
        [api, path, preferences, user],
    );

    useEffect(() => {
        if (autoLoad && user) {
            void refresh();
        }
    }, [autoLoad, refresh, user]);

    return { preferences, loading, saving, error, update, refresh };
}

function isPreferences(value: unknown): value is Preferences {
    return (
        value !== null &&
        typeof value === 'object' &&
        (value as { version?: unknown }).version === 1
    );
}

function mergeTopLevel(base: Preferences, patch: Partial<Preferences>): Preferences {
    const result: Preferences = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (key === 'version') continue;
        const existing = (base as Record<string, unknown>)[key];
        if (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            typeof existing === 'object' &&
            existing !== null &&
            !Array.isArray(existing)
        ) {
            (result as Record<string, unknown>)[key] = {
                ...(existing as Record<string, unknown>),
                ...(value as Record<string, unknown>),
            };
        } else {
            (result as Record<string, unknown>)[key] = value;
        }
    }
    result.version = 1;
    return result;
}

function toAbeonError(err: unknown, fallbackTitle: string): AbeonError {
    if (err instanceof AbeonError) return err;
    return new AbeonError({
        type: 'about:blank',
        title: fallbackTitle,
        status: 0,
        detail: err instanceof Error ? err.message : String(err),
    });
}
