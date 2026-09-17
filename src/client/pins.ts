import type { AppDescriptor } from '../types/app-descriptor.js';
import type { PinnedItem } from '../types/preferences.js';
import { crossAppHref } from './cross-app-href.js';

/**
 * How a pin is opened. `visit` stays inside the current application (an Inertia or
 * router navigation); `assign` is a full page load into another application, the same
 * as the app switcher (architecture §3.7).
 */
export interface PinTarget {
    kind: 'visit' | 'assign';
    href: string;
}

export interface ResolvedPin extends PinnedItem {
    target: PinTarget;
}

/** The stored id of a pin: unique across applications, so `crm.settings` and `boilerplate.settings` never collide. */
export function pinId(app: string, itemId: string): string {
    return `${app}.${itemId}`;
}

/**
 * The pins this application can show, in pin order, each with where it leads.
 *
 * - A pin of the current application is always shown: the user is inside it, so the
 *   organisation has it, even while the catalogue is still loading.
 * - A pin of another application is shown only when that application is in `apps`
 *   (the organisation's catalogue from `useApps()`), assigned and reachable. It is
 *   hidden, not deleted — an application removed today may be assigned again tomorrow,
 *   and the pin should come back with it.
 * - A pin without an application predates the field and cannot be resolved; it is
 *   hidden too, and can be removed from the settings page.
 */
export function resolvePins(
    pinned: readonly PinnedItem[],
    currentApp: string | null,
    apps: readonly AppDescriptor[],
): ResolvedPin[] {
    const reachable = new Map(
        apps
            .filter((app) => app.enabled !== false && !!app.path)
            .map((app) => [app.name, app.path as string]),
    );

    return [...pinned]
        .sort((a, b) => a.order - b.order)
        .flatMap((pin): ResolvedPin[] => {
            if (!pin.app) {
                return [];
            }
            if (pin.app === currentApp) {
                return [{ ...pin, target: { kind: 'visit', href: pin.href } }];
            }
            const appPath = reachable.get(pin.app);
            if (appPath === undefined) {
                return [];
            }
            return [{ ...pin, target: { kind: 'assign', href: crossAppHref(appPath, pin.href) } }];
        });
}
