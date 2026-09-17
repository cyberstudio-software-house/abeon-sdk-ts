import { useCallback, useContext, useEffect, useState } from 'react';
import { AbeonError } from '../errors.js';
import type { MembershipStatus, OrganisationMember } from '../types/organisation-member.js';
import type { Pagination } from '../types/pagination.js';
import { AbeonContext } from './context.js';
import { useApi } from './use-api.js';

/**
 * List conventions of ADR-0004. Without `page` or `perPage` the endpoint returns every
 * member, as it always has.
 */
export interface AdminUsersQuery {
    filter?: { status?: MembershipStatus };
    /** e.g. `-joined_at`, `email`, `name`. */
    sort?: string;
    page?: number;
    perPage?: number;
}

export interface UseAdminUsersOptions {
    /**
     * Administration endpoint. Default `/api/v1/auth/admin/users` — gated on
     * `core.users.manage`, which is scoped to one organisation.
     */
    path?: string;
    /** Auto-fetch on mount. Default `true`. */
    autoLoad?: boolean;
    query?: AdminUsersQuery;
}

export interface UseAdminUsersReturn {
    /** Members of the **current** organisation. Never anybody else's. */
    members: OrganisationMember[];
    /** Present when the list was requested page by page. */
    pagination: Pagination | null;
    loading: boolean;
    error: AbeonError | null;
    refresh: () => Promise<void>;
    /**
     * Suspend or reinstate one membership, then refresh.
     *
     * Suspension is not a soft delete and does not touch the account: the same
     * person keeps their access to every other organisation they belong to. What it
     * does do immediately is end that organisation's sessions, so the effect is
     * visible to the suspended person within the same request rather than at their
     * next token refresh.
     *
     * Rejects with the `AbeonError` the server sent, so a caller can distinguish the
     * two 409s — suspending yourself, and leaving an organisation with no
     * administrator — by `problem.title` rather than by matching on prose.
     */
    setStatus: (userId: string, status: MembershipStatus) => Promise<void>;
}

export function adminUsersQueryString(query: AdminUsersQuery | undefined): string {
    if (!query) {
        return '';
    }

    const params = new URLSearchParams();
    if (query.filter?.status) {
        params.set('filter[status]', query.filter.status);
    }
    if (query.sort) {
        params.set('sort', query.sort);
    }
    if (query.page !== undefined) {
        params.set('page', String(query.page));
    }
    if (query.perPage !== undefined) {
        params.set('per_page', String(query.perPage));
    }

    const encoded = params.toString();
    return encoded === '' ? '' : `?${encoded}`;
}

function toAbeonError(err: unknown): AbeonError {
    return err instanceof AbeonError
        ? err
        : new AbeonError({
              type: 'about:blank',
              title: 'Administration request failed',
              status: 0,
              detail: err instanceof Error ? err.message : String(err),
          });
}

/**
 * The organisation's member list and the suspend/reinstate action behind it
 * (FR-28, FR-29).
 *
 * Per ADR-0026 this is a hook and not a component: `@abeon/ui` supplies the table,
 * the badge and the dialog, and the administration *screen* belongs to the
 * consuming application.
 *
 * The list is organisation-relative, so a tenant switch invalidates it entirely
 * (ADR-0017). Without that, an admin who switched would be looking at the previous
 * organisation's members while every suspension landed on the new one — wrong on
 * both halves at once, and silently, because the rows would still look plausible.
 */
export function useAdminUsers(options: UseAdminUsersOptions = {}): UseAdminUsersReturn {
    const api = useApi();
    const tenantEpoch = useContext(AbeonContext)?.tenantEpoch ?? 0;
    const path = options.path ?? '/api/v1/auth/admin/users';
    const autoLoad = options.autoLoad ?? true;

    const queryString = adminUsersQueryString(options.query);

    const [members, setMembers] = useState<OrganisationMember[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<AbeonError | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get<{ data: OrganisationMember[]; meta?: Pagination }>(
                `${path}${queryString}`,
            );
            setMembers(Array.isArray(response?.data) ? response.data : []);
            setPagination(response?.meta?.current_page !== undefined ? response.meta : null);
        } catch (err) {
            setError(toAbeonError(err));
            setMembers([]);
            setPagination(null);
        } finally {
            setLoading(false);
        }
    }, [api, path, queryString]);

    const setStatus = useCallback(
        async (userId: string, status: MembershipStatus) => {
            try {
                await api.patch(`${path}/${encodeURIComponent(userId)}/membership`, { status });
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
        // tenantEpoch: the list is the current organisation's members, so a switch
        // makes every row stale (ADR-0017).
    }, [autoLoad, refresh, tenantEpoch]);

    return { members, pagination, loading, error, refresh, setStatus };
}
