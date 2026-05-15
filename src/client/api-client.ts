import { buildApiClient, type ApiClient } from '../_internal/api-client-base.js';
import { uuidv4 } from '../_internal/uuid.js';
import { ENV, HEADERS } from '../constants.js';

export interface CreateApiClientOptions {
    /** Override base URL. Default: `NEXT_PUBLIC_ABEON_API_URL` env, else `window.location.origin`. */
    baseUrl?: string;
    /** Override basePath. Default: `NEXT_PUBLIC_ABEON_BASE_PATH` env. */
    basePath?: string;
    /** Override correlation ID. Default: fresh UUIDv4 per client. */
    correlationId?: string;
    /** CSRF cookie name. Default `'XSRF-TOKEN'` (Laravel convention). */
    csrfCookieName?: string;
    /** Pin a fetch implementation (useful for tests). Default: `globalThis.fetch`. */
    fetchImpl?: typeof fetch;
    /** Additional default headers (merged on top of correlation/auth). */
    headers?: Record<string, string>;
}

/**
 * Browser-side API client. Uses native `fetch` with `credentials: 'include'`
 * so the browser sends cookies automatically. Auto-injects
 * `X-Correlation-ID` and (for unsafe methods) `X-XSRF-TOKEN`.
 *
 *     const api = createApiClient();
 *     const user = await api.get<User>('/api/v1/me');
 *     try { await api.post('/api/v1/contacts', { email: '...' }); }
 *     catch (err) { if (err instanceof AbeonError) { /* err.problem.status, err.problem.errors *​/ } }
 */
export function createApiClient(options: CreateApiClientOptions = {}): ApiClient {
    const baseUrl =
        options.baseUrl ??
        readEnv(ENV.PUBLIC_API_URL) ??
        (typeof window !== 'undefined' ? window.location.origin : '');

    if (!baseUrl) {
        throw new Error(
            `@abeon/shared/client: baseUrl required (set ${ENV.PUBLIC_API_URL} or pass explicit option)`,
        );
    }

    const basePath = options.basePath ?? readEnv(ENV.BASE_PATH);
    const correlationId = options.correlationId ?? uuidv4();
    const csrfToken = readCookie(options.csrfCookieName ?? 'XSRF-TOKEN');

    return buildApiClient({
        baseUrl,
        basePath,
        defaultHeaders: {
            [HEADERS.CORRELATION_ID]: correlationId,
            ...(options.headers ?? {}),
        },
        csrfToken: csrfToken ?? undefined,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
}

function readEnv(name: string): string | undefined {
    if (typeof process === 'undefined' || !process.env) return undefined;
    const v = process.env[name];
    return v && v !== '' ? v : undefined;
}

function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
    return match && match[1] !== undefined ? decodeURIComponent(match[1]) : null;
}
