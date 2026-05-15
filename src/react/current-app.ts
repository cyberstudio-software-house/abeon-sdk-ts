import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';

export interface CurrentAppContextValue {
    /**
     * Identifier of the currently mounted app (matches `AppDescriptor.name`,
     * e.g. `"crm"`). `null` when chrome is rendered outside an app (public
     * CMS, login page).
     */
    currentApp: string | null;
}

const CurrentAppContext = createContext<CurrentAppContextValue>({ currentApp: null });
CurrentAppContext.displayName = 'AbeonCurrentApp';

export interface CurrentAppProviderProps {
    /** Identifier matching one of the AppDescriptor names. */
    currentApp: string | null;
    children: ReactNode;
}

/**
 * Provider that publishes "this is the active app" to chrome components
 * (`<AppSwitcher>` highlight, breadcrumb root, command-palette pre-filter).
 *
 * In Next.js: set from the layout based on the segment.
 * In Inertia: set from a shared prop passed to the layout.
 *
 * Defaults to `currentApp: null` when no provider is mounted — chrome then
 * renders as "no app selected" (e.g. login screen).
 */
export function CurrentAppProvider({
    currentApp,
    children,
}: CurrentAppProviderProps): ReactNode {
    const value = useMemo<CurrentAppContextValue>(() => ({ currentApp }), [currentApp]);

    return createElement(CurrentAppContext.Provider, { value }, children);
}

export function useCurrentApp(): string | null {
    return useContext(CurrentAppContext).currentApp;
}

/**
 * Derive the current app from a URL path prefix — usable in environments
 * where the framework doesn't already expose the active segment. Returns
 * `null` if the path doesn't start with a known prefix.
 *
 * Example:
 *   deriveCurrentApp('/crm/contacts/42', [{ name: 'crm', path: '/crm' }])
 *   → 'crm'
 *
 * Callers usually want to memoise the result alongside the apps list.
 */
export function deriveCurrentApp<T extends { name: string; path?: string | null }>(
    pathname: string,
    apps: ReadonlyArray<T>,
): string | null {
    let bestMatch: { name: string; prefixLength: number } | null = null;

    for (const app of apps) {
        const prefix = (app.path ?? '').trim();
        if (prefix === '' || prefix === '/') continue;
        const normalised = '/' + prefix.replace(/^\/+|\/+$/g, '');
        if (pathname === normalised || pathname.startsWith(normalised + '/')) {
            if (!bestMatch || normalised.length > bestMatch.prefixLength) {
                bestMatch = { name: app.name, prefixLength: normalised.length };
            }
        }
    }

    return bestMatch?.name ?? null;
}
