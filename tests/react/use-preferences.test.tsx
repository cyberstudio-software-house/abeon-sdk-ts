// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AbeonProvider, usePreferences } from '../../src/react/index.js';
import { AbeonContext } from '../../src/react/context.js';
import type { ApiClient } from '../../src/_internal/api-client-base.js';
import type { Preferences, User } from '../../src/index.js';

const sampleUser: User = {
    id: '1',
    email: 'admin@abeon.dev',
    name: 'Admin',
    roles: ['admin'],
    permissions: ['*.*.*'],
    org_id: 1,
};

function makeApi() {
    let state: Record<string, unknown> = { version: 1, chrome: {} };
    const get = vi.fn(async () => ({ data: state }));
    const patch = vi.fn(async (_path: string, body: Record<string, unknown>) => {
        // Simulate the server's shallow-by-top-level deep merge.
        const next: Record<string, unknown> = { ...state };
        for (const [k, v] of Object.entries(body)) {
            if (k === 'version') continue;
            if (v && typeof v === 'object' && !Array.isArray(v) && typeof state[k] === 'object' && state[k] !== null && !Array.isArray(state[k])) {
                next[k] = { ...(state[k] as Record<string, unknown>), ...(v as Record<string, unknown>) };
            } else {
                next[k] = v;
            }
        }
        next.version = 1;
        state = next;
        return { data: state };
    });
    const reject = async (): Promise<never> => {
        throw new Error('not used in this test');
    };

    return {
        api: {
            request: reject as never,
            get: get as ApiClient['get'],
            post: reject as never,
            put: reject as never,
            patch: patch as ApiClient['patch'],
            delete: reject as never,
        } as ApiClient,
        get,
        patch,
    };
}

function wrap(api: ApiClient) {
    return ({ children }: { children: ReactNode }) => (
        <AbeonProvider apiClient={api} initialAuth={{ user: sampleUser }}>
            {children}
        </AbeonProvider>
    );
}

describe('usePreferences (context-backed)', () => {
    it('fetches once from /api/v1/auth/me/preferences when mounted under AbeonProvider', async () => {
        const { api, get } = makeApi();
        const { result } = renderHook(() => usePreferences(), { wrapper: wrap(api) });

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(get).toHaveBeenCalledWith('/api/v1/auth/me/preferences');
        expect(result.current.preferences.version).toBe(1);
    });

    it('shares state across multiple consumers in the same tree (one update propagates, one fetch fires)', async () => {
        const { api, get, patch } = makeApi();
        const { result } = renderHook(
            () => ({ a: usePreferences(), b: usePreferences() }),
            { wrapper: wrap(api) },
        );

        await waitFor(() => expect(result.current.a.loading).toBe(false));

        // Provider hosts the single fetch — duplicate hooks under it must NOT each fetch.
        expect(get).toHaveBeenCalledTimes(1);

        // Update through one hook and both should see the new state instantly.
        await act(async () => {
            await result.current.a.update({ chrome: { theme: 'dark' } } as never);
        });

        expect(patch).toHaveBeenCalledTimes(1);
        const themeA = (result.current.a.preferences.chrome as { theme?: string } | undefined)?.theme;
        const themeB = (result.current.b.preferences.chrome as { theme?: string } | undefined)?.theme;
        expect(themeA).toBe('dark');
        expect(themeB).toBe('dark');
        // Same identity — both consumers return the shared context value.
        expect(result.current.a).toBe(result.current.b);
    });
});

describe('usePreferences seeded from the server', () => {
    const saved = {
        version: 1,
        chrome: { theme: 'dark', sidebarCollapsed: true, pinned: [], appOrder: [], recents: [] },
    } as unknown as Preferences;

    function wrapSeeded(api: ApiClient, initialPreferences: unknown) {
        return ({ children }: { children: ReactNode }) => (
            <AbeonProvider
                apiClient={api}
                initialAuth={{ user: sampleUser }}
                initialPreferences={initialPreferences as Preferences}
            >
                {children}
            </AbeonProvider>
        );
    }

    it('renders the saved preferences on the first render and does not fetch on mount', async () => {
        const { api, get } = makeApi();
        const { result } = renderHook(() => usePreferences(), { wrapper: wrapSeeded(api, saved) });

        expect(result.current.preferences.chrome?.theme).toBe('dark');
        expect(result.current.preferences.chrome?.sidebarCollapsed).toBe(true);

        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(get).not.toHaveBeenCalled();
    });

    it('fetches again after a tenant switch', async () => {
        const { api, get } = makeApi();
        const { result } = renderHook(
            () => ({ prefs: usePreferences(), ctx: useContext(AbeonContext) }),
            { wrapper: wrapSeeded(api, saved) },
        );

        act(() => result.current.ctx?.onTenantSwitched());

        await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    });

    it('ignores a document that is not version 1 and fetches as before', async () => {
        const { api, get } = makeApi();
        const { result } = renderHook(() => usePreferences(), {
            wrapper: wrapSeeded(api, { version: 2, chrome: { theme: 'dark' } }),
        });

        expect(result.current.preferences.chrome?.theme).not.toBe('dark');
        await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    });
});
