import { useCallback, useEffect, useState } from 'react';
import { AbeonError } from '../errors.js';
import type { AppDescriptor } from '../types/app-descriptor.js';
import { useApi } from './use-api.js';

export interface UseAppsOptions {
    /**
     * Path to the App Registry endpoint. Default `/api/v1/auth/apps`
     * (matches PHP `Abeon\SDK\Services\ServiceRegistry::list()` route).
     */
    path?: string;
    /** Auto-fetch on mount. Default `true`. */
    autoLoad?: boolean;
}

export interface UseAppsReturn {
    /** Apps available to the current user (per Auth's filtering by permissions). */
    apps: AppDescriptor[];
    /** True while a fetch is in flight. */
    loading: boolean;
    /** Last error (typed RFC 7807 when upstream returned application/problem+json). */
    error: AbeonError | null;
    /** Trigger a re-fetch on demand (e.g. after permission change). */
    refresh: () => Promise<void>;
}

/**
 * Fetches the list of applications the current user can access — used by
 * `<AppSwitcher>` in @abeon/ui (arch doc 3.6). Source of truth: Auth
 * service's `GET /api/v1/auth/apps` (filtered by user permissions).
 *
 * Caches in-memory for the lifetime of the consuming component. For
 * cross-component sharing, mount this hook in the layout and pass the
 * `apps` array down — or hoist into the AbeonProvider (future Sprint).
 */
export function useApps(options: UseAppsOptions = {}): UseAppsReturn {
    const api = useApi();
    const path = options.path ?? '/api/v1/auth/apps';
    const autoLoad = options.autoLoad ?? true;

    const [apps, setApps] = useState<AppDescriptor[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<AbeonError | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get<{ data: AppDescriptor[] }>(path);
            setApps(Array.isArray(response?.data) ? response.data : []);
        } catch (err) {
            if (err instanceof AbeonError) {
                setError(err);
            } else {
                setError(
                    new AbeonError({
                        type: 'about:blank',
                        title: 'Unknown error',
                        status: 0,
                        detail: err instanceof Error ? err.message : String(err),
                    }),
                );
            }
            setApps([]);
        } finally {
            setLoading(false);
        }
    }, [api, path]);

    useEffect(() => {
        if (autoLoad) {
            void refresh();
        }
    }, [autoLoad, refresh]);

    return { apps, loading, error, refresh };
}
