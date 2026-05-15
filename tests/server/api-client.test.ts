import { describe, expect, it } from 'vitest';
import { createServerApiClient } from '../../src/server/api-client.js';
import { HEADERS } from '../../src/constants.js';
import type { CookieReader, HeaderReader } from '../../src/_internal/cookies.js';

function cookieJar(values: Record<string, string>): CookieReader {
    return {
        get: (name) => (name in values ? { value: values[name]! } : undefined),
    };
}

function headersBag(values: Record<string, string>): HeaderReader {
    return {
        get: (name) => values[name.toLowerCase()] ?? values[name] ?? null,
    };
}

interface FetchCall {
    url: string;
    init: RequestInit;
}

function mockFetch(): { impl: typeof fetch; calls: FetchCall[] } {
    const calls: FetchCall[] = [];
    const impl: typeof fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : (input as URL | Request).toString();
        calls.push({ url, init });
        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };
    return { impl, calls };
}

describe('createServerApiClient', () => {
    it('translates JWT cookie to Authorization Bearer (V1)', async () => {
        const { impl, calls } = mockFetch();
        const api = createServerApiClient(
            cookieJar({ abeon_token: 'jwt-value' }),
            undefined,
            { baseUrl: 'http://backend.test', fetchImpl: impl },
        );
        await api.get('/api/v1/me');
        const headers = calls[0]?.init.headers as Record<string, string>;
        expect(headers[HEADERS.AUTHORIZATION]).toBe('Bearer jwt-value');
    });

    it('does NOT send Cookie header (would conflict with V1 contract)', async () => {
        const { impl, calls } = mockFetch();
        const api = createServerApiClient(
            cookieJar({ abeon_token: 'jwt-value' }),
            undefined,
            { baseUrl: 'http://backend.test', fetchImpl: impl },
        );
        await api.get('/api/v1/me');
        const headers = calls[0]?.init.headers as Record<string, string>;
        expect(headers['Cookie']).toBeUndefined();
        expect(headers['cookie']).toBeUndefined();
    });

    it('omits Authorization when no JWT cookie present', async () => {
        const { impl, calls } = mockFetch();
        const api = createServerApiClient(
            cookieJar({}),
            undefined,
            { baseUrl: 'http://backend.test', fetchImpl: impl },
        );
        await api.get('/api/v1/public');
        const headers = calls[0]?.init.headers as Record<string, string>;
        expect(headers[HEADERS.AUTHORIZATION]).toBeUndefined();
    });

    it('forwards inbound X-Correlation-ID (V3)', async () => {
        const { impl, calls } = mockFetch();
        const api = createServerApiClient(
            cookieJar({}),
            headersBag({ 'x-correlation-id': 'abc-123' }),
            { baseUrl: 'http://backend.test', fetchImpl: impl },
        );
        await api.get('/x');
        const headers = calls[0]?.init.headers as Record<string, string>;
        expect(headers[HEADERS.CORRELATION_ID]).toBe('abc-123');
    });

    it('generates fresh correlation when no inbound header', async () => {
        const { impl, calls } = mockFetch();
        const api = createServerApiClient(
            cookieJar({}),
            undefined,
            { baseUrl: 'http://backend.test', fetchImpl: impl },
        );
        await api.get('/x');
        const headers = calls[0]?.init.headers as Record<string, string>;
        expect(headers[HEADERS.CORRELATION_ID]).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
    });

    it('attaches CSRF token from XSRF-TOKEN cookie on POST', async () => {
        const { impl, calls } = mockFetch();
        const api = createServerApiClient(
            cookieJar({ abeon_token: 'jwt', 'XSRF-TOKEN': 'csrf-value' }),
            undefined,
            { baseUrl: 'http://backend.test', fetchImpl: impl },
        );
        await api.post('/api/v1/items', { name: 'x' });
        const headers = calls[0]?.init.headers as Record<string, string>;
        expect(headers[HEADERS.XSRF_TOKEN]).toBe('csrf-value');
    });

    it('respects custom jwtCookieName option', async () => {
        const { impl, calls } = mockFetch();
        const api = createServerApiClient(
            cookieJar({ custom_jwt: 'v' }),
            undefined,
            {
                baseUrl: 'http://backend.test',
                jwtCookieName: 'custom_jwt',
                fetchImpl: impl,
            },
        );
        await api.get('/x');
        const headers = calls[0]?.init.headers as Record<string, string>;
        expect(headers[HEADERS.AUTHORIZATION]).toBe('Bearer v');
    });

    // H4: explicit Authorization passed via options.headers wins over the
    // JWT-cookie fallback. Required for service-to-service calls that
    // attach a system token, not the end-user's JWT.
    it('preserves explicit Authorization header passed via options.headers', async () => {
        const { impl, calls } = mockFetch();
        const api = createServerApiClient(
            cookieJar({ abeon_token: 'user-jwt' }),
            undefined,
            {
                baseUrl: 'http://backend.test',
                fetchImpl: impl,
                headers: { Authorization: 'Bearer system-token' },
            },
        );
        await api.get('/api/v1/internal/registry');
        const headers = calls[0]?.init.headers as Record<string, string>;
        expect(headers[HEADERS.AUTHORIZATION]).toBe('Bearer system-token');
    });

    // H4: case-insensitive — `authorization` (lowercase) still suppresses fallback.
    it('respects explicit Authorization header case-insensitively', async () => {
        const { impl, calls } = mockFetch();
        const api = createServerApiClient(
            cookieJar({ abeon_token: 'user-jwt' }),
            undefined,
            {
                baseUrl: 'http://backend.test',
                fetchImpl: impl,
                headers: { authorization: 'Bearer system-token' },
            },
        );
        await api.get('/x');
        const headers = calls[0]?.init.headers as Record<string, string>;
        // Whichever casing wins, the cookie's Bearer must NOT be present.
        const allValues = Object.entries(headers)
            .filter(([k]) => k.toLowerCase() === 'authorization')
            .map(([, v]) => v);
        expect(allValues).toContain('Bearer system-token');
        expect(allValues).not.toContain('Bearer user-jwt');
    });
});
