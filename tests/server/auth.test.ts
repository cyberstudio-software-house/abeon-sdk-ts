import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, importJWK, type CryptoKey, type JWK } from 'jose';
import {
    getServerAuthContext,
    refreshTokenIfExpired,
    clearJwksCache,
    type JwksFn,
} from '../../src/server/index.js';
import type { CookieReader } from '../../src/_internal/cookies.js';

let privateKey: CryptoKey;
let publicJwk: JWK;
let jwks: JwksFn;

beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    publicJwk = await exportJWK(pair.publicKey);
    publicJwk.kid = 'test-key';
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';

    // Local key resolver that mimics createRemoteJWKSet output for tests.
    jwks = (async () => importJWK(publicJwk, 'RS256')) as unknown as JwksFn;
});

afterEach(() => {
    clearJwksCache();
});

async function signUserToken(
    overrides: Record<string, unknown> = {},
    expiresInSeconds = 900,
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
        type: 'user',
        email: 'jan@example.com',
        roles: ['admin'],
        permissions: ['crm.contacts.read'],
        org_id: 1,
        ...overrides,
    })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer('abeon-auth')
        .setAudience('abeon')
        .setIssuedAt(now)
        .setExpirationTime(now + expiresInSeconds)
        .setSubject((overrides.sub as string) ?? '42')
        .setJti('jti-test')
        .sign(privateKey);
}

function cookieJar(values: Record<string, string>): CookieReader {
    return {
        get: (name) => (name in values ? { value: values[name]! } : undefined),
    };
}

describe('getServerAuthContext', () => {
    it('returns null user when no cookie', async () => {
        const ctx = await getServerAuthContext(cookieJar({}), { jwks });
        expect(ctx.user).toBeNull();
        expect(ctx.payload).toBeNull();
    });

    it('returns User when token is valid', async () => {
        const token = await signUserToken();
        const ctx = await getServerAuthContext(cookieJar({ abeon_token: token }), { jwks });
        expect(ctx.user).not.toBeNull();
        expect(ctx.user!.id).toBe('42');
        expect(ctx.user!.email).toBe('jan@example.com');
        expect(ctx.user!.roles).toEqual(['admin']);
        expect(ctx.user!.permissions).toEqual(['crm.contacts.read']);
        expect(ctx.user!.org_id).toBe(1);
    });

    it('returns null user when token expired', async () => {
        const expired = await signUserToken({}, -10);
        const ctx = await getServerAuthContext(cookieJar({ abeon_token: expired }), { jwks });
        expect(ctx.user).toBeNull();
    });

    it('returns null when iss claim is wrong', async () => {
        const now = Math.floor(Date.now() / 1000);
        const token = await new SignJWT({ type: 'user', email: 'x@y.z' })
            .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
            .setIssuer('rogue-auth')
            .setAudience('abeon')
            .setIssuedAt(now)
            .setExpirationTime(now + 600)
            .setSubject('42')
            .setJti('jti')
            .sign(privateKey);
        const ctx = await getServerAuthContext(cookieJar({ abeon_token: token }), { jwks });
        expect(ctx.user).toBeNull();
    });

    it('returns null when type claim is "service"', async () => {
        const token = await signUserToken({ type: 'service' });
        const ctx = await getServerAuthContext(cookieJar({ abeon_token: token }), { jwks });
        expect(ctx.user).toBeNull();
    });

    it('respects custom cookieName option', async () => {
        const token = await signUserToken();
        const ctx = await getServerAuthContext(
            cookieJar({ custom_jwt: token }),
            { jwks, cookieName: 'custom_jwt' },
        );
        expect(ctx.user).not.toBeNull();
    });
});

describe('refreshTokenIfExpired', () => {
    it('returns refreshed=false when no access cookie', async () => {
        const result = await refreshTokenIfExpired(cookieJar({}), { authBaseUrl: 'http://x.test' });
        expect(result.refreshed).toBe(false);
    });

    it('returns refreshed=false when access token has plenty of life left', async () => {
        const token = await signUserToken({}, 900); // 15 min ahead
        const result = await refreshTokenIfExpired(
            cookieJar({ abeon_token: token, abeon_refresh: 'r' }),
            { authBaseUrl: 'http://auth.test', refreshMarginSeconds: 60 },
        );
        expect(result.refreshed).toBe(false);
    });

    it('returns refreshed=false when refresh cookie missing', async () => {
        const expiringSoon = await signUserToken({}, 30); // 30s, margin=60
        const result = await refreshTokenIfExpired(
            cookieJar({ abeon_token: expiringSoon }),
            { authBaseUrl: 'http://auth.test', refreshMarginSeconds: 60 },
        );
        expect(result.refreshed).toBe(false);
    });

    it('calls Auth /api/v1/auth/refresh when token expires within margin', async () => {
        const expiringSoon = await signUserToken({}, 10);
        const fetchCalls: { url: string; init: RequestInit }[] = [];
        const fakeFetch: typeof fetch = async (input, init = {}) => {
            const url = typeof input === 'string' ? input : (input as URL | Request).toString();
            fetchCalls.push({ url, init });
            const headers = new Headers();
            headers.append('set-cookie', 'abeon_token=new_access; HttpOnly; Path=/');
            headers.append('set-cookie', 'abeon_refresh=new_refresh; HttpOnly; Path=/');
            return new Response(null, { status: 200, headers });
        };

        const result = await refreshTokenIfExpired(
            cookieJar({ abeon_token: expiringSoon, abeon_refresh: 'old_refresh' }),
            {
                authBaseUrl: 'http://auth.test',
                refreshMarginSeconds: 60,
                fetchImpl: fakeFetch,
            },
        );

        expect(fetchCalls[0]?.url).toBe('http://auth.test/api/v1/auth/refresh');
        const sentCookie = (fetchCalls[0]?.init.headers as Record<string, string>).Cookie;
        expect(sentCookie).toBe('abeon_refresh=old_refresh');
        expect(result.refreshed).toBe(true);
        expect(result.setCookieHeaders.length).toBeGreaterThan(0);
    });

    it('returns refreshed=false when Auth responds non-2xx', async () => {
        const expiringSoon = await signUserToken({}, 10);
        const failingFetch: typeof fetch = async () => new Response(null, { status: 401 });
        const result = await refreshTokenIfExpired(
            cookieJar({ abeon_token: expiringSoon, abeon_refresh: 'r' }),
            {
                authBaseUrl: 'http://auth.test',
                refreshMarginSeconds: 60,
                fetchImpl: failingFetch,
            },
        );
        expect(result.refreshed).toBe(false);
    });
});
