import type { Command } from './command-registry.js';
import type { AppDescriptor } from '../types/app-descriptor.js';
import type { PinnedItem } from '../types/preferences.js';

export interface BuildPinnedCommandsOptions {
    /** Palette grouping label. Default `"Przypięte"`. */
    group?: string;
}

export interface BuildAppCommandsOptions {
    /** Palette grouping label. Default `"Aplikacje"`. */
    group?: string;
}

/**
 * Maps the user's pinned items (`preferences.chrome.pinned`) to palette commands,
 * in pin order. Ids are prefixed with `pin.` because the registry deduplicates by
 * id and a pin may point at the same destination as a nav entry.
 */
export function buildPinnedCommands(
    pinned: readonly PinnedItem[],
    navigate: (href: string) => void,
    options: BuildPinnedCommandsOptions = {},
): Command[] {
    const group = options.group ?? 'Przypięte';

    return [...pinned]
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
            id: `pin.${item.id}`,
            title: item.label,
            group,
            icon: item.iconName || null,
            keywords: [item.href],
            run: (ctx) => {
                ctx.close();
                navigate(item.href);
            },
        }));
}

/**
 * Maps the applications from `useApps()` to palette commands. Applications that
 * are not assigned to the organisation or have no entry path are left out, since
 * selecting them could only fail. `open` is supplied by the caller: another
 * application is usually a full page load, not an in-app visit.
 */
export function buildAppCommands(
    apps: readonly AppDescriptor[],
    open: (path: string) => void,
    options: BuildAppCommandsOptions = {},
): Command[] {
    const group = options.group ?? 'Aplikacje';

    return apps
        .filter((app): app is AppDescriptor & { path: string } => app.enabled !== false && !!app.path)
        .map((app) => ({
            id: `app.${app.name}`,
            title: app.label ?? app.name,
            group,
            icon: app.icon,
            keywords: [app.name, ...(app.category ? [app.category] : [])],
            run: (ctx) => {
                ctx.close();
                open(app.path);
            },
        }));
}
