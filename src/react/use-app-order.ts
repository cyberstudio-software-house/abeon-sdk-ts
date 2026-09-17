import { useCallback } from 'react';
import type { ChromePreferences, PinnedItem } from '../types/preferences.js';
import { usePreferences, type UsePreferencesOptions } from './use-preferences.js';

export interface UseAppOrderReturn {
    /** Ordered list of app names. Empty array = use AppDescriptor declaration order. */
    order: string[];
    /** Pinned sidebar items. */
    pinned: PinnedItem[];
    /** True while reading or writing preferences. */
    busy: boolean;
    setOrder: (order: string[]) => Promise<void>;
    setPinned: (pinned: PinnedItem[]) => Promise<void>;
}

/**
 * Thin convenience wrapper over `usePreferences()` for the two chrome
 * customisations that need their own setters — the sidebar drag-reorder
 * and pinned-items list. Backed by the same `chrome` namespace in the
 * preferences blob (ADR-0009).
 */
export function useAppOrder(options: UsePreferencesOptions = {}): UseAppOrderReturn {
    const { preferences, loading, saving, update } = usePreferences(options);

    const chrome: ChromePreferences = (preferences.chrome ?? {}) as ChromePreferences;
    const order = chrome.appOrder ?? [];
    const pinned = chrome.pinned ?? [];

    // Only the changed key goes out. The server and `update()` both merge `chrome` key by
    // key, and resending the whole object carried this render's copy of every other key —
    // so a pin saved while the sidebar was being collapsed put the old `sidebarCollapsed`
    // back.
    const setOrder = useCallback(
        (next: string[]) => update({ chrome: { appOrder: next } }),
        [update],
    );

    const setPinned = useCallback(
        (next: PinnedItem[]) => update({ chrome: { pinned: next } }),
        [update],
    );

    return {
        order,
        pinned,
        busy: loading || saving,
        setOrder,
        setPinned,
    };
}
