// @vitest-environment jsdom
import { renderHook, waitFor, act } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AppDescriptor } from '../../src/index.js';
import { AbeonProvider, useStore } from '../../src/react/index.js';
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
});
