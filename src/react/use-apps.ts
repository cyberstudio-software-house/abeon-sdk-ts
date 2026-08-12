import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import { AbeonError } from '../errors.js';
import type { AppDescriptor } from '../types/app-descriptor.js';
import { AbeonContext } from './context.js';
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
 * Internal fetcher — the actual REST call + local state. Used directly by
 * `<AppsProvider>` (one shared instance) and as the standalone fallback when
 * no provider is mounted.
 */
function useAppsFetcher(options: UseAppsOptions = {}): UseAppsReturn {
    const api = useApi();
    const path = options.path ?? '/api/v1/auth/apps';
    const autoLoad = options.autoLoad ?? true;

    // The app list is tenant-scoped: `/apps` returns tenant_apps ∩ permissions
    // (ADR-0010 as amended by ADR-0016), so both halves change on a switch. Read
    // the epoch so a switch re-fetches (ADR-0017). Optional context — the hook
    // still works standalone, where there is nothing to invalidate.
    const tenantEpoch = useContext(AbeonContext)?.tenantEpoch ?? 0;

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
        // tenantEpoch is listed deliberately: a tenant switch must re-derive the
        // list, and it is not otherwise reachable from `refresh`'s identity.
    }, [autoLoad, refresh, tenantEpoch]);

    return { apps, loading, error, refresh };
}

const AppsContext = createContext<UseAppsReturn | null>(null);
AppsContext.displayName = 'AbeonApps';

export interface AppsProviderProps extends UseAppsOptions {
    children: ReactNode;
}

/**
 * Hoists the app-registry fetch to a single instance for the subtree, so
 * `<Topbar>`, `<AppSwitcher>` and any other consumer share one `/api/v1/auth/apps`
 * request and one cache (G6). Mount it once at the chrome layer (e.g. the app's
 * layout, below `<AbeonProvider>` so `useApi()` is available). Requires an
 * authenticated context — `/api/v1/auth/apps` is auth-gated.
 */
export function AppsProvider({ children, ...options }: AppsProviderProps): ReactNode {
    const value = useAppsFetcher(options);

    return createElement(AppsContext.Provider, { value }, children);
}

/**
 * Returns the list of applications the current user can access — used by
 * `<AppSwitcher>` in @abeon/ui (arch doc 3.6). Source of truth: Auth
 * service's `GET /api/v1/auth/apps` (filtered by user permissions).
 *
 * When an `<AppsProvider>` is mounted above (the default via `<AbeonProvider>`),
 * every call shares that single fetch. With no provider, the hook falls back to
 * its own local fetch so standalone use keeps working.
 */
export function useApps(options: UseAppsOptions = {}): UseAppsReturn {
    const shared = useContext(AppsContext);
    // When the shared provider is present, suppress the fallback's own fetch
    // (keep hook order stable by always calling it).
    const fallback = useAppsFetcher({
        ...options,
        autoLoad: shared ? false : (options.autoLoad ?? true),
    });

    return shared ?? fallback;
}
