import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationDto } from '../types/notification.js';
import { AbeonError } from '../errors.js';
import { useApi } from './use-api.js';
import { useAuth } from './use-auth.js';

/**
 * Minimal Echo-like interface that `useNotifications` consumes. The actual
 * `Echo` from `laravel-echo` matches this structurally — we keep the type
 * loose so tests can inject a fake without depending on Echo internals.
 */
export interface EchoLike {
    private(channel: string): {
        listen(event: string, callback: (payload: unknown) => void): void;
        stopListening(event: string): void;
    };
    leave(channel: string): void;
    disconnect?(): void;
}

export interface UseNotificationsOptions {
    /**
     * Pre-built Echo instance (typically created once via `createEcho()`
     * and shared via context or module singleton). When omitted, hook
     * only fetches initial state — no live updates.
     */
    echo?: EchoLike;
    /**
     * Initial fetch path. Default `/api/v1/notifications`.
     */
    fetchPath?: string;
    /**
     * Unread-count fetch path. Default `/api/v1/notifications/unread-count`.
     */
    unreadCountPath?: string;
    /**
     * Channel name pattern — `private-` prefix is added by Echo itself.
     * Default: `user.${user.id}` (per arch doc 5A.5).
     */
    channelName?: string;
    /**
     * Event name on the private channel. Default `NotificationCreated`
     * (matches Laravel broadcasting convention).
     */
    eventName?: string;
    /** Auto-fetch on mount. Default `true`. */
    autoLoad?: boolean;
}

export interface UseNotificationsReturn {
    notifications: NotificationDto[];
    unreadCount: number;
    loading: boolean;
    error: AbeonError | null;
    /** True while WebSocket is bound to the user channel. */
    connected: boolean;
    refresh: () => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
}

/**
 * Notifications for the Topbar bell — combines:
 *   1. Initial fetch of recent notifications + unread count from REST.
 *   2. Live updates via Echo private channel `user.{id}` (when an Echo
 *      instance is provided).
 *   3. Optimistic mark-as-read REST mutations.
 *
 * Channel binding is set up in useEffect with proper cleanup on unmount
 * (channel.stopListening + echo.leave). No-op when user is not authenticated.
 */
export function useNotifications(
    options: UseNotificationsOptions = {},
): UseNotificationsReturn {
    const api = useApi();
    const { user } = useAuth();

    const fetchPath = options.fetchPath ?? '/api/v1/notifications';
    const unreadCountPath = options.unreadCountPath ?? '/api/v1/notifications/unread-count';
    const eventName = options.eventName ?? 'NotificationCreated';
    const autoLoad = options.autoLoad ?? true;
    const channelName = options.channelName ?? (user ? `user.${user.id}` : null);

    const [notifications, setNotifications] = useState<NotificationDto[]>([]);
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<AbeonError | null>(null);
    const [connected, setConnected] = useState<boolean>(false);

    // Keep stable refs to break the dep cycle between callbacks and state.
    // H7: write the ref inside an effect, not during render — render-phase
    // side effects break Concurrent React (strict mode double-render, Suspense).
    const notificationsRef = useRef<NotificationDto[]>([]);
    useEffect(() => {
        notificationsRef.current = notifications;
    }, [notifications]);

    const refresh = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const [listResponse, countResponse] = await Promise.all([
                api.get<{ data: NotificationDto[] }>(fetchPath),
                api.get<{ data: { unread_count: number } }>(unreadCountPath).catch(() => null),
            ]);
            setNotifications(Array.isArray(listResponse?.data) ? listResponse.data : []);
            // ADR-0006 names this field `unread_count`. It was read as `count` here
            // until 2026-08-13, and the dev stub copied the hook rather than the ADR,
            // so nothing disagreed until a real service served the contract shape.
            if (countResponse && typeof countResponse.data?.unread_count === 'number') {
                setUnreadCount(countResponse.data.unread_count);
            } else {
                // The fallback counts the first page only, so it is a degraded answer,
                // not an equivalent one — it exists for a missing endpoint, not for a
                // renamed field.
                const unread = (Array.isArray(listResponse?.data) ? listResponse.data : []).filter(
                    (n) => n.read_at === null,
                ).length;
                setUnreadCount(unread);
            }
        } catch (err) {
            setError(
                err instanceof AbeonError
                    ? err
                    : new AbeonError({
                          type: 'about:blank',
                          title: 'Notifications fetch failed',
                          status: 0,
                          detail: err instanceof Error ? err.message : String(err),
                      }),
            );
        } finally {
            setLoading(false);
        }
    }, [api, fetchPath, unreadCountPath, user]);

    const markAsRead = useCallback(
        async (id: string) => {
            await api.patch(`${fetchPath}/${encodeURIComponent(id)}/read`);
            setNotifications((prev) =>
                prev.map((n) => (n.id === id && n.read_at === null
                    ? { ...n, read_at: new Date().toISOString() }
                    : n)),
            );
            setUnreadCount((c) => Math.max(0, c - 1));
        },
        [api, fetchPath],
    );

    const markAllAsRead = useCallback(async () => {
        await api.post(`${fetchPath}/mark-all-read`);
        const now = new Date().toISOString();
        setNotifications((prev) =>
            prev.map((n) => (n.read_at === null ? { ...n, read_at: now } : n)),
        );
        setUnreadCount(0);
    }, [api, fetchPath]);

    // Initial load.
    useEffect(() => {
        if (autoLoad && user) {
            void refresh();
        }
    }, [autoLoad, refresh, user]);

    // WebSocket binding.
    useEffect(() => {
        const echo = options.echo;
        if (!echo || !channelName) {
            setConnected(false);
            return;
        }

        const channel = echo.private(channelName);
        channel.listen(eventName, (payload) => {
            // M5: validate WS payload shape at runtime. Reverb delivers
            // whatever the backend broadcasts — a contract drift on the PHP
            // side would otherwise corrupt React state silently. The check
            // is lightweight (~5 fields), not a full JSON Schema validation.
            const notification = extractNotification(payload);
            if (!notification) return;

            setNotifications((prev) => [notification, ...prev]);
            if (notification.read_at === null) {
                setUnreadCount((c) => c + 1);
            }
        });
        setConnected(true);

        return () => {
            // M10: stopListening / leave can throw if Echo state is mid-tear-down
            // (e.g. unmount during a network blip). Always clear `connected`
            // and at least attempt `leave` so we don't leak channel subscriptions.
            try {
                channel.stopListening(eventName);
            } finally {
                try {
                    echo.leave(channelName);
                } finally {
                    setConnected(false);
                }
            }
        };
    }, [options.echo, channelName, eventName]);

    return {
        notifications,
        unreadCount,
        loading,
        error,
        connected,
        refresh,
        markAsRead,
        markAllAsRead,
    };
}

/**
 * M5: lightweight runtime validator for WS notification payloads. Laravel
 * Reverb may deliver the NotificationDto directly or wrapped as
 * `{ notification: NotificationDto }` (depending on broadcast format).
 * Returns null when the payload doesn't carry a usable shape — handler
 * skips instead of corrupting state.
 */
function extractNotification(payload: unknown): NotificationDto | null {
    if (payload === null || typeof payload !== 'object') return null;
    const wrapped = (payload as { notification?: unknown }).notification;
    const candidate = wrapped && typeof wrapped === 'object' ? wrapped : payload;

    if (
        candidate === null ||
        typeof candidate !== 'object' ||
        typeof (candidate as { id?: unknown }).id !== 'string' ||
        typeof (candidate as { title?: unknown }).title !== 'string' ||
        typeof (candidate as { body?: unknown }).body !== 'string' ||
        typeof (candidate as { type?: unknown }).type !== 'string'
    ) {
        return null;
    }
    return candidate as NotificationDto;
}
