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
import type { Tenant } from '../types/tenant.js';
import type { User } from '../types/user.js';
import { AbeonContext } from './context.js';
import { useApi } from './use-api.js';

export interface UseTenantOptions {
    /** Endpoint listing the caller's organisations. Default `/api/v1/auth/tenants`. */
    path?: string;
    /** Endpoint that performs the switch. Default `/api/v1/auth/tenant`. */
    switchPath?: string;
    /** Auto-fetch on mount. Default `true`. */
    autoLoad?: boolean;
}

export interface UseTenantReturn {
    /** Organisations the current user belongs to. Empty until loaded. */
    tenants: Tenant[];
    /** The organisation the current token is scoped to, or null. */
    currentTenant: Tenant | null;
    /**
     * True when the user belongs to more than one organisation — i.e. when a
     * switcher is worth rendering at all. A single-organisation user should see
     * the name as a label, not a menu (MVP spec FR-2).
     */
    canSwitch: boolean;
    loading: boolean;
    /** True while a switch is in flight. */
    switching: boolean;
    error: AbeonError | null;
    refresh: () => Promise<void>;
    /**
     * Switch the active organisation.
     *
     * Posts to Auth, which verifies membership and **re-issues the token** with
     * the target membership's roles and permissions (ADR-0017) — the client never
     * asserts its own tenant, because `org_id` is an authorization dimension.
     *
     * On success the auth state is updated and every tenant-scoped hook
     * (`useApps`, `usePreferences`) re-derives, with no page reload.
     */
    switchTenant: (orgId: number) => Promise<void>;
}

interface SwitchResponse {
    data?: {
        org_id?: number;
        user?: User;
    };
}

function toAbeonError(err: unknown): AbeonError {
    return err instanceof AbeonError
        ? err
        : new AbeonError({
              type: 'about:blank',
              title: 'Tenant request failed',
              status: 0,
              detail: err instanceof Error ? err.message : String(err),
          });
}

function useTenantState(options: UseTenantOptions = {}): UseTenantReturn {
    const api = useApi();
    const ctx = useContext(AbeonContext);
    if (!ctx) {
        throw new Error('@abeon/sdk-ts/react: useTenant() must be used inside <AbeonProvider>');
    }

    const path = options.path ?? '/api/v1/auth/tenants';
    const switchPath = options.switchPath ?? '/api/v1/auth/tenant';
    const autoLoad = options.autoLoad ?? true;

    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [switching, setSwitching] = useState<boolean>(false);
    const [error, setError] = useState<AbeonError | null>(null);

    const { setUser, onTenantSwitched } = ctx;

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get<{ data: Tenant[] }>(path);
            setTenants(Array.isArray(response?.data) ? response.data : []);
        } catch (err) {
            setError(toAbeonError(err));
            setTenants([]);
        } finally {
            setLoading(false);
        }
    }, [api, path]);

    const switchTenant = useCallback(
        async (orgId: number) => {
            setSwitching(true);
            setError(null);
            try {
                const response = await api.post<SwitchResponse>(`${switchPath}`, { org_id: orgId });

                // Auth returns the User DTO for the new context, so the chrome can
                // update without a second round-trip. Its roles and permissions are
                // the target membership's — that is the point of re-issuing.
                const nextUser = response?.data?.user ?? null;
                if (nextUser) {
                    setUser(nextUser);
                }

                // Optimistically move `current` so the switcher settles immediately;
                // refresh() below reconciles with the server.
                setTenants((prev) =>
                    prev.map((t) => ({ ...t, current: t.id === orgId })),
                );

                // Tell every tenant-scoped hook to re-derive. Done before refresh()
                // so the app list starts reloading immediately rather than after the
                // tenant list round-trip.
                onTenantSwitched();

                await refresh();
            } catch (err) {
                // A failed switch must leave the caller where they were — a 403 from
                // a non-membership is a normal outcome, not a broken session.
                setError(toAbeonError(err));
                throw err;
            } finally {
                setSwitching(false);
            }
        },
        [api, switchPath, setUser, onTenantSwitched, refresh],
    );

    useEffect(() => {
        if (autoLoad) {
            void refresh();
        }
    }, [autoLoad, refresh]);

    const currentTenant = tenants.find((t) => t.current === true) ?? null;

    return {
        tenants,
        currentTenant,
        canSwitch: tenants.length > 1,
        loading,
        switching,
        error,
        refresh,
        switchTenant,
    };
}

const TenantContext = createContext<UseTenantReturn | null>(null);
TenantContext.displayName = 'AbeonTenant';

export interface TenantProviderProps extends UseTenantOptions {
    children: ReactNode;
}

/**
 * Hoists the tenant list to a single instance for the subtree, so the switcher
 * and anything else reading the current organisation share one fetch and one
 * state — mirroring `<AppsProvider>`.
 */
export function TenantProvider({ children, ...options }: TenantProviderProps): ReactNode {
    const value = useTenantState(options);

    return createElement(TenantContext.Provider, { value }, children);
}

/**
 * The current organisation, the ones available, and how to switch (ADR-0016/0017).
 *
 *     const { tenants, currentTenant, canSwitch, switchTenant } = useTenant();
 *
 * With a `<TenantProvider>` mounted above, every call shares that one fetch. With
 * no provider, the hook falls back to its own, so standalone use keeps working.
 */
export function useTenant(options: UseTenantOptions = {}): UseTenantReturn {
    const shared = useContext(TenantContext);
    // Keep hook order stable by always calling the fallback, but suppress its
    // fetch when a provider is present.
    const fallback = useTenantState({
        ...options,
        autoLoad: shared ? false : (options.autoLoad ?? true),
    });

    return shared ?? fallback;
}
