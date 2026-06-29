import { useCallback, useEffect, useState } from 'react';
import { AbeonError } from '../errors.js';
import type { AppDescriptor } from '../types/app-descriptor.js';
import { useApi } from './use-api.js';

export interface UseStoreOptions {
    /**
     * Store/catalog endpoint. Default `/api/v1/auth/store` (ADR-0015) — admin-scoped;
     * returns ALL registered apps with each one's `enabled` state (unlike `/auth/apps`,
     * which returns only the user-visible, enabled+permitted subset).
     */
    path?: string;
    /** Auto-fetch on mount. Default `true`. */
    autoLoad?: boolean;
}

export interface UseStoreReturn {
    /** Full app catalog (every registered app; `enabled` reflects org enablement). */
    catalog: AppDescriptor[];
    loading: boolean;
    error: AbeonError | null;
    /** Re-fetch the catalog. */
    refresh: () => Promise<void>;
    /** Enable/disable an app for the org, then refresh the catalog. */
    setEnabled: (name: string, enabled: boolean) => Promise<void>;
}

function toAbeonError(err: unknown): AbeonError {
    return err instanceof AbeonError
        ? err
        : new AbeonError({
              type: 'about:blank',
              title: 'Store request failed',
              status: 0,
              detail: err instanceof Error ? err.message : String(err),
          });
}

/**
 * Admin App Store hook (ADR-0015). Lists the full app catalog and toggles
 * org-level enablement — the "add an app to your plan" flow. Mirrors
 * `useApps`/`useNotifications`; backed by the store API (stubbed by
 * `abeon-auth-stub` until the real Auth ships it).
 */
export function useStore(options: UseStoreOptions = {}): UseStoreReturn {
    const api = useApi();
    const path = options.path ?? '/api/v1/auth/store';
    const autoLoad = options.autoLoad ?? true;

    const [catalog, setCatalog] = useState<AppDescriptor[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<AbeonError | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get<{ data: AppDescriptor[] }>(path);
            setCatalog(Array.isArray(response?.data) ? response.data : []);
        } catch (err) {
            setError(toAbeonError(err));
            setCatalog([]);
        } finally {
            setLoading(false);
        }
    }, [api, path]);

    const setEnabled = useCallback(
        async (name: string, enabled: boolean) => {
            const action = enabled ? 'enable' : 'disable';
            try {
                await api.post(`${path}/${encodeURIComponent(name)}/${action}`);
            } catch (err) {
                setError(toAbeonError(err));
                throw err;
            }
            await refresh();
        },
        [api, path, refresh],
    );

    useEffect(() => {
        if (autoLoad) {
            void refresh();
        }
    }, [autoLoad, refresh]);

    return { catalog, loading, error, refresh, setEnabled };
}
