// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AbeonError, type NotificationPreference, type User } from '../../src/index.js';
import { AbeonProvider, useNotificationPreferences } from '../../src/react/index.js';
import type { ApiClient } from '../../src/_internal/api-client-base.js';

const VIEWER: User = {
    id: '3',
    email: 'viewer@abeon.dev',
    name: 'Dev Viewer',
    roles: ['viewer'],
    permissions: [],
    org_id: 1,
};

const STORED: NotificationPreference[] = [
    { type: '*', channels: { email: false } },
    { type: 'crm.deal.assigned', channels: { email: true } },
];

function fakeApi(options: { onPut?: (body: unknown) => unknown } = {}) {
    let stored = STORED;

    const get = vi.fn(async (path: string) => {
        if (path === '/api/v1/notifications/preferences') {
            return { data: { preferences: stored } };
        }
        return { data: [] };
    });

    const put = vi.fn(async (_path: string, body?: unknown) => {
        if (options.onPut) {
            return options.onPut(body);
        }
        stored = (body as { preferences: NotificationPreference[] }).preferences;
        return { data: { preferences: stored } };
    });

    const reject = async () => {
        throw new Error('not used in test');
    };

    const client: ApiClient = {
        request: reject as never,
        get: get as ApiClient['get'],
        post: reject as never,
        put: put as ApiClient['put'],
        patch: reject as never,
        delete: reject as never,
    };

    return { client, get, put };
}

function wrapper(client: ApiClient, user: User | null = VIEWER) {
    return ({ children }: { children: ReactNode }) => (
        <AbeonProvider apiClient={client} initialAuth={{ user }}>
            {children}
        </AbeonProvider>
    );
}

describe('useNotificationPreferences', () => {
    it('loads the rules on mount', async () => {
        const { client } = fakeApi();
        const { result } = renderHook(() => useNotificationPreferences(), { wrapper: wrapper(client) });

        await waitFor(() => expect(result.current.preferences).toEqual(STORED));
        expect(result.current.error).toBeNull();
    });

    it('does not ask for preferences without a signed-in user', async () => {
        const { client, get } = fakeApi();
        renderHook(() => useNotificationPreferences(), { wrapper: wrapper(client, null) });

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(get.mock.calls.map((c) => c[0])).not.toContain('/api/v1/notifications/preferences');
    });

    it('replaces the whole set on save and keeps what the server answered', async () => {
        const { client, put } = fakeApi();
        const { result } = renderHook(() => useNotificationPreferences(), { wrapper: wrapper(client) });
        await waitFor(() => expect(result.current.preferences).toHaveLength(2));

        const next: NotificationPreference[] = [{ type: '*', channels: { email: true } }];
        await act(() => result.current.save(next));

        expect(put).toHaveBeenCalledWith('/api/v1/notifications/preferences', { preferences: next });
        expect(result.current.preferences).toEqual(next);
        expect(result.current.saving).toBe(false);
    });

    it('rejects with the server error and keeps the previous rules', async () => {
        const refused = new AbeonError({
            type: 'https://api.abeon.pl/errors/validation',
            title: 'Validation Error',
            status: 422,
            detail: 'preferences.0.channels.in_app is not configurable',
        });
        const { client } = fakeApi({
            onPut: () => {
                throw refused;
            },
        });
        const { result } = renderHook(() => useNotificationPreferences(), { wrapper: wrapper(client) });
        await waitFor(() => expect(result.current.preferences).toHaveLength(2));

        await act(async () => {
            await expect(result.current.save([])).rejects.toBe(refused);
        });

        expect(result.current.error).toBe(refused);
        expect(result.current.preferences).toEqual(STORED);
    });
});
