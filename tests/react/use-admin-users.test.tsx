// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AbeonError, type OrganisationMember, type Tenant, type User } from '../../src/index.js';
import { AbeonProvider, useAdminUsers, useTenant } from '../../src/react/index.js';
import type { ApiClient } from '../../src/_internal/api-client-base.js';

const ACME: Tenant = { id: 1, name: 'Acme Sp. z o.o.', slug: 'acme', logo_url: null, current: true };
const BRAVO: Tenant = { id: 2, name: 'Bravo Media', slug: 'bravo', logo_url: null, current: false };

const ADMIN: User = {
    id: '1',
    email: 'admin@abeon.dev',
    name: 'Dev Admin',
    roles: ['admin'],
    permissions: ['core.users.manage'],
    org_id: 1,
};

const ACME_MEMBERS: OrganisationMember[] = [
    {
        id: '1',
        email: 'admin@abeon.dev',
        name: 'Dev Admin',
        status: 'active',
        roles: ['admin'],
        joined_at: '2026-01-04T10:00:00+00:00',
        last_used_at: '2026-08-17T08:30:00+00:00',
    },
    {
        id: '3',
        email: 'viewer@abeon.dev',
        name: 'Dev Viewer',
        status: 'active',
        roles: ['viewer'],
        joined_at: '2026-02-11T10:00:00+00:00',
        last_used_at: null,
    },
];

const BRAVO_MEMBERS: OrganisationMember[] = [
    {
        id: '9',
        email: 'editor@bravo.dev',
        name: 'Bravo Editor',
        status: 'active',
        roles: ['editor'],
        joined_at: '2026-05-20T10:00:00+00:00',
        last_used_at: null,
    },
];

interface FakeApiOptions {
    /** Per organisation, so a tenant switch can return a genuinely different list. */
    membersByOrg?: Record<number, OrganisationMember[]>;
    onPatch?: (path: string, body?: unknown) => unknown;
}

function fakeApi(options: FakeApiOptions = {}) {
    let orgId = 1;
    let listCalls = 0;
    const byOrg = options.membersByOrg ?? { 1: ACME_MEMBERS, 2: BRAVO_MEMBERS };

    const get = vi.fn(async (path: string) => {
        if (path.includes('/auth/tenants')) {
            return { data: [ACME, BRAVO].map((t) => ({ ...t, current: t.id === orgId })) };
        }
        if (path.includes('/auth/admin/users')) {
            listCalls++;
            return { data: byOrg[orgId] ?? [] };
        }
        return { data: [] };
    });

    const post = vi.fn(async (path: string, body?: unknown) => {
        if (path.includes('/auth/tenant')) {
            orgId = (body as { org_id: number }).org_id;
            return { data: { org_id: orgId, user: { ...ADMIN, org_id: orgId } } };
        }
        return { data: null };
    });

    const patch = vi.fn(async (path: string, body?: unknown) => {
        if (options.onPatch) {
            return options.onPatch(path, body);
        }
        const id = path.split('/').at(-2);
        const list = byOrg[orgId] ?? [];
        byOrg[orgId] = list.map((m) =>
            m.id === id ? { ...m, status: (body as { status: OrganisationMember['status'] }).status } : m,
        );
        return { data: (byOrg[orgId] ?? []).find((m) => m.id === id) };
    });

    const reject = async () => {
        throw new Error('not used in test');
    };

    const client: ApiClient = {
        request: reject as never,
        get: get as ApiClient['get'],
        post: post as ApiClient['post'],
        put: reject as never,
        patch: patch as ApiClient['patch'],
        delete: reject as never,
    };

    return { client, get, patch, listCallCount: () => listCalls };
}

function wrapper(client: ApiClient, user: User | null = ADMIN) {
    return ({ children }: { children: ReactNode }) => (
        <AbeonProvider apiClient={client} initialAuth={{ user }}>
            {children}
        </AbeonProvider>
    );
}

describe('useAdminUsers', () => {
    it('loads the current organisation members on mount', async () => {
        const { client } = fakeApi();
        const { result } = renderHook(() => useAdminUsers(), { wrapper: wrapper(client) });

        await waitFor(() => expect(result.current.members).toHaveLength(2));

        expect(result.current.members.map((m) => m.email)).toEqual([
            'admin@abeon.dev',
            'viewer@abeon.dev',
        ]);
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('sends the status change to the membership endpoint, keyed by the user id', async () => {
        // The URL carries the user; the organisation is the token's and is never in
        // the request. A client that could name the organisation would be choosing
        // whose member it suspends.
        const { client, patch } = fakeApi();
        const { result } = renderHook(() => useAdminUsers(), { wrapper: wrapper(client) });

        await waitFor(() => expect(result.current.members).toHaveLength(2));

        await act(async () => {
            await result.current.setStatus('3', 'suspended');
        });

        expect(patch).toHaveBeenCalledWith('/api/v1/auth/admin/users/3/membership', {
            status: 'suspended',
        });
    });

    it('re-reads the list after a status change rather than patching it locally', async () => {
        // The server decides what the row becomes — it also revokes sessions and may
        // refuse. Mutating local state instead would show a suspension that did not
        // happen, and this screen's whole purpose is to say who currently has access.
        const { client } = fakeApi();
        const { result } = renderHook(() => useAdminUsers(), { wrapper: wrapper(client) });

        await waitFor(() => expect(result.current.members).toHaveLength(2));

        await act(async () => {
            await result.current.setStatus('3', 'suspended');
        });

        await waitFor(() =>
            expect(result.current.members.find((m) => m.id === '3')?.status).toBe('suspended'),
        );
    });

    it('re-fetches when the organisation changes', async () => {
        // The counterpart of the Auth-side test that the organisation comes from the
        // token: after a switch the same endpoint answers about somebody else, and a
        // stale list would be an admin looking at one organisation while acting on
        // another.
        const { client } = fakeApi();
        const { result } = renderHook(
            () => ({ admin: useAdminUsers(), tenant: useTenant() }),
            { wrapper: wrapper(client) },
        );

        await waitFor(() => expect(result.current.admin.members).toHaveLength(2));

        await act(async () => {
            await result.current.tenant.switchTenant(2);
        });

        await waitFor(() =>
            expect(result.current.admin.members.map((m) => m.email)).toEqual(['editor@bravo.dev']),
        );
    });

    it('surfaces a refusal as a typed error and rethrows it to the caller', async () => {
        // The two 409s differ only in `title`, and a screen has to tell them apart to
        // say anything useful — "you cannot suspend yourself" is a different message
        // from "this would leave nobody able to manage the organisation".
        const refusal = new AbeonError({
            type: 'https://api.abeon.pl/errors/conflict',
            title: 'Cannot suspend the last administrator',
            status: 409,
            detail: 'This organisation would be left with nobody able to manage its users.',
        });

        const { client } = fakeApi({
            onPatch: () => {
                throw refusal;
            },
        });
        const { result } = renderHook(() => useAdminUsers(), { wrapper: wrapper(client) });

        await waitFor(() => expect(result.current.members).toHaveLength(2));

        let thrown: unknown;
        await act(async () => {
            thrown = await result.current.setStatus('1', 'suspended').catch((e: unknown) => e);
        });

        expect(thrown).toBe(refusal);

        await waitFor(() => expect(result.current.error?.status).toBe(409));
        expect(result.current.error?.problem.title).toBe('Cannot suspend the last administrator');

        // And the list is untouched — a refused suspension must not look applied.
        expect(result.current.members.find((m) => m.id === '1')?.status).toBe('active');
    });

    it('empties the list on a failed load rather than keeping the previous one', async () => {
        // Stale rows after an error are worse than none: they say "these people have
        // access" on the strength of a request that failed.
        const { client } = fakeApi();
        const { result } = renderHook(() => useAdminUsers(), { wrapper: wrapper(client) });

        await waitFor(() => expect(result.current.members).toHaveLength(2));

        (client.get as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
            throw new AbeonError({
                type: 'about:blank',
                title: 'Forbidden',
                status: 403,
                detail: 'Requires core.users.manage.',
            });
        });

        await act(async () => {
            await result.current.refresh();
        });

        expect(result.current.members).toEqual([]);
        expect(result.current.error?.status).toBe(403);
    });
});
