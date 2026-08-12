/**
 * Decoded user JWT payload — issued by Auth service, validated by
 * abeon/sdk `JwtValidator` (PHP) or `getServerAuthContext` (TS, Sprint B).
 *
 * Mirrors `schemas/auth/jwt-user.json` from abeon/sdk.
 */
export interface UserJwtPayload {
    sub: string;
    exp: number;
    iat: number;
    iss: 'abeon-auth';
    aud: 'abeon';
    type: 'user';
    email: string;
    name?: string | null;
    roles: string[];
    permissions: string[];
    /**
     * Organisation this token is scoped to. Required — an authorization and
     * data-scoping dimension, not a display field (ADR-0016). A user belonging to
     * several organisations holds a token for exactly one at a time; switching
     * re-issues the token (ADR-0017).
     */
    org_id: number;
    jti: string;
}

/**
 * Decoded service-to-service JWT payload — signed by the calling service
 * with its own RS256 key (5min TTL).
 *
 * Mirrors `schemas/auth/jwt-service.json` from abeon/sdk.
 */
export interface ServiceJwtPayload {
    sub: string;
    exp: number;
    iat: number;
    iss: string;
    aud: 'abeon';
    type: 'service';
    service_name: string;
    /**
     * Set when the service acts on behalf of an organisation (ADR-0005 as amended
     * by ADR-0016). Absent or null means no organisation — never "all organisations".
     */
    org_id?: number | null;
    jti: string;
}

export type AbeonJwtPayload = UserJwtPayload | ServiceJwtPayload;
