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
    /**
     * Whether this application is assigned to the caller's organisation — the
     * presence of a `tenant_apps` row for `(org_id, app)` (ADR-0015 as amended by
     * ADR-0016).
     *
     * **Organisation-relative:** the same app yields different values for different
     * callers, so a cached catalogue is only valid for the organisation it was
     * fetched for and must be re-derived when the active one changes (ADR-0017).
     * `null` on self-registration — an app cannot know which organisations hold it.
     */
    enabled: boolean | null;
}
