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
    /** Pinned sidebar items, persisted across devices. */
    pinned?: PinnedItem[];
    /**
     * Named sections of the pinned list. `default` exists without an entry; an entry
     * with that id only renames it. See `resolveSections()`.
     */
    pinnedSections?: PinnedSection[];
    theme?: ThemePreference;
    sidebarCollapsed?: boolean;
    recents?: RecentEntry[];
}

/**
 * A pinned sidebar item, owned by the federated chrome and persisted in the
 * `chrome.pinned` namespace. Shape matches what `@abeon/ui`'s
 * `SidebarPinnedSection` renders and `PinItemDialog` produces, so chrome
 * components consume it without translation. `isActive` is a render-time flag
 * computed per-page (not persisted).
 */
export interface PinnedItem {
    /** Unique across applications: `{app}.{item}`, see `pinId()`. */
    id: string;
    /**
     * AppDescriptor name of the application the item belongs to. Pins are stored once
     * per user per organisation and rendered by every application, so without this a
     * pin to `/settings` would open whichever application is showing the sidebar.
     */
    app: string;
    label: string;
    /**
     * The path as the owning application links to it. Another application opens it
     * through `crossAppHref(descriptor.path, href)`; see `resolvePins()`.
     */
    href: string;
    iconName: string;
    /** The section the pin is shown in; `default` unless the user chose another. */
    sectionId: string;
    /** Position within its section. */
    order: number;
    isActive?: boolean;
}

/** A named section of the pinned list. */
export interface PinnedSection {
    id: string;
    label: string;
    order: number;
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
        pinned: [],
        pinnedSections: [],
        theme: 'system',
        sidebarCollapsed: false,
        recents: [],
    },
};

export const THEME_STORAGE_KEY = 'abeon-theme';
