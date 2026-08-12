import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { AbeonError } from '../errors.js';
import type { Preferences } from '../types/preferences.js';
import { PREFERENCES_DEFAULTS } from '../types/preferences.js';
import { AbeonContext } from './context.js';
import { useApi } from './use-api.js';
import { useAuth } from './use-auth.js';

export interface UsePreferencesOptions {
    /** Endpoint path. Default `/api/v1/auth/me/preferences` (Auth service, ADR-0009). */
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

const PreferencesContext = createContext<UsePreferencesReturn | null>(null);

export interface PreferencesProviderProps {
    children: ReactNode;
    options?: UsePreferencesOptions;
}

/**
 * Optional provider that hosts one usePreferences() state instance for the
 * subtree, so every `usePreferences()` call inside it returns the same
 * state — one PATCH propagates instantly to every component.
 *
 * `<AbeonProvider>` mounts this automatically, so consumer apps don't have
 * to wire it themselves. Use it directly only in tests or when isolating
 * a subtree from the shared cache.
 */
export function PreferencesProvider({ children, options }: PreferencesProviderProps): ReactNode {
    const value = usePreferencesState(options ?? {}, true);

    return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

/**
 * Hook for the user's preferences blob (chrome layout, theme, pinned items,
 * cross-app settings). Wraps `GET / PATCH /api/v1/auth/me/preferences`.
 *
 * Behaviour:
 *   - Inside `<PreferencesProvider>` (auto-mounted by `<AbeonProvider>`),
 *     every call returns the SHARED state — one update propagates
 *     immediately to every consumer. This is the normal case.
 *   - Without a provider, falls back to per-instance local state (back-compat
 *     for tests / standalone usage). Each caller fetches independently.
 *   - When unauthenticated, returns defaults and no-ops on writes.
 *   - `update()` is optimistic: state updates before the PATCH completes;
 *     a failed PATCH restores the previous state and surfaces the error.
 */
export function usePreferences(options: UsePreferencesOptions = {}): UsePreferencesReturn {
    const ctx = useContext(PreferencesContext);
    // Always call the underlying hook so the order is stable across renders.
    // When a provider supplies state (`ctx` non-null) the local instance is
    // inactive — no fetch, no writes — and we return the shared value.
    const local = usePreferencesState(options, ctx === null);

    return ctx ?? local;
}

/**
 * The actual state + fetching logic. `active=false` skips network work and
 * makes refresh/update no-ops — used when a parent PreferencesProvider is
 * already the source of truth for this subtree.
 */
function usePreferencesState(options: UsePreferencesOptions, active: boolean): UsePreferencesReturn {
    const api = useApi();
    const { user } = useAuth();
    const tenantEpoch = useContext(AbeonContext)?.tenantEpoch ?? 0;
    const path = options.path ?? '/api/v1/auth/me/preferences';
    const autoLoad = options.autoLoad ?? true;

    const [preferences, setPreferences] = useState<Preferences>(PREFERENCES_DEFAULTS);
    const [loading, setLoading] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [error, setError] = useState<AbeonError | null>(null);

    const lastFetched = useRef<Preferences | null>(null);

    const refresh = useCallback(async () => {
        if (!active || !user) return;
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
    }, [active, api, path, user]);

    const update = useCallback(
        async (patch: Partial<Preferences>) => {
            if (!active || !user) return;
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
        [active, api, path, preferences, user],
    );

    useEffect(() => {
        if (active && autoLoad && user) {
            void refresh();
        }
        // tenantEpoch: preferences are per-user-per-organisation (ADR-0009 as
        // amended by ADR-0016), so a switch must re-fetch them. Pinned apps in
        // particular are meaningless across organisations — a pin to /crm/contacts
        // means nothing in an organisation that has no CRM.
    }, [active, autoLoad, refresh, user, tenantEpoch]);

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
