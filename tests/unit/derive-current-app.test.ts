import { describe, expect, it } from 'vitest';
import { deriveCurrentApp } from '../../src/react/current-app.js';

const apps = [
    { name: 'crm', path: '/crm' },
    { name: 'cms', path: '/cms' },
    { name: 'finance', path: '/finance' },
    { name: 'finance-archive', path: '/finance/archive' },
    { name: 'rootless', path: null },
];

describe('deriveCurrentApp', () => {
    it('matches exact prefix', () => {
        expect(deriveCurrentApp('/crm', apps)).toBe('crm');
    });

    it('matches descendant path', () => {
        expect(deriveCurrentApp('/crm/contacts/42', apps)).toBe('crm');
    });

    it('returns null when no prefix matches', () => {
        expect(deriveCurrentApp('/unknown/whatever', apps)).toBeNull();
    });

    it('returns null for an empty path against rootless apps', () => {
        expect(deriveCurrentApp('/', apps)).toBeNull();
    });

    it('prefers longest prefix when multiple match', () => {
        expect(deriveCurrentApp('/finance/archive/2026', apps)).toBe('finance-archive');
        expect(deriveCurrentApp('/finance/invoices', apps)).toBe('finance');
    });

    it('skips apps without a path', () => {
        expect(deriveCurrentApp('/anything', apps)).toBeNull();
    });

    it('does not match prefix without separator', () => {
        // `/crmx/foo` should NOT match the `/crm` app
        expect(deriveCurrentApp('/crmx/foo', apps)).toBeNull();
    });
});
