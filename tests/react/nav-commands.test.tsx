// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
    CommandRegistryProvider,
    useCommandRegistry,
} from '../../src/react/command-registry.js';
import {
    buildNavCommands,
    useRegisterNavCommands,
    type NavCommandItem,
} from '../../src/react/nav-commands.js';

const items: NavCommandItem[] = [
    { id: 'home', label: 'Home', href: '/', icon: 'Home' },
    { id: 'settings', label: 'Settings', href: '/settings' },
];

function wrap({ children }: { children: ReactNode }) {
    return <CommandRegistryProvider>{children}</CommandRegistryProvider>;
}

describe('buildNavCommands', () => {
    it('maps nav items to namespaced commands', () => {
        const navigate = vi.fn();
        const commands = buildNavCommands(items, navigate);

        expect(commands.map((c) => c.id)).toEqual(['nav.home', 'nav.settings']);
        expect(commands[0]?.group).toBe('Nawigacja');
        expect(commands[0]?.icon).toBe('Home');
        expect(commands[1]?.icon).toBeNull();
    });

    it('navigates and closes the palette on run', () => {
        const navigate = vi.fn();
        const close = vi.fn();
        const [home] = buildNavCommands(items, navigate);

        home?.run?.({ close });

        expect(close).toHaveBeenCalledOnce();
        expect(navigate).toHaveBeenCalledWith('/');
    });

    it('honors a custom group label', () => {
        const commands = buildNavCommands(items, vi.fn(), { group: 'Go to' });
        expect(commands[0]?.group).toBe('Go to');
    });
});

describe('useRegisterNavCommands', () => {
    it('registers nav commands with the palette', async () => {
        const navigate = vi.fn();
        const { result } = renderHook(
            () => {
                useRegisterNavCommands(items, navigate);
                return useCommandRegistry();
            },
            { wrapper: wrap },
        );

        await waitFor(() => expect(result.current.commands).toHaveLength(2));
        expect(result.current.commands.map((c) => c.id)).toEqual([
            'nav.home',
            'nav.settings',
        ]);
    });
});
