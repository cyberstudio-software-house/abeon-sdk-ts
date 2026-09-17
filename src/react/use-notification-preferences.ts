import { useCallback, useEffect, useState } from 'react';
import { AbeonError } from '../errors.js';
import type { NotificationPreference, NotificationPreferences } from '../types/notification.js';
import { useApi } from './use-api.js';
import { useAuth } from './use-auth.js';

export interface UseNotificationPreferencesOptions {
    /** Default `/api/v1/notifications/preferences`, answered by AbeonUnified. */
    path?: string;
    /** Auto-fetch on mount when a user is signed in. Default `true`. */
    autoLoad?: boolean;
}

export interface UseNotificationPreferencesReturn {
    preferences: NotificationPreference[];
    loading: boolean;
    saving: boolean;
    error: AbeonError | null;
    refresh: () => Promise<void>;
    /**
     * Replaces the whole rule set. Rejects with the server's `AbeonError`, so a form
     * can show which rule was refused.
     */
    save: (preferences: NotificationPreference[]) => Promise<void>;
}

function toAbeonError(err: unknown): AbeonError {
    return err instanceof AbeonError
        ? err
        : new AbeonError({
              type: 'about:blank',
              title: 'Notification preferences request failed',
              status: 0,
              detail: err instanceof Error ? err.message : String(err),
          });
}

function rulesOf(response: { data?: NotificationPreferences } | null | undefined): NotificationPreference[] {
    const rules = response?.data?.preferences;
    return Array.isArray(rules) ? rules : [];
}

/**
 * The signed-in user's notification delivery rules (ADR-0028). Per user and across
 * organisations, like the feed, so a tenant switch does not reload them.
 */
export function useNotificationPreferences(
    options: UseNotificationPreferencesOptions = {},
): UseNotificationPreferencesReturn {
    const api = useApi();
    const { user } = useAuth();
    const path = options.path ?? '/api/v1/notifications/preferences';
    const autoLoad = options.autoLoad ?? true;

    const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [error, setError] = useState<AbeonError | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setPreferences(rulesOf(await api.get<{ data: NotificationPreferences }>(path)));
        } catch (err) {
            setError(toAbeonError(err));
        } finally {
            setLoading(false);
        }
    }, [api, path]);

    const save = useCallback(
        async (next: NotificationPreference[]) => {
            setSaving(true);
            setError(null);
            try {
                const response = await api.put<{ data: NotificationPreferences }>(path, {
                    preferences: next,
                });
                setPreferences(rulesOf(response));
            } catch (err) {
                const abeonError = toAbeonError(err);
                setError(abeonError);
                throw abeonError;
            } finally {
                setSaving(false);
            }
        },
        [api, path],
    );

    const userId = user?.id ?? null;

    useEffect(() => {
        if (autoLoad && userId !== null) {
            void refresh();
        }
    }, [autoLoad, refresh, userId]);

    return { preferences, loading, saving, error, refresh, save };
}
