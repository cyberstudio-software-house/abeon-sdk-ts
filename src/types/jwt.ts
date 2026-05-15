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
    org_id?: number | null;
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
    jti: string;
}

export type AbeonJwtPayload = UserJwtPayload | ServiceJwtPayload;
