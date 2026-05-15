/**
 * Versioned user-preferences blob persisted in Auth (per ADR-0009).
 *
 * Top-level keys are namespaces — `chrome` is owned by the federated chrome.
 * Apps may add their own namespaces; unknown namespaces round-trip unchanged.
 */
export interface Preferences {
    /** Schema version. Server-owned; cannot be set by client. */
    version: 1;
    chrome?: ChromePreferences;
    /** Per-app namespaces (free-form). */
    [namespace: string]: unknown;
}

export interface ChromePreferences {
    /**
     * Ordered list of app names. Empty array = chrome falls back to
     * AppDescriptor declaration order.
     */
    appOrder?: string[];
    /** Pinned sidebar items, persisted across devices. */
    pinned?: PinnedItem[];
    theme?: ThemePreference;
    sidebarCollapsed?: boolean;
    recents?: RecentEntry[];
}

export interface PinnedItem {
    app: string;
    path: string;
    label: string;
}

export interface RecentEntry {
    id: string;
    title: string;
    /** UNIX timestamp seconds. */
    ts: number;
}

export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Defaults synthesised by the server (and replayed client-side when no row
 * exists). Mirrors `Abeon\SDK\Auth\Endpoints\PreferencesController::defaults()`.
 */
export const PREFERENCES_DEFAULTS: Preferences = {
    version: 1,
    chrome: {
        appOrder: [],
        pinned: [],
        theme: 'system',
        sidebarCollapsed: false,
        recents: [],
    },
};

export const THEME_STORAGE_KEY = 'abeon-theme';
