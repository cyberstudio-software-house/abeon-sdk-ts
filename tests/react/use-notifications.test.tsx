// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { NotificationDto, User } from '../../src/index.js';
import {
    AbeonProvider,
    type EchoLike,
    useNotifications,
} from '../../src/react/index.js';
import type { ApiClient, RequestOptions } from '../../src/_internal/api-client-base.js';

const sampleUser: User = {
    id: '42',
    email: 'jan@example.com',
    name: 'Jan',
    roles: [],
    permissions: [],
    org_id: null,
};

const sampleNotifications: NotificationDto[] = [
    {
        id: 'n1',
        user_id: 42,
        type: 'helpdesk.ticket.assigned',
        title: 'New ticket',
        body: 'Ticket #100 assigned to you',
        icon: 'headphones',
        action_url: '/helpdesk/tickets/100',
        source_app: 'helpdesk',
        read_at: null,
        created_at: '2026-05-15T10:00:00.000Z',
    },
    {
        id: 'n2',
        user_id: 42,
        type: 'crm.deal.won',
        title: 'Deal won',
        body: 'Big sale',
        icon: 'trending-up',
        action_url: '/crm/deals/1',
        source_app: 'crm',
        read_at: '2026-05-15T09:00:00.000Z',
        created_at: '2026-05-15T08:00:00.000Z',
    },
];

interface Recorded {
    method: string;
    path: string;
    options?: RequestOptions;
}

function recordingApi(responses: Record<string, unknown>): {
    api: ApiClient;
    calls: Recorded[];
} {
    const calls: Recorded[] = [];
    const handle = async (method: string, path: string, options?: RequestOptions) => {
        calls.push({ method, path, options });
        const key = `${method} ${path}`;
        return responses[key];
    };
    return {
        calls,
        api: {
            request: handle as never,
            get: ((path, options) => handle('GET', path, options)) as ApiClient['get'],
            post: ((path, body, options) => handle('POST', path, { ...options, body })) as ApiClient['post'],
            put: ((path, body, options) => handle('PUT', path, { ...options, body })) as ApiClient['put'],
            patch: ((path, body, options) => handle('PATCH', path, { ...options, body })) as ApiClient['patch'],
            delete: ((path, options) => handle('DELETE', path, options)) as ApiClient['delete'],
        },
    };
}

function fakeEcho(): EchoLike & {
    emit: (event: string, payload: unknown) => void;
    listened: Map<string, (payload: unknown) => void>;
    leftChannels: string[];
} {
    const listened = new Map<string, (payload: unknown) => void>();
    const leftChannels: string[] = [];
    return {
        listened,
        leftChannels,
        emit: (event, payload) => {
            const cb = listened.get(event);
            if (cb) cb(payload);
        },
        private(_channel: string) {
            return {
                listen(event, callback) {
                    listened.set(event, callback);
                },
                stopListening(event) {
                    listened.delete(event);
                },
            };
        },
        leave(channel) {
            leftChannels.push(channel);
        },
    };
}

function wrap(api: ApiClient, user: User | null = sampleUser) {
    return ({ children }: { children: ReactNode }) => (
        <AbeonProvider initialAuth={{ user }} apiClient={api}>
            {children}
        </AbeonProvider>
    );
}

describe('useNotifications', () => {
    it('fetches notifications and unread count on mount', async () => {
        const { api, calls } = recordingApi({
            'GET /api/v1/notifications': { data: sampleNotifications },
            'GET /api/v1/notifications/unread-count': { data: { unread_count: 1 } },
        });
        const { result } = renderHook(() => useNotifications(), { wrapper: wrap(api) });

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.notifications).toHaveLength(2);
        expect(result.current.unreadCount).toBe(1);
        expect(calls.map((c) => c.path)).toContain('/api/v1/notifications');
        expect(calls.map((c) => c.path)).toContain('/api/v1/notifications/unread-count');
    });

    it('falls back to client-counted unread when count endpoint fails', async () => {
        const { api } = recordingApi({
            'GET /api/v1/notifications': { data: sampleNotifications },
            // unread-count endpoint missing → rejection
        });
        const { result } = renderHook(() => useNotifications(), { wrapper: wrap(api) });
        await waitFor(() => expect(result.current.loading).toBe(false));
        // Only n1 has read_at: null
        expect(result.current.unreadCount).toBe(1);
    });

    it('reads unread_count, not the pre-ADR-0006 count field', async () => {
        // The hook read `data.count` until 2026-08-13 while ADR-0006 specified
        // `data.unread_count`. The dev stub copied the hook rather than the ADR, so
        // the two agreed with each other and disagreed with the contract — invisible
        // until a real service served the contract shape. A server answering with the
        // old field must now be treated as not having answered at all.
        const { api } = recordingApi({
            'GET /api/v1/notifications': { data: sampleNotifications },
            'GET /api/v1/notifications/unread-count': { data: { count: 99 } },
        });
        const { result } = renderHook(() => useNotifications(), { wrapper: wrap(api) });

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.unreadCount).toBe(1); // derived from the list, not 99
    });

    it('falls back to the count the list already carried when /unread-count fails', async () => {
        // The bug this replaces: `.catch(() => null)` swallowed *any* failure of the
        // count endpoint — a 401 while the token was being refreshed, a timeout, a 500 —
        // and the badge fell straight through to counting the loaded page. A page is 20
        // items newest-first, so a user whose 20 most recent are read and whose older
        // ones are not saw **zero**, with `error` still null because the failure had
        // already been caught. A silent bell, indistinguishable from nothing to show.
        //
        // The list response has carried the authoritative number in `meta.unread_count`
        // the whole time.
        const { api } = recordingApi({
            'GET /api/v1/notifications': {
                data: sampleNotifications.map((n) => ({ ...n, read_at: '2026-08-15T09:00:00Z' })),
                meta: { unread_count: 30 },
            },
            'GET /api/v1/notifications/unread-count': new Error('gateway timeout'),
        });
        const { result } = renderHook(() => useNotifications(), { wrapper: wrap(api) });

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.unreadCount).toBe(30);
    });

    it('counts the page only when nothing authoritative is available', async () => {
        // The genuine last resort — a service with no count endpoint and no meta.
        const { api } = recordingApi({
            'GET /api/v1/notifications': { data: sampleNotifications },
            'GET /api/v1/notifications/unread-count': new Error('not implemented'),
        });
        const { result } = renderHook(() => useNotifications(), { wrapper: wrap(api) });

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.unreadCount).toBe(1);
    });

    it('does nothing when user is not authenticated', async () => {
        const { api, calls } = recordingApi({});
        const { result } = renderHook(() => useNotifications(), {
            wrapper: wrap(api, null),
        });
        expect(result.current.loading).toBe(false);
        expect(calls).toHaveLength(0);
    });

    it('markAsRead PATCHes the resource and updates state optimistically', async () => {
        const { api, calls } = recordingApi({
            'GET /api/v1/notifications': { data: sampleNotifications },
            'GET /api/v1/notifications/unread-count': { data: { unread_count: 1 } },
            'PATCH /api/v1/notifications/n1/read': null,
        });
        const { result } = renderHook(() => useNotifications(), { wrapper: wrap(api) });
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.markAsRead('n1');
        });

        expect(calls.find((c) => c.method === 'PATCH')?.path).toBe(
            '/api/v1/notifications/n1/read',
        );
        const n1 = result.current.notifications.find((n) => n.id === 'n1')!;
        expect(n1.read_at).not.toBeNull();
        expect(result.current.unreadCount).toBe(0);
    });

    it('markAllAsRead POSTs and clears unread count', async () => {
        const { api, calls } = recordingApi({
            'GET /api/v1/notifications': { data: sampleNotifications },
            'GET /api/v1/notifications/unread-count': { data: { unread_count: 1 } },
            'POST /api/v1/notifications/mark-all-read': null,
        });
        const { result } = renderHook(() => useNotifications(), { wrapper: wrap(api) });
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.markAllAsRead();
        });

        expect(calls.find((c) => c.method === 'POST')?.path).toBe(
            '/api/v1/notifications/mark-all-read',
        );
        expect(result.current.notifications.every((n) => n.read_at !== null)).toBe(true);
        expect(result.current.unreadCount).toBe(0);
    });

    it('binds to Echo private channel when echo is provided and emits push updates', async () => {
        const { api } = recordingApi({
            'GET /api/v1/notifications': { data: [] },
            'GET /api/v1/notifications/unread-count': { data: { unread_count: 0 } },
        });
        const echo = fakeEcho();
        const { result } = renderHook(() => useNotifications({ echo }), {
            wrapper: wrap(api),
        });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.connected).toBe(true);

        const incoming: NotificationDto = {
            id: 'n3',
            user_id: 42,
            type: 'pm.task.assigned',
            title: 'New task',
            body: 'Task assigned',
            icon: 'check',
            action_url: '/pm/tasks/9',
            source_app: 'pm',
            read_at: null,
            created_at: '2026-05-15T11:00:00.000Z',
        };
        act(() => {
            echo.emit('NotificationCreated', incoming);
        });

        await waitFor(() => expect(result.current.notifications).toHaveLength(1));
        expect(result.current.notifications[0]?.id).toBe('n3');
        expect(result.current.unreadCount).toBe(1);
    });

    it('leaves the channel on unmount', async () => {
        const { api } = recordingApi({
            'GET /api/v1/notifications': { data: [] },
            'GET /api/v1/notifications/unread-count': { data: { unread_count: 0 } },
        });
        const echo = fakeEcho();
        const { unmount, result } = renderHook(
            () => useNotifications({ echo, autoLoad: false }),
            { wrapper: wrap(api) },
        );
        expect(result.current.connected).toBe(true);
        unmount();
        expect(echo.leftChannels).toContain('user.42');
        expect(echo.listened.size).toBe(0);
    });

    // M5: lightweight runtime validator drops payloads that lack the
    // required string fields (contract drift, garbled message, etc).
    it('ignores WS payloads missing required fields (M5)', async () => {
        const { api } = recordingApi({
            'GET /api/v1/notifications': { data: [] },
            'GET /api/v1/notifications/unread-count': { data: { unread_count: 0 } },
        });
        const echo = fakeEcho();
        const { result } = renderHook(
            () => useNotifications({ echo, autoLoad: false }),
            { wrapper: wrap(api) },
        );

        act(() => {
            echo.emit('NotificationCreated', { id: 'n1' }); // missing title/body/type
        });
        act(() => {
            echo.emit('NotificationCreated', 'a string payload');
        });
        act(() => {
            echo.emit('NotificationCreated', null);
        });
        expect(result.current.notifications).toHaveLength(0);
        expect(result.current.unreadCount).toBe(0);
    });

    // M5: unwraps the `{ notification: ... }` envelope when present.
    it('unwraps `{ notification: ... }` payload envelope', async () => {
        const { api } = recordingApi({
            'GET /api/v1/notifications': { data: [] },
            'GET /api/v1/notifications/unread-count': { data: { unread_count: 0 } },
        });
        const echo = fakeEcho();
        const { result } = renderHook(
            () => useNotifications({ echo, autoLoad: false }),
            { wrapper: wrap(api) },
        );

        const wrapped = {
            notification: {
                id: 'n42',
                user_id: 42,
                type: 'crm.deal.won',
                title: 'Wrapped',
                body: 'envelope payload',
                icon: null,
                action_url: null,
                source_app: 'crm',
                read_at: null,
                created_at: '2026-05-15T12:00:00.000Z',
            },
        };
        act(() => {
            echo.emit('NotificationCreated', wrapped);
        });
        expect(result.current.notifications).toHaveLength(1);
        expect(result.current.notifications[0]?.id).toBe('n42');
        expect(result.current.unreadCount).toBe(1);
    });
});
