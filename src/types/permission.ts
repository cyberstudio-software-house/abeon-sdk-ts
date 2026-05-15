/**
 * Permission DTO — wire format.
 * Mirrors `schemas/dto/permission.json` from abeon/sdk.
 *
 * `name` follows `{app}.{resource}.{action}` pattern:
 * `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`
 */
export interface Permission {
    name: string;
    description: string | null;
}

/**
 * Regex source matching the canonical permission name pattern.
 * Use `PERMISSION_NAME_REGEX.test(name)` for client-side validation.
 */
export const PERMISSION_NAME_REGEX = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
