import { useCallback } from 'react';
import type { ChromePreferences, PinnedItem } from '../types/preferences.js';
import { usePreferences, type UsePreferencesOptions } from './use-preferences.js';

export interface UsePinnedItemsReturn {
    /** Every pin of this user in this organisation, for all applications; see `resolvePins()`. */
    pinned: PinnedItem[];
    /** True while reading or writing preferences. */
    busy: boolean;
    setPinned: (pinned: PinnedItem[]) => Promise<void>;
}

/**
 * The pinned-items list in the `chrome` namespace of the preferences blob (ADR-0009),
 * with its own setter. Named `useAppOrder` until 0.4.0, when the app order it also
 * carried was removed — nothing set it and nothing read it.
 */
export function usePinnedItems(options: UsePreferencesOptions = {}): UsePinnedItemsReturn {
    const { preferences, loading, saving, update } = usePreferences(options);

    const chrome: ChromePreferences = (preferences.chrome ?? {}) as ChromePreferences;
    const pinned = chrome.pinned ?? [];

    // Only this key goes out. The server and `update()` both merge `chrome` key by key,
    // and resending the whole object carried this render's copy of every other key —
    // so a pin saved while the sidebar was being collapsed put the old
    // `sidebarCollapsed` back.
    const setPinned = useCallback(
        (next: PinnedItem[]) => update({ chrome: { pinned: next } }),
        [update],
    );

    return {
        pinned,
        busy: loading || saving,
        setPinned,
    };
}
