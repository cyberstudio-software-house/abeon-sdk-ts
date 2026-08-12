// @vitest-environment jsdom
import { renderHook, waitFor, act } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AppDescriptor } from '../../src/index.js';
import { AbeonProvider, useStore, useTenant } from '../../src/react/index.js';
import type { ApiClient } from '../../src/_internal/api-client-base.js';

function app(name: string, enabled: boolean): AppDescriptor {
    return {
        name,
        label: name.toUpperCase(),
        path: `/${name}`,
        icon: 'users',
        version: '1.0.0',
        permissions: [`${name}.*`],
        category: 'Apps',
        order: 10,
        mode: 'app',
        fullscreen: false,
        enabled,
    };
}

describe('useStore', () => {
    it('loads the full catalog (incl. disabled apps) and toggles enablement', async () => {
        // Mutable server state: helpdesk starts disabled.
        const state: Record<string, boolean> = { crm: true, helpdesk: false };
        const post = vi.fn(async (path: string) => {
            const m = /\/store\/([^/]+)\/(enable|disable)$/.exec(path);
            if (m) state[m[1]!] = m[2] === 'enable';
            return {};
        });
        const get = vi.fn(async (_path: string) => ({
            data: Object.entries(state).map(([n, e]) => app(n, e)),
        }));
        const api: ApiClient = {
            request: (async () => ({})) as never,
            get: get as ApiClient['get'],
            post: post as ApiClient['post'],
            put: (async () => ({})) as never,
            patch: (async () => ({})) as never,
            delete: (async () => ({})) as never,
        };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AbeonProvider apiClient={api}>{children}</AbeonProvider>
        );

        const { result } = renderHook(() => useStore(), { wrapper });

        await waitFor(() => expect(result.current.catalog).toHaveLength(2));
        expect(result.current.catalog.find((a) => a.name === 'helpdesk')?.enabled).toBe(false);

        await act(async () => {
            await result.current.setEnabled('helpdesk', true);
        });

        expect(post).toHaveBeenCalledWith('/api/v1/auth/store/helpdesk/enable');
        expect(result.current.catalog.find((a) => a.name === 'helpdesk')?.enabled).toBe(true);
    });

    it('re-derives the catalog when the organisation changes', async () => {
        // `enabled` is organisation-relative (ADR-0015 as amended by ADR-0016), so
        // the catalogue an admin sees after switching must be the new organisation's.
        // Showing the previous one would mean toggling from stale state while the
        // write lands on the new organisation — wrong on both halves at once.
        const perOrg: Record<number, AppDescriptor[]> = {
            1: [app('crm', true), app('cms', false)],
            2: [app('crm', false), app('cms', true)],
        };
        let orgId = 1;

        const api: ApiClient = {
            request: (async () => ({})) as never,
            get: (async (path: string) => {
                if (path.includes('/auth/tenants')) {
                    return {
                        data: [
                            { id: 1, name: 'Acme', slug: 'acme', current: orgId === 1 },
                            { id: 2, name: 'Bravo', slug: 'bravo', current: orgId === 2 },
                        ],
                    };
                }
                return { data: perOrg[orgId] };
            }) as ApiClient['get'],
            post: (async (path: string) => {
                if (path.includes('/auth/tenant')) {
                    orgId = 2;
                    return { data: { org_id: 2 } };
                }
                return {};
            }) as ApiClient['post'],
            put: (async () => ({})) as never,
            patch: (async () => ({})) as never,
            delete: (async () => ({})) as never,
        };

        const wrapper = ({ children }: { children: ReactNode }) => (
            <AbeonProvider apiClient={api}>{children}</AbeonProvider>
        );

        const { result } = renderHook(() => ({ store: useStore(), tenant: useTenant() }), {
            wrapper,
        });

        await waitFor(() =>
            expect(result.current.store.catalog.find((a) => a.name === 'crm')?.enabled).toBe(true),
        );

        await act(async () => {
            await result.current.tenant.switchTenant(2);
        });

        await waitFor(() => {
            expect(result.current.store.catalog.find((a) => a.name === 'crm')?.enabled).toBe(false);
            expect(result.current.store.catalog.find((a) => a.name === 'cms')?.enabled).toBe(true);
        });
    });
});
