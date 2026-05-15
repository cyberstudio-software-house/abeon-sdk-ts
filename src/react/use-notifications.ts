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
    const notificationsRef = useRef<NotificationDto[]>([]);
    notificationsRef.current = notifications;

    const refresh = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const [listResponse, countResponse] = await Promise.all([
                api.get<{ data: NotificationDto[] }>(fetchPath),
                api.get<{ data: { count: number } }>(unreadCountPath).catch(() => null),
            ]);
            setNotifications(Array.isArray(listResponse?.data) ? listResponse.data : []);
            if (countResponse && typeof countResponse.data?.count === 'number') {
                setUnreadCount(countResponse.data.count);
            } else {
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
            const notification = (payload as { notification?: NotificationDto } | NotificationDto)
                ?.constructor === Object
                ? ((payload as { notification?: NotificationDto }).notification ??
                  (payload as NotificationDto))
                : (payload as NotificationDto);

            if (notification && typeof notification === 'object' && 'id' in notification) {
                setNotifications((prev) => [notification as NotificationDto, ...prev]);
                if ((notification as NotificationDto).read_at === null) {
                    setUnreadCount((c) => c + 1);
                }
            }
        });
        setConnected(true);

        return () => {
            channel.stopListening(eventName);
            echo.leave(channelName);
            setConnected(false);
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
