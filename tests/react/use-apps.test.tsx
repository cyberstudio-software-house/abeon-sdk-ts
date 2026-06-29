// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AbeonError, type AppDescriptor } from '../../src/index.js';
import { AbeonProvider, useApps } from '../../src/react/index.js';
import type { ApiClient } from '../../src/_internal/api-client-base.js';

function fakeApi(handler: (path: string) => unknown | Promise<unknown>): ApiClient {
    const get = vi.fn(async (path: string) => handler(path));
    const reject = async () => {
        throw new Error('not used in test');
    };
    return {
        request: reject as never,
        get: get as ApiClient['get'],
        post: reject as never,
        put: reject as never,
        patch: reject as never,
        delete: reject as never,
    };
}

const sampleApps: AppDescriptor[] = [
    {
        name: 'crm',
        label: 'CRM',
        path: '/crm',
        icon: 'users',
        version: '1.0.0',
        permissions: ['crm.contacts.read'],
        category: 'Sprzedaż i finanse',
        order: 10,
        mode: 'app',
        fullscreen: false,
        enabled: true,
    },
    {
        name: 'pm',
        label: 'Projects',
        path: '/pm',
        icon: 'kanban',
        version: '1.0.0',
        permissions: ['pm.tasks.manage'],
        category: 'Praca',
        order: 20,
        mode: 'app',
        fullscreen: false,
        enabled: true,
    },
];

function wrap(api: ApiClient) {
    return ({ children }: { children: ReactNode }) => (
        <AbeonProvider apiClient={api}>{children}</AbeonProvider>
    );
}

describe('useApps', () => {
    it('auto-fetches from /api/v1/auth/apps and unwraps `data`', async () => {
        const api = fakeApi(() => ({ data: sampleApps }));
        const { result } = renderHook(() => useApps(), { wrapper: wrap(api) });

        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(api.get).toHaveBeenCalledWith('/api/v1/auth/apps');
        expect(result.current.apps).toEqual(sampleApps);
        expect(result.current.error).toBeNull();
    });

    it('exposes error when fetch throws AbeonError', async () => {
        const api = fakeApi(() => {
            throw new AbeonError({
                type: 'https://api.abeon.pl/errors/unauthenticated',
                title: 'Unauthenticated',
                status: 401,
            });
        });
        const { result } = renderHook(() => useApps(), { wrapper: wrap(api) });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.apps).toEqual([]);
        expect(result.current.error?.status).toBe(401);
    });

    it('wraps non-AbeonError throws in a generic AbeonError', async () => {
        const api = fakeApi(() => {
            throw new Error('network down');
        });
        const { result } = renderHook(() => useApps(), { wrapper: wrap(api) });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBeInstanceOf(AbeonError);
        expect(result.current.error?.problem.detail).toBe('network down');
    });

    it('skips auto-fetch when autoLoad=false', () => {
        const api = fakeApi(() => ({ data: sampleApps }));
        const { result } = renderHook(() => useApps({ autoLoad: false }), {
            wrapper: wrap(api),
        });
        expect(result.current.loading).toBe(false);
        expect(api.get).not.toHaveBeenCalled();
    });

    it('refresh() re-fetches on demand', async () => {
        const api = fakeApi(() => ({ data: sampleApps }));
        const { result } = renderHook(() => useApps(), { wrapper: wrap(api) });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(api.get).toHaveBeenCalledTimes(1);

        await act(async () => {
            await result.current.refresh();
        });
        expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('respects custom path option', async () => {
        const api = fakeApi(() => ({ data: [] }));
        const { result } = renderHook(() => useApps({ path: '/custom/apps' }), {
            wrapper: wrap(api),
        });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(api.get).toHaveBeenCalledWith('/custom/apps');
    });

    it('handles unexpected payload shape gracefully', async () => {
        const api = fakeApi(() => ({ data: 'not an array' }));
        const { result } = renderHook(() => useApps(), { wrapper: wrap(api) });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.apps).toEqual([]);
    });
});
