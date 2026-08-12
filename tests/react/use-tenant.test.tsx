// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AbeonError, type Tenant, type User } from '../../src/index.js';
import { AbeonProvider, useApps, useAuth, useTenant } from '../../src/react/index.js';
import type { ApiClient } from '../../src/_internal/api-client-base.js';

const ACME: Tenant = { id: 1, name: 'Acme Sp. z o.o.', slug: 'acme', logo_url: null, current: true };
const BRAVO: Tenant = { id: 2, name: 'Bravo Media', slug: 'bravo', logo_url: null, current: false };

const VIEWER: User = {
    id: '3',
    email: 'viewer@abeon.dev',
    name: 'Dev Viewer',
    roles: ['viewer'],
    permissions: ['crm.contacts.read'],
    org_id: 1,
};

const EDITOR_IN_BRAVO: User = {
    ...VIEWER,
    roles: ['editor'],
    permissions: ['cms.pages.read', 'cms.pages.write'],
    org_id: 2,
};

interface FakeApiOptions {
    tenants?: Tenant[];
    onSwitch?: (orgId: number) => unknown;
    apps?: (callNumber: number) => unknown;
}

function fakeApi(options: FakeApiOptions = {}) {
    let orgId = 1;
    let appsCalls = 0;

    const get = vi.fn(async (path: string) => {
        if (path.includes('/auth/tenants')) {
            const list = options.tenants ?? [ACME, BRAVO];
            return { data: list.map((t) => ({ ...t, current: t.id === orgId })) };
        }
        if (path.includes('/auth/apps')) {
            appsCalls++;
            return options.apps?.(appsCalls) ?? { data: [] };
        }
        return { data: [] };
    });

    const post = vi.fn(async (path: string, body?: unknown) => {
        if (path.includes('/auth/tenant')) {
            const target = (body as { org_id: number }).org_id;
            if (options.onSwitch) {
                return options.onSwitch(target);
            }
            orgId = target;
            return { data: { org_id: target, user: EDITOR_IN_BRAVO } };
        }
        return { data: null };
    });

    const reject = async () => {
        throw new Error('not used in test');
    };

    const client: ApiClient = {
        request: reject as never,
        get: get as ApiClient['get'],
        post: post as ApiClient['post'],
        put: reject as never,
        patch: reject as never,
        delete: reject as never,
    };

    return { client, get, post, appsCallCount: () => appsCalls };
}

function wrapper(client: ApiClient, user: User | null = VIEWER) {
    return ({ children }: { children: ReactNode }) => (
        <AbeonProvider apiClient={client} initialAuth={{ user }}>
            {children}
        </AbeonProvider>
    );
}

describe('useTenant', () => {
    it('lists the organisations the user belongs to and marks the current one', async () => {
        const { client } = fakeApi();
        const { result } = renderHook(() => useTenant(), { wrapper: wrapper(client) });

        await waitFor(() => expect(result.current.tenants).toHaveLength(2));

        expect(result.current.currentTenant?.slug).toBe('acme');
        expect(result.current.canSwitch).toBe(true);
    });

    it('does not offer switching to a single-organisation user', async () => {
        const { client } = fakeApi({ tenants: [ACME] });
        const { result } = renderHook(() => useTenant(), { wrapper: wrapper(client) });

        await waitFor(() => expect(result.current.tenants).toHaveLength(1));

        // A single-organisation user should see a label, not a menu (MVP FR-2).
        expect(result.current.canSwitch).toBe(false);
    });

    it('switching re-issues auth state with the target membership permissions', async () => {
        const { client, post } = fakeApi();
        const { result } = renderHook(
            () => ({ tenant: useTenant(), auth: useAuth() }),
            { wrapper: wrapper(client) },
        );

        await waitFor(() => expect(result.current.tenant.tenants).toHaveLength(2));

        // Before: a viewer in Acme.
        expect(result.current.auth.hasPermission('cms.pages.write')).toBe(false);

        await act(async () => {
            await result.current.tenant.switchTenant(2);
        });

        expect(post).toHaveBeenCalledWith('/api/v1/auth/tenant', { org_id: 2 });

        // After: an editor in Bravo. The permissions came from the server's
        // re-issued token, not from anything the client decided.
        await waitFor(() => {
            expect(result.current.auth.user?.org_id).toBe(2);
        });
        expect(result.current.auth.hasPermission('cms.pages.write')).toBe(true);
        expect(result.current.auth.hasPermission('crm.contacts.read')).toBe(false);
    });

    it('moves `current` to the organisation switched into', async () => {
        const { client } = fakeApi();
        const { result } = renderHook(() => useTenant(), { wrapper: wrapper(client) });

        await waitFor(() => expect(result.current.tenants).toHaveLength(2));

        await act(async () => {
            await result.current.switchTenant(2);
        });

        await waitFor(() => expect(result.current.currentTenant?.slug).toBe('bravo'));
    });

    it('re-derives the app list on switch', async () => {
        // The whole point of the epoch: /apps returns tenant_apps ∩ permissions,
        // so both halves change and a stale list is a wrong list.
        const { client, appsCallCount } = fakeApi({
            apps: (call) =>
                call === 1
                    ? { data: [{ name: 'crm' }] }
                    : { data: [{ name: 'cms' }, { name: 'helpdesk' }] },
        });

        const { result } = renderHook(
            () => ({ tenant: useTenant(), apps: useApps() }),
            { wrapper: wrapper(client) },
        );

        await waitFor(() => expect(result.current.apps.apps).toHaveLength(1));
        expect(appsCallCount()).toBe(1);

        await act(async () => {
            await result.current.tenant.switchTenant(2);
        });

        await waitFor(() => expect(result.current.apps.apps).toHaveLength(2));
        expect(result.current.apps.apps.map((a) => a.name)).toEqual(['cms', 'helpdesk']);
    });

    it('a rejected switch surfaces the error and leaves auth untouched', async () => {
        const { client } = fakeApi({
            onSwitch: () => {
                throw new AbeonError({
                    type: 'https://api.abeon.pl/errors/forbidden',
                    title: 'Forbidden',
                    status: 403,
                    detail: 'You are not a member of that organisation.',
                });
            },
        });

        const { result } = renderHook(
            () => ({ tenant: useTenant(), auth: useAuth() }),
            { wrapper: wrapper(client) },
        );

        await waitFor(() => expect(result.current.tenant.tenants).toHaveLength(2));

        await act(async () => {
            // Being refused is a normal outcome, not a broken session.
            await expect(result.current.tenant.switchTenant(2)).rejects.toBeInstanceOf(AbeonError);
        });

        expect(result.current.tenant.error?.status).toBe(403);
        expect(result.current.auth.user?.org_id).toBe(1);
        expect(result.current.tenant.currentTenant?.slug).toBe('acme');
        expect(result.current.tenant.switching).toBe(false);
    });

    it('surfaces a failed list fetch without throwing', async () => {
        const client: ApiClient = {
            request: (async () => {
                throw new Error('x');
            }) as never,
            get: (async () => {
                throw new AbeonError({
                    type: 'about:blank',
                    title: 'Server Error',
                    status: 500,
                    detail: null,
                });
            }) as ApiClient['get'],
            post: (async () => ({ data: null })) as never,
            put: (async () => ({})) as never,
            patch: (async () => ({})) as never,
            delete: (async () => ({})) as never,
        };

        const { result } = renderHook(() => useTenant(), { wrapper: wrapper(client) });

        await waitFor(() => expect(result.current.error).not.toBeNull());
        expect(result.current.tenants).toEqual([]);
        expect(result.current.currentTenant).toBeNull();
        expect(result.current.canSwitch).toBe(false);
    });

    it('throws when used outside the provider', () => {
        // Better a loud error at mount than a hook silently reading no user.
        expect(() => renderHook(() => useTenant({ autoLoad: false }))).toThrow(
            /must be used inside <AbeonProvider>/,
        );
    });
});
