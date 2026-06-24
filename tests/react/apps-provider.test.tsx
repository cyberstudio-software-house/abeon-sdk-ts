// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AppDescriptor } from '../../src/index.js';
import { AbeonProvider, AppsProvider, useApps } from '../../src/react/index.js';
import type { ApiClient } from '../../src/_internal/api-client-base.js';

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
    },
];

function countingApi(): { api: ApiClient; appsCalls: () => number } {
    const get = vi.fn(async (path: string) => {
        if (path === '/api/v1/auth/apps') return { data: sampleApps };
        return { data: [] };
    });
    const reject = async () => {
        throw new Error('not used in test');
    };
    const api: ApiClient = {
        request: reject as never,
        get: get as ApiClient['get'],
        post: reject as never,
        put: reject as never,
        patch: reject as never,
        delete: reject as never,
    };
    return {
        api,
        appsCalls: () =>
            get.mock.calls.filter(([p]) => p === '/api/v1/auth/apps').length,
    };
}

describe('AppsProvider (hoisted useApps)', () => {
    it('shares a single /apps fetch across multiple useApps consumers', async () => {
        const { api, appsCalls } = countingApi();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AbeonProvider apiClient={api}>
                <AppsProvider>{children}</AppsProvider>
            </AbeonProvider>
        );

        // Two independent consumers under the same provider.
        const { result } = renderHook(
            () => ({ a: useApps(), b: useApps() }),
            { wrapper },
        );

        await waitFor(() => expect(result.current.a.apps).toHaveLength(1));

        expect(result.current.b.apps).toEqual(sampleApps);
        // Hoisted: both consumers share the provider's single fetch.
        expect(appsCalls()).toBe(1);
        // Same object identity — proves it's the shared context value, not a copy.
        expect(result.current.a.apps).toBe(result.current.b.apps);
    });
});
