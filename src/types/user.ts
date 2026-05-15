/**
 * User DTO — wire format (snake_case).
 * Mirrors `schemas/dto/user.json` from abeon/sdk.
 */
export interface User {
    id: string;
    email: string;
    name: string | null;
    roles: string[];
    permissions: string[];
    org_id: number | null;
}
