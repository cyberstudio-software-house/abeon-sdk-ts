import { describe, expect, it } from 'vitest';
import { pinId, resolvePins } from '../../src/client/pins.js';
import type { AppDescriptor, PinnedItem } from '../../src/index.js';

function app(name: string, overrides: Partial<AppDescriptor> = {}): AppDescriptor {
    return {
        name,
        label: name,
        path: `/${name}`,
        icon: null,
        version: null,
        permissions: [],
        category: null,
        order: null,
        mode: null,
        fullscreen: null,
        enabled: true,
        ...overrides,
    };
}

function pin(appName: string, item: string, href: string, order: number): PinnedItem {
    return { id: pinId(appName, item), app: appName, label: item, href, iconName: 'Star', sectionId: 'default', order };
}

describe('pinId', () => {
    it('namespaces the item by its application', () => {
        expect(pinId('crm', 'settings')).toBe('crm.settings');
    });
});

describe('resolvePins', () => {
    const catalogue = [app('boilerplate', { path: '/' }), app('crm')];

    it('visits a pin of the current application in place', () => {
        const [resolved] = resolvePins([pin('boilerplate', 'settings', '/settings', 0)], 'boilerplate', catalogue);

        expect(resolved?.target).toEqual({ kind: 'visit', href: '/settings' });
    });

    it('opens a pin of another application with a full load under its path', () => {
        const [resolved] = resolvePins([pin('crm', 'contacts', '/contacts', 0)], 'boilerplate', catalogue);

        expect(resolved?.target).toEqual({ kind: 'assign', href: '/crm/contacts' });
    });

    it('keeps an href that already carries the application path', () => {
        const [resolved] = resolvePins([pin('crm', 'contacts', '/crm/contacts', 0)], 'boilerplate', catalogue);

        expect(resolved?.target.href).toBe('/crm/contacts');
    });

    it('hides pins of applications the organisation does not have or cannot open', () => {
        const resolved = resolvePins(
            [pin('finance', 'invoices', '/invoices', 0), pin('cms', 'pages', '/pages', 1)],
            'boilerplate',
            [...catalogue, app('cms', { enabled: false })],
        );

        expect(resolved).toEqual([]);
    });

    it('shows pins of the current application before the catalogue has loaded', () => {
        const resolved = resolvePins([pin('boilerplate', 'home', '/', 0), pin('crm', 'contacts', '/contacts', 1)], 'boilerplate', []);

        expect(resolved.map((p) => p.id)).toEqual(['boilerplate.home']);
    });

    it('hides a pin stored before pins named their application', () => {
        const legacy = { id: 'settings', label: 'Settings', href: '/settings', iconName: 'Star', sectionId: 'default', order: 0 } as PinnedItem;

        expect(resolvePins([legacy], 'boilerplate', catalogue)).toEqual([]);
    });

    it('returns pins in their stored order', () => {
        const resolved = resolvePins(
            [pin('crm', 'contacts', '/contacts', 1), pin('boilerplate', 'home', '/', 0)],
            'boilerplate',
            catalogue,
        );

        expect(resolved.map((p) => p.id)).toEqual(['boilerplate.home', 'crm.contacts']);
    });
});
