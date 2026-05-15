/**
 * Theme primitives — type + constants only. The actual provider lives in
 * `@abeon/ui` because `next-themes` is its dependency, not ours. Sharing
 * the storage key + canonical type here means both packages agree on the
 * persistence model.
 */

import { THEME_STORAGE_KEY } from '../types/preferences.js';
export type { ThemePreference } from '../types/preferences.js';
export { THEME_STORAGE_KEY } from '../types/preferences.js';

/**
 * Recommended `next-themes` configuration for chrome consumers. Pass into
 * `<ThemeProvider {...ABEON_THEME_DEFAULTS}>` from `@abeon/ui`. Kept here
 * so the constants live next to the preferences shape that mirrors them.
 */
export const ABEON_THEME_DEFAULTS = {
    storageKey: THEME_STORAGE_KEY,
    defaultTheme: 'system' as const,
    enableSystem: true,
    attribute: 'class' as const,
    /** Avoid hydration flash by disabling transitions during theme swap. */
    disableTransitionOnChange: true,
};
