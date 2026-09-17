import type { AppDescriptor } from '../types/app-descriptor.js';
import type { PinnedItem, PinnedSection } from '../types/preferences.js';
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

/** The section every pin belongs to unless the user chose another. It needs no stored entry. */
export const DEFAULT_SECTION_ID = 'default';

/** What a pin dialog produces for one navigation item of the current application. */
export interface PinPayload {
    /** The item's id within its application; stored as `pinId(app, id)`. */
    id: string;
    label: string;
    href: string;
    iconName: string;
    sectionId?: string;
}

/** A resolved pin as a sidebar renders it: `href` is where it leads from here. */
export interface SidebarPin extends ResolvedPin {
    caption?: string | null;
}

/** Whether `app`'s navigation item `itemId` is pinned. */
export function isPinnedIn(pinned: readonly PinnedItem[], app: string, itemId: string): boolean {
    const id = pinId(app, itemId);
    return pinned.some((p) => p.id === id);
}

/** Append a pin for `app` at the end of its section; a no-op when that item is already pinned. */
export function addPin(pinned: readonly PinnedItem[], payload: PinPayload, app: string): PinnedItem[] {
    const id = pinId(app, payload.id);
    if (pinned.some((p) => p.id === id)) {
        return pinned as PinnedItem[];
    }
    const sectionId = payload.sectionId ?? DEFAULT_SECTION_ID;
    const order = pinned.filter((p) => p.sectionId === sectionId).length;

    return [
        ...pinned,
        { id, app, label: payload.label, href: payload.href, iconName: payload.iconName, sectionId, order },
    ];
}

/** Remove a pin by its stored id; the rest of its section closes up. */
export function removePin(pinned: readonly PinnedItem[], id: string): PinnedItem[] {
    return closeUp(pinned.filter((p) => p.id !== id));
}

/**
 * Apply a drag: `visible` is the sequence of pins the sidebar shows after the drop,
 * each with the section it now sits in. Only pins this application shows take part,
 * so hidden ones — another application the organisation no longer has — keep their
 * section and follow the visible ones in their stored order instead of being lost.
 * Stored fields other than section and order are kept as stored; the sidebar's copy
 * carries a resolved `href` that must not be written back.
 */
export function arrangePins(
    pinned: readonly PinnedItem[],
    visible: readonly { id: string; sectionId: string }[],
): PinnedItem[] {
    const byId = new Map(pinned.map((p) => [p.id, p]));
    const moved = visible.flatMap(({ id, sectionId }) => {
        const pin = byId.get(id);
        return pin ? [{ ...pin, sectionId }] : [];
    });
    const shown = new Set(moved.map((p) => p.id));
    const hidden = sortPins(pinned.filter((p) => !shown.has(p.id)));

    return renumber([...moved, ...hidden]);
}

/**
 * The sections to show, in order, with `default` always first. `defaultLabel` names it
 * unless the user renamed it; sections a stored list repeats are kept once.
 */
export function resolveSections(sections: readonly PinnedSection[] | undefined, defaultLabel: string): PinnedSection[] {
    const stored = sections ?? [];
    const renamed = stored.find((s) => s.id === DEFAULT_SECTION_ID);
    const seen = new Set<string>([DEFAULT_SECTION_ID]);
    const others = [...stored]
        .sort((a, b) => a.order - b.order)
        .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));

    return [
        { id: DEFAULT_SECTION_ID, label: renamed?.label || defaultLabel, order: 0 },
        ...others.map((s, index) => ({ ...s, order: index + 1 })),
    ];
}

/** Add a section at the end. A blank label adds nothing. */
export function addSection(
    sections: readonly PinnedSection[] | undefined,
    label: string,
    id: string = `section-${randomId()}`,
): PinnedSection[] {
    const stored = [...(sections ?? [])];
    const trimmed = label.trim();
    if (trimmed === '') {
        return stored;
    }
    const order = stored.filter((s) => s.id !== DEFAULT_SECTION_ID).length + 1;

    return [...stored, { id, label: trimmed, order }];
}

/** Rename a section, including `default`. A blank label changes nothing. */
export function renameSection(sections: readonly PinnedSection[] | undefined, id: string, label: string): PinnedSection[] {
    const stored = [...(sections ?? [])];
    const trimmed = label.trim();
    if (trimmed === '') {
        return stored;
    }
    if (stored.some((s) => s.id === id)) {
        return stored.map((s) => (s.id === id ? { ...s, label: trimmed } : s));
    }
    return id === DEFAULT_SECTION_ID ? [...stored, { id, label: trimmed, order: 0 }] : stored;
}

/**
 * Remove a section and move its pins to the end of `default`, as one change: a pin must
 * never point at a section that is gone. `default` itself cannot be removed.
 */
export function removeSection(
    sections: readonly PinnedSection[] | undefined,
    pinned: readonly PinnedItem[],
    id: string,
): { sections: PinnedSection[]; pinned: PinnedItem[] } {
    const stored = [...(sections ?? [])];
    if (id === DEFAULT_SECTION_ID) {
        return { sections: stored, pinned: [...pinned] };
    }
    const kept = sortPins(pinned.filter((p) => p.sectionId !== id));
    const orphans = sortPins(pinned.filter((p) => p.sectionId === id)).map((p) => ({
        ...p,
        sectionId: DEFAULT_SECTION_ID,
    }));
    const remaining = stored
        .filter((s) => s.id !== id)
        .sort((a, b) => a.order - b.order)
        .map((s, index) => (s.id === DEFAULT_SECTION_ID ? s : { ...s, order: index + 1 }));

    return { sections: remaining, pinned: renumber([...kept, ...orphans]) };
}

/** The resolved pins as sidebar items: the target href, active only for in-app pins. */
export function toSidebarPins(
    resolved: readonly ResolvedPin[],
    isActive: (href: string) => boolean,
    captionFor: (pin: ResolvedPin) => string | null = () => null,
): SidebarPin[] {
    return resolved.map((pin) => ({
        ...pin,
        href: pin.target.href,
        isActive: pin.target.kind === 'visit' && isActive(pin.target.href),
        caption: captionFor(pin),
    }));
}

function sortPins(pins: readonly PinnedItem[]): PinnedItem[] {
    return [...pins].sort((a, b) => a.order - b.order);
}

/** `order` becomes the position within the section, in array order. */
function renumber(pins: readonly PinnedItem[]): PinnedItem[] {
    const next = new Map<string, number>();

    return pins.map((pin) => {
        const order = next.get(pin.sectionId) ?? 0;
        next.set(pin.sectionId, order + 1);
        return { ...pin, order };
    });
}

/** Renumber each section by its current `order`, leaving the array itself in place. */
function closeUp(pins: readonly PinnedItem[]): PinnedItem[] {
    const positions = new Map<string, number>();
    const bySection = new Map<string, PinnedItem[]>();
    for (const pin of pins) {
        bySection.set(pin.sectionId, [...(bySection.get(pin.sectionId) ?? []), pin]);
    }
    for (const section of bySection.values()) {
        sortPins(section).forEach((pin, index) => positions.set(pin.id, index));
    }

    return pins.map((pin) => ({ ...pin, order: positions.get(pin.id) ?? 0 }));
}

function randomId(): string {
    const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoApi?.randomUUID) {
        return cryptoApi.randomUUID();
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
