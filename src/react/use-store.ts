import { useCallback, useContext, useEffect, useState } from 'react';
import { AbeonError } from '../errors.js';
import type { AppDescriptor } from '../types/app-descriptor.js';
import { AbeonContext } from './context.js';
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
    /**
     * Full app catalog for the **current organisation** — every registered app, with
     * `enabled` reflecting whether that organisation holds it.
     */
    catalog: AppDescriptor[];
    loading: boolean;
    error: AbeonError | null;
    /** Re-fetch the catalog. */
    refresh: () => Promise<void>;
    /**
     * Assign an app to the current organisation, or take it away, then refresh.
     *
     * "Enable" means **install for this organisation** (a `tenant_apps` row), not a
     * platform-wide switch — admin scope is per organisation (ADR-0015 as amended by
     * ADR-0016). The target organisation is the one in the caller's token, never a
     * parameter: a client naming its own organisation would be choosing whose data
     * it changes.
     */
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
 * Admin App Store hook (ADR-0015 as amended by ADR-0016). Lists the catalog for
 * the current organisation and assigns apps to it — the "add an app to your plan"
 * flow. Mirrors `useApps`/`useNotifications`; backed by the store API (stubbed by
 * `abeon-auth-stub` until the real service ships it).
 *
 * The catalog is **organisation-relative**, so it re-derives on a tenant switch.
 * Without that, an admin who switched organisations would see the previous one's
 * enablement and toggle from stale state — while the write landed on the new
 * organisation. Wrong on both halves at once.
 */
export function useStore(options: UseStoreOptions = {}): UseStoreReturn {
    const api = useApi();
    const tenantEpoch = useContext(AbeonContext)?.tenantEpoch ?? 0;
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
        // tenantEpoch: `enabled` is resolved for the caller's organisation, so a
        // switch invalidates the whole catalogue (ADR-0017).
    }, [autoLoad, refresh, tenantEpoch]);

    return { catalog, loading, error, refresh, setEnabled };
}
