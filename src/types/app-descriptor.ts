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
}
