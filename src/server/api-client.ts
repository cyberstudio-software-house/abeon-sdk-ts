import { buildApiClient, type ApiClient } from '../_internal/api-client-base.js';
import type { CookieReader, HeaderReader } from '../_internal/cookies.js';
import { uuidv4 } from '../_internal/uuid.js';
import { DEFAULTS, ENV, HEADERS } from '../constants.js';

export interface CreateServerApiClientOptions {
    /** Base URL of downstream service. Default: `ABEON_INTERNAL_API_URL` env. */
    baseUrl?: string;
    /** basePath if the downstream is reached through a path-prefix proxy. */
    basePath?: string;
    /** JWT cookie name. Default: `ABEON_JWT_COOKIE_NAME` env, else `'abeon_token'`. */
    jwtCookieName?: string;
    /** CSRF cookie name. Default `'XSRF-TOKEN'` (Laravel Sanctum convention). */
    csrfCookieName?: string;
    /** Pin a fetch implementation. Default: `globalThis.fetch`. */
    fetchImpl?: typeof fetch;
    /** Additional default headers (merged after Authorization/Correlation). */
    headers?: Record<string, string>;
}

/**
 * Server-side API client for SSR (Next.js middleware, Server Components,
 * route handlers). Two translations the PHP backend requires (per ADR-0001):
 *
 *   1. Reads the access JWT from cookie `abeon_token` (configurable) and
 *      attaches it as `Authorization: Bearer <jwt>` — Abeon's PHP
 *      `AuthMiddleware` does NOT read cookies.
 *   2. Forwards inbound `X-Correlation-ID` from `headers()` (when given);
 *      generates a fresh UUIDv4 fallback.
 *
 * For non-safe methods (POST/PUT/PATCH/DELETE), the CSRF cookie value is
 * sent as `X-XSRF-TOKEN` (Sanctum default).
 *
 *     import { cookies, headers } from 'next/headers';
 *     import { createServerApiClient } from '@abeon/shared/server';
 *
 *     const api = createServerApiClient(cookies(), headers());
 *     const me = await api.get<User>('/api/v1/me');
 */
export function createServerApiClient(
    cookies: CookieReader,
    headers?: HeaderReader,
    options: CreateServerApiClientOptions = {},
): ApiClient {
    const baseUrl = options.baseUrl ?? readEnv(ENV.INTERNAL_API_URL);
    if (!baseUrl) {
        throw new Error(
            `@abeon/shared/server: baseUrl required (set ${ENV.INTERNAL_API_URL} or pass options.baseUrl)`,
        );
    }

    const jwtCookieName =
        options.jwtCookieName ??
        readEnv(ENV.JWT_COOKIE_NAME) ??
        DEFAULTS.JWT_COOKIE_NAME;
    const csrfCookieName = options.csrfCookieName ?? 'XSRF-TOKEN';

    const defaultHeaders: Record<string, string> = { ...(options.headers ?? {}) };

    // V1: cookie JWT → Authorization Bearer (PHP AuthMiddleware reads header only).
    const jwt = cookies.get(jwtCookieName)?.value;
    if (jwt) {
        defaultHeaders[HEADERS.AUTHORIZATION] = `Bearer ${jwt}`;
    }

    // V3: forward inbound X-Correlation-ID, else generate fresh.
    const inboundCorrelation = headers?.get(HEADERS.CORRELATION_ID);
    defaultHeaders[HEADERS.CORRELATION_ID] = inboundCorrelation ?? uuidv4();

    const csrfToken = cookies.get(csrfCookieName)?.value;

    const basePath = options.basePath ?? readEnv(ENV.BASE_PATH);

    return buildApiClient({
        baseUrl,
        basePath,
        defaultHeaders,
        csrfToken: csrfToken ?? undefined,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
}

function readEnv(name: string): string | undefined {
    if (typeof process === 'undefined' || !process.env) return undefined;
    const v = process.env[name];
    return v && v !== '' ? v : undefined;
}
