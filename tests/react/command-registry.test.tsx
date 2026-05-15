// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMemo, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import {
    CommandRegistryProvider,
    useCommandRegistry,
    useRegisterCommands,
    type Command,
} from '../../src/react/command-registry.js';

function wrap({ children }: { children: ReactNode }) {
    return <CommandRegistryProvider>{children}</CommandRegistryProvider>;
}

describe('CommandRegistryProvider', () => {
    it('throws when useRegisterCommands is called outside provider', () => {
        expect(() =>
            renderHook(() => useRegisterCommands([{ id: 'x', title: 'X' }])),
        ).toThrow(/CommandRegistryProvider/);
    });

    it('throws when useCommandRegistry is called outside provider', () => {
        expect(() => renderHook(() => useCommandRegistry())).toThrow(
            /CommandRegistryProvider/,
        );
    });

    it('exposes registered commands', async () => {
        const { result } = renderHook(
            () => {
                const cmds = useMemo<Command[]>(
                    () => [{ id: 'crm.contacts', title: 'Contacts', group: 'Nav' }],
                    [],
                );
                useRegisterCommands(cmds);
                return useCommandRegistry();
            },
            { wrapper: wrap },
        );

        await waitFor(() => expect(result.current.commands).toHaveLength(1));
        expect(result.current.commands[0]?.id).toBe('crm.contacts');
    });

    it('dedupes commands by id across registrations', async () => {
        const { result } = renderHook(
            () => {
                const a = useMemo<Command[]>(
                    () => [{ id: 'shared.id', title: 'A' }],
                    [],
                );
                const b = useMemo<Command[]>(
                    () => [{ id: 'shared.id', title: 'B' }, { id: 'other', title: 'O' }],
                    [],
                );
                useRegisterCommands(a);
                useRegisterCommands(b);
                return useCommandRegistry();
            },
            { wrapper: wrap },
        );

        await waitFor(() => expect(result.current.commands).toHaveLength(2));

        const ids = result.current.commands.map((c) => c.id);
        expect(ids).toContain('shared.id');
        expect(ids).toContain('other');
        // dedup: one row per id total
        expect(ids.filter((id) => id === 'shared.id')).toHaveLength(1);
    });

    it('unregisters on unmount', async () => {
        const { result, unmount } = renderHook(
            () => {
                const cmds = useMemo<Command[]>(
                    () => [{ id: 'goodbye', title: 'Bye' }],
                    [],
                );
                useRegisterCommands(cmds);
                return useCommandRegistry();
            },
            { wrapper: wrap },
        );

        await waitFor(() =>
            expect(result.current.commands.map((c) => c.id)).toContain('goodbye'),
        );

        act(() => {
            unmount();
        });

        // Fresh registry instance — another consumer mounted in a separate tree
        // sees an empty registry.
        const { result: result2 } = renderHook(() => useCommandRegistry(), {
            wrapper: wrap,
        });
        expect(result2.current.commands).toEqual([]);
    });

    it('skips registering empty arrays', () => {
        const { result } = renderHook(
            () => {
                useRegisterCommands([]);
                return useCommandRegistry();
            },
            { wrapper: wrap },
        );

        expect(result.current.commands).toEqual([]);
    });
});
