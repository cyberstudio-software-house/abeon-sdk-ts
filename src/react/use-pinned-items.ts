import { useCallback } from 'react';
import type { ChromePreferences, PinnedItem, PinnedSection } from '../types/preferences.js';
import { usePreferences, type UsePreferencesOptions } from './use-preferences.js';

export interface UsePinnedItemsReturn {
    /** Every pin of this user in this organisation, for all applications; see `resolvePins()`. */
    pinned: PinnedItem[];
    /** Stored sections, without the implicit `default`; see `resolveSections()`. */
    sections: PinnedSection[];
    /** True while reading or writing preferences. */
    busy: boolean;
    setPinned: (pinned: PinnedItem[]) => Promise<void>;
    /**
     * Save pins and sections in one request. Removing a section moves its pins, and
     * two requests would leave a moment — or, if the second failed, a state — where a
     * pin points at a section that no longer exists.
     */
    savePins: (next: { pinned?: PinnedItem[]; sections?: PinnedSection[] }) => Promise<void>;
}

/**
 * The pinned-items list and its sections in the `chrome` namespace of the preferences
 * blob (ADR-0009), with setters that send only their own keys. Named `useAppOrder` until 0.4.0, when the app order it also
 * carried was removed — nothing set it and nothing read it.
 */
export function usePinnedItems(options: UsePreferencesOptions = {}): UsePinnedItemsReturn {
    const { preferences, loading, saving, update } = usePreferences(options);

    const chrome: ChromePreferences = (preferences.chrome ?? {}) as ChromePreferences;
    const pinned = chrome.pinned ?? [];
    const sections = chrome.pinnedSections ?? [];

    // Only this key goes out. The server and `update()` both merge `chrome` key by key,
    // and resending the whole object carried this render's copy of every other key —
    // so a pin saved while the sidebar was being collapsed put the old
    // `sidebarCollapsed` back.
    const setPinned = useCallback(
        (next: PinnedItem[]) => update({ chrome: { pinned: next } }),
        [update],
    );

    const savePins = useCallback(
        (next: { pinned?: PinnedItem[]; sections?: PinnedSection[] }) =>
            update({
                chrome: {
                    ...(next.pinned !== undefined ? { pinned: next.pinned } : {}),
                    ...(next.sections !== undefined ? { pinnedSections: next.sections } : {}),
                },
            }),
        [update],
    );

    return {
        pinned,
        sections,
        busy: loading || saving,
        setPinned,
        savePins,
    };
}
