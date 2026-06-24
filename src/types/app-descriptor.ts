/**
 * Metadata POSTed by each service to Auth on bootstrap (M4).
 * Returned by Auth via `/api/v1/auth/apps` for `<AppSwitcher>`.
 */
export interface AppDescriptor {
    name: string;
    label: string | null;
    path: string | null;
    icon: string | null;
    version: string | null;
    permissions: string[];
    /** Free-form AppSwitcher group label. */
    category: string | null;
    /** Sort hint within the switcher / category (ascending). */
    order: number | null;
    /** Chrome UI mode the app prefers. */
    mode: 'suite' | 'app' | null;
    /** Render chrome-less / full-bleed. */
    fullscreen: boolean | null;
}
