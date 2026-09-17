import { describe, expect, it, vi } from 'vitest';
import { buildAppCommands, buildPinnedCommands } from '../../src/react/app-commands.js';
import type { AppDescriptor, PinnedItem } from '../../src/index.js';

function app(overrides: Partial<AppDescriptor>): AppDescriptor {
    return {
        name: 'crm',
        label: 'CRM',
        path: 'https://crm.abeon.test/',
        icon: 'users',
        version: null,
        permissions: [],
        category: 'Sprzedaż',
        order: null,
        mode: null,
        fullscreen: null,
        enabled: true,
        ...overrides,
    };
}

const pins: PinnedItem[] = [
    { id: 'reports', app: 'boilerplate', label: 'Reports', href: '/reports', iconName: 'ChartBar', sectionId: 'default', order: 1 },
    { id: 'home', app: 'boilerplate', label: 'Home', href: '/', iconName: 'Check', sectionId: 'default', order: 0 },
];

describe('buildPinnedCommands', () => {
    it('maps pins to prefixed commands in pin order', () => {
        const commands = buildPinnedCommands(pins, vi.fn());

        expect(commands.map((c) => c.id)).toEqual(['pin.home', 'pin.reports']);
        expect(commands[0]?.group).toBe('Przypięte');
        expect(commands[0]?.icon).toBe('Check');
        expect(commands[0]?.title).toBe('Home');
    });

    it('closes the palette and navigates to the pinned href', () => {
        const navigate = vi.fn();
        const close = vi.fn();

        buildPinnedCommands(pins, navigate)[1]?.run?.({ close });

        expect(close).toHaveBeenCalledOnce();
        expect(navigate).toHaveBeenCalledWith('/reports', expect.objectContaining({ id: 'reports' }));
    });

    it('honors a custom group label', () => {
        expect(buildPinnedCommands(pins, vi.fn(), { group: 'Pinned' })[0]?.group).toBe('Pinned');
    });
});

describe('buildAppCommands', () => {
    it('maps apps to prefixed commands with label, icon and keywords', () => {
        const [crm] = buildAppCommands([app({})], vi.fn());

        expect(crm?.id).toBe('app.crm');
        expect(crm?.title).toBe('CRM');
        expect(crm?.group).toBe('Aplikacje');
        expect(crm?.icon).toBe('users');
        expect(crm?.keywords).toEqual(['crm', 'Sprzedaż']);
    });

    it('falls back to the app name when there is no label', () => {
        expect(buildAppCommands([app({ label: null })], vi.fn())[0]?.title).toBe('crm');
    });

    it('leaves out apps not assigned to the organisation and apps without a path', () => {
        const commands = buildAppCommands(
            [app({ name: 'off', enabled: false }), app({ name: 'nopath', path: null }), app({ name: 'unknown', enabled: null })],
            vi.fn(),
        );

        expect(commands.map((c) => c.id)).toEqual(['app.unknown']);
    });

    it('closes the palette and opens the app path', () => {
        const open = vi.fn();
        const close = vi.fn();

        buildAppCommands([app({})], open)[0]?.run?.({ close });

        expect(close).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledWith('https://crm.abeon.test/');
    });
});
