import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SECTION_ID,
    addPin,
    addSection,
    arrangePins,
    pinId,
    removePin,
    removeSection,
    renameSection,
    resolvePins,
    resolveSections,
    toSidebarPins,
} from '../../src/client/pins.js';
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

describe('pins in sections', () => {
    const stored = (id: string, sectionId: string, order: number, appName = 'boilerplate'): PinnedItem => ({
        id: pinId(appName, id), app: appName, label: id, href: `/${id}`, iconName: 'Star', sectionId, order,
    });

    it('adds a pin at the end of the section it was pinned to', () => {
        const pinned = [stored('a', 'default', 0), stored('b', 'sales', 0)];

        const next = addPin(pinned, { id: 'c', label: 'c', href: '/c', iconName: 'Star', sectionId: 'sales' }, 'boilerplate');

        expect(next.at(-1)).toMatchObject({ id: 'boilerplate.c', sectionId: 'sales', order: 1 });
    });

    it('puts a pin without a section into default', () => {
        const [pin] = addPin([], { id: 'a', label: 'a', href: '/a', iconName: 'Star' }, 'boilerplate');
        expect(pin?.sectionId).toBe(DEFAULT_SECTION_ID);
    });

    it('closes up only the section a pin was removed from', () => {
        const next = removePin([stored('a', 'default', 0), stored('b', 'default', 1), stored('c', 'sales', 0)], 'boilerplate.a');

        expect(next.map((p) => [p.id, p.sectionId, p.order])).toEqual([
            ['boilerplate.b', 'default', 0],
            ['boilerplate.c', 'sales', 0],
        ]);
    });

    it('moves a dragged pin into another section and renumbers both', () => {
        const pinned = [stored('a', 'default', 0), stored('b', 'default', 1), stored('c', 'sales', 0)];

        const next = arrangePins(pinned, [
            { id: 'boilerplate.a', sectionId: 'default' },
            { id: 'boilerplate.c', sectionId: 'sales' },
            { id: 'boilerplate.b', sectionId: 'sales' },
        ]);

        expect(next.map((p) => [p.id, p.sectionId, p.order])).toEqual([
            ['boilerplate.a', 'default', 0],
            ['boilerplate.c', 'sales', 0],
            ['boilerplate.b', 'sales', 1],
        ]);
    });

    it('keeps hidden pins in their section after the visible ones, with their stored href', () => {
        const hidden = stored('invoices', 'sales', 0, 'finance');
        const pinned = [hidden, stored('a', 'sales', 1)];

        const next = arrangePins(pinned, [{ id: 'boilerplate.a', sectionId: 'sales' }]);

        expect(next.map((p) => [p.id, p.order, p.href])).toEqual([
            ['boilerplate.a', 0, '/a'],
            ['finance.invoices', 1, '/invoices'],
        ]);
    });
});

describe('sections', () => {
    it('always shows default first, under the given label unless renamed', () => {
        expect(resolveSections(undefined, 'Przypięte')).toEqual([{ id: 'default', label: 'Przypięte', order: 0 }]);
        expect(
            resolveSections(
                [
                    { id: 'sales', label: 'Sprzedaż', order: 2 },
                    { id: 'default', label: 'Moje', order: 5 },
                    { id: 'ops', label: 'Operacje', order: 1 },
                ],
                'Przypięte',
            ),
        ).toEqual([
            { id: 'default', label: 'Moje', order: 0 },
            { id: 'ops', label: 'Operacje', order: 1 },
            { id: 'sales', label: 'Sprzedaż', order: 2 },
        ]);
    });

    it('adds a trimmed section at the end and ignores a blank name', () => {
        const next = addSection([{ id: 'ops', label: 'Operacje', order: 1 }], '  Sprzedaż ', 'sales');

        expect(next.at(-1)).toEqual({ id: 'sales', label: 'Sprzedaż', order: 2 });
        expect(addSection(next, '   ', 'x')).toEqual(next);
    });

    it('gives a new section a unique id when none is supplied', () => {
        const [a] = addSection([], 'A');
        const [b] = addSection([], 'B');
        expect(a?.id).toMatch(/^section-/);
        expect(a?.id).not.toBe(b?.id);
    });

    it('renames default by storing an entry for it', () => {
        expect(renameSection([], 'default', 'Skróty')).toEqual([{ id: 'default', label: 'Skróty', order: 0 }]);
        expect(renameSection([{ id: 'ops', label: 'Operacje', order: 1 }], 'ops', ' ')).toEqual([
            { id: 'ops', label: 'Operacje', order: 1 },
        ]);
    });

    it('moves the pins of a removed section to the end of default in the same change', () => {
        const sections = [
            { id: 'ops', label: 'Operacje', order: 1 },
            { id: 'sales', label: 'Sprzedaż', order: 2 },
        ];
        const pinned: PinnedItem[] = [
            pin('boilerplate', 'home', '/', 0),
            { ...pin('boilerplate', 'a', '/a', 0), sectionId: 'ops' },
            { ...pin('boilerplate', 'b', '/b', 1), sectionId: 'ops' },
        ];

        const next = removeSection(sections, pinned, 'ops');

        expect(next.sections).toEqual([{ id: 'sales', label: 'Sprzedaż', order: 1 }]);
        expect(next.pinned.map((p) => [p.id, p.sectionId, p.order])).toEqual([
            ['boilerplate.home', 'default', 0],
            ['boilerplate.a', 'default', 1],
            ['boilerplate.b', 'default', 2],
        ]);
    });

    it('never removes default', () => {
        const pinned = [pin('boilerplate', 'home', '/', 0)];
        expect(removeSection([], pinned, 'default')).toEqual({ sections: [], pinned });
    });
});

describe('toSidebarPins', () => {
    it('uses the resolved href, marks only in-app pins active and adds the caption given', () => {
        const resolved = resolvePins(
            [pin('boilerplate', 'settings', '/settings', 0), pin('crm', 'contacts', '/contacts', 1)],
            'boilerplate',
            [app('crm')],
        );

        const pins = toSidebarPins(resolved, () => true, (p) => (p.app === 'crm' ? 'CRM' : null));

        expect(pins.map((p) => [p.href, p.isActive, p.caption])).toEqual([
            ['/settings', true, null],
            ['/crm/contacts', false, 'CRM'],
        ]);
    });
});
