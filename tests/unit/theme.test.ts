import { describe, expect, it } from 'vitest';
import { ABEON_THEME_DEFAULTS, THEME_STORAGE_KEY } from '../../src/react/theme.js';

describe('theme constants', () => {
    it('exports a stable storage key', () => {
        expect(THEME_STORAGE_KEY).toBe('abeon-theme');
    });

    it('uses storage key in ABEON_THEME_DEFAULTS', () => {
        expect(ABEON_THEME_DEFAULTS.storageKey).toBe(THEME_STORAGE_KEY);
    });

    it('defaults to system theme with system enabled', () => {
        expect(ABEON_THEME_DEFAULTS.defaultTheme).toBe('system');
        expect(ABEON_THEME_DEFAULTS.enableSystem).toBe(true);
    });

    it('uses class attribute for theme application', () => {
        expect(ABEON_THEME_DEFAULTS.attribute).toBe('class');
    });

    it('disables transition on theme change to avoid hydration flash', () => {
        expect(ABEON_THEME_DEFAULTS.disableTransitionOnChange).toBe(true);
    });
});
