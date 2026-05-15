import { decodeJwt, jwtVerify } from 'jose';
import type { CookieReader } from '../_internal/cookies.js';
import { DEFAULTS, ENV } from '../constants.js';
import type { User } from '../types/user.js';
import type { UserJwtPayload } from '../types/jwt.js';
import { getJwks, type JwksFn } from './jwks.js';

export interface ServerAuthContext {
    user: User | null;
    payload: UserJwtPayload | null;
}

export interface GetServerAuthContextOptions {
    /** JWKS URL (defaults to `ABEON_JWKS_URL` env var). */
    jwksUrl?: string;
    /** Pre-built JWKS function — overrides `jwksUrl`. Useful for tests. */
    jwks?: JwksFn;
    /** Expected `iss` claim. Default `'abeon-auth'`. */
    issuer?: string;
    /** Expected `aud` claim. Default `'abeon'`. */
    audience?: string;
    /** Cookie holding the access JWT. Default: `ABEON_JWT_COOKIE_NAME` env, else `'abeon_token'`. */
    cookieName?: string;
}

/**
 * Read the access JWT from a cookie, verify it via JWKS, and return the
 * authenticated User (or null when no/invalid token).
 *
 * In Next.js App Router:
 *
 *     import { cookies } from 'next/headers';
 *     import { getServerAuthContext } from '@abeon/shared/server';
 *
 *     export async function middleware(req: NextRequest) {
 *         const { user } = await getServerAuthContext(req.cookies);
 *         if (!user) return NextResponse.redirect(new URL('/auth/login', req.url));
 *     }
 *
 * Verification: RS256 signature against JWKS, `iss`/`aud` claims, `exp` (via jose).
 * On any verification failure (expired, malformed, untrusted key) returns
 * `{ user: null, payload: null }` — caller decides redirect/error policy.
 */
export async function getServerAuthContext(
    cookies: CookieReader,
    options: GetServerAuthContextOptions = {},
): Promise<ServerAuthContext> {
    const cookieName =
        options.cookieName ??
        readEnv(ENV.JWT_COOKIE_NAME) ??
        DEFAULTS.JWT_COOKIE_NAME;
    const token = cookies.get(cookieName)?.value;
    if (!token) {
        return { user: null, payload: null };
    }

    const jwks = options.jwks ?? resolveJwks(options.jwksUrl);

    try {
        const { payload } = await jwtVerify(token, jwks, {
            issuer: options.issuer ?? DEFAULTS.AUTH_ISSUER,
            audience: options.audience ?? DEFAULTS.AUTH_AUDIENCE,
        });
        const userPayload = payload as unknown as UserJwtPayload;
        if (userPayload.type !== 'user') {
            return { user: null, payload: null };
        }
        return {
            user: {
                id: userPayload.sub,
                email: userPayload.email,
                name: userPayload.name ?? null,
                roles: userPayload.roles ?? [],
                permissions: userPayload.permissions ?? [],
                org_id: userPayload.org_id ?? null,
            },
            payload: userPayload,
        };
    } catch {
        return { user: null, payload: null };
    }
}

export interface RefreshOptions {
    /** Base URL of the Auth service. Required. */
    authBaseUrl: string;
    /** Refresh-token cookie name. Default from `ABEON_REFRESH_COOKIE_NAME` env. */
    refreshCookieName?: string;
    /** Access-token cookie name. Default from `ABEON_JWT_COOKIE_NAME` env. */
    accessCookieName?: string;
    /** Refresh if access JWT expires within this many seconds (default 60). */
    refreshMarginSeconds?: number;
    /** Pin a fetch implementation. Default: `globalThis.fetch`. */
    fetchImpl?: typeof fetch;
}

export interface RefreshResult {
    /** True when Auth returned new tokens. */
    refreshed: boolean;
    /** Raw `Set-Cookie` headers from Auth — propagate onto your NextResponse. */
    setCookieHeaders: string[];
}

/**
 * If the access JWT is within `refreshMarginSeconds` of expiry, call
 * Auth's `/api/v1/auth/refresh` with the refresh cookie and return the
 * `Set-Cookie` headers to apply on the outgoing response.
 *
 *     const result = await refreshTokenIfExpired(cookies, { authBaseUrl: '...' });
 *     if (result.refreshed) {
 *         const response = NextResponse.next();
 *         for (const c of result.setCookieHeaders) response.headers.append('Set-Cookie', c);
 *         return response;
 *     }
 *
 * On any failure (missing refresh cookie, Auth down, refresh rejected),
 * returns `{ refreshed: false, setCookieHeaders: [] }` — caller falls
 * through to redirect-to-login.
 */
export async function refreshTokenIfExpired(
    cookies: CookieReader,
    options: RefreshOptions,
): Promise<RefreshResult> {
    const accessName =
        options.accessCookieName ??
        readEnv(ENV.JWT_COOKIE_NAME) ??
        DEFAULTS.JWT_COOKIE_NAME;
    const refreshName =
        options.refreshCookieName ??
        readEnv(ENV.REFRESH_COOKIE_NAME) ??
        DEFAULTS.REFRESH_COOKIE_NAME;
    const margin = options.refreshMarginSeconds ?? 60;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;

    if (!fetchImpl) {
        return { refreshed: false, setCookieHeaders: [] };
    }

    const access = cookies.get(accessName)?.value;
    if (!access) {
        return { refreshed: false, setCookieHeaders: [] };
    }

    let exp: number | undefined;
    try {
        const decoded = decodeJwt(access);
        exp = typeof decoded.exp === 'number' ? decoded.exp : undefined;
    } catch {
        return { refreshed: false, setCookieHeaders: [] };
    }

    if (!exp || exp - Math.floor(Date.now() / 1000) > margin) {
        return { refreshed: false, setCookieHeaders: [] };
    }

    const refresh = cookies.get(refreshName)?.value;
    if (!refresh) {
        return { refreshed: false, setCookieHeaders: [] };
    }

    const url = options.authBaseUrl.replace(/\/+$/, '') + '/api/v1/auth/refresh';
    let response: Response;
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers: { Cookie: `${refreshName}=${refresh}` },
        });
    } catch {
        return { refreshed: false, setCookieHeaders: [] };
    }

    if (!response.ok) {
        return { refreshed: false, setCookieHeaders: [] };
    }

    const setCookies = extractSetCookies(response.headers);
    return { refreshed: setCookies.length > 0, setCookieHeaders: setCookies };
}

function resolveJwks(jwksUrl: string | undefined): JwksFn {
    const url = jwksUrl ?? readEnv(ENV.JWKS_URL);
    if (!url) {
        throw new Error(
            `@abeon/shared/server: jwks not configured (set ${ENV.JWKS_URL} env or pass options.jwks / options.jwksUrl)`,
        );
    }
    return getJwks(url);
}

function readEnv(name: string): string | undefined {
    if (typeof process === 'undefined' || !process.env) return undefined;
    const v = process.env[name];
    return v && v !== '' ? v : undefined;
}

function extractSetCookies(headers: Headers): string[] {
    const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
    if (typeof withGetSetCookie.getSetCookie === 'function') {
        return withGetSetCookie.getSetCookie();
    }
    const single = headers.get('set-cookie');
    return single ? [single] : [];
}
