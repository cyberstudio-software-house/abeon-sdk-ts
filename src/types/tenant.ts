/**
 * A client organisation (ADR-0016).
 *
 * Returned by `GET /api/v1/auth/tenants` as the list a user may switch between.
 * Deliberately thin — identity and display only. Roles and permissions are *not*
 * here: they are held per membership and arrive in the re-issued JWT (ADR-0017),
 * so a client can never derive its own authorisation from this list.
 *
 * Mirrors `schemas/dto/tenant.json` from abeon/sdk.
 */
export interface Tenant {
    id: number;
    name: string;
    /** URL-safe identifier, stable across renames. */
    slug: string;
    logo_url?: string | null;
    /** True for the organisation the current token is scoped to. Server-populated. */
    current?: boolean | null;
    /** Where this organisation's applications are served (ADR-0031 §2); the switcher sends the browser here. */
    host?: string;
}
