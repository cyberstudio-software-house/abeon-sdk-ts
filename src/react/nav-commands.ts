import { useMemo } from 'react';
import { useRegisterCommands, type Command } from './command-registry.js';

/**
 * Minimal nav entry shape consumed by {@link buildNavCommands}. Deliberately
 * structural (not `@abeon/ui`'s `NavGroup`) so `@abeon/shared` keeps no
 * dependency on the UI package — callers map their own nav config to this.
 */
export interface NavCommandItem {
    /** Stable id, app-scoped (e.g. `"home"`, `"settings"`). */
    id: string;
    /** Display title shown in the palette. */
    label: string;
    /** Target route. */
    href: string;
    /** Icon name (Lucide) or URL. */
    icon?: string | null;
}

export interface BuildNavCommandsOptions {
    /** Palette grouping label. Default `"Nawigacja"`. */
    group?: string;
}

/**
 * Maps nav entries into command-palette commands that navigate on selection.
 * `navigate` is supplied by the caller (e.g. Inertia's `router.visit`) so this
 * stays framework-neutral.
 */
export function buildNavCommands(
    items: NavCommandItem[],
    navigate: (href: string) => void,
    options: BuildNavCommandsOptions = {},
): Command[] {
    const group = options.group ?? 'Nawigacja';

    return items.map((item) => ({
        id: `nav.${item.id}`,
        title: item.label,
        group,
        icon: item.icon ?? null,
        keywords: [item.href],
        run: (ctx) => {
            ctx.close();
            navigate(item.href);
        },
    }));
}

/**
 * Registers navigation commands derived from `items` with the palette (G7).
 * Seed it once in the chrome layout so every page's Cmd+K can jump to any
 * nav destination. Memoised internally to avoid the re-register loop.
 */
export function useRegisterNavCommands(
    items: NavCommandItem[],
    navigate: (href: string) => void,
    options: BuildNavCommandsOptions = {},
): void {
    const group = options.group;
    const commands = useMemo(
        () => buildNavCommands(items, navigate, { group }),
        [items, navigate, group],
    );

    useRegisterCommands(commands);
}
