import { AbeonError, isProblemDetails } from '../errors.js';
import { HEADERS } from '../constants.js';
import { buildQueryString, joinUrl } from './url.js';

export interface RequestOptions {
    headers?: Record<string, string>;
    query?: Record<string, unknown>;
    body?: unknown;
    signal?: AbortSignal;
}

export interface ApiClient {
    get<T = unknown>(path: string, options?: RequestOptions): Promise<T>;
    post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
    put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
    patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
    delete<T = unknown>(path: string, options?: RequestOptions): Promise<T>;
    request<T = unknown>(method: string, path: string, options?: RequestOptions): Promise<T>;
}

export interface ApiClientConfig {
    baseUrl: string;
    basePath?: string | undefined;
    defaultHeaders?: Record<string, string>;
    csrfToken?: string | undefined;
    fetchImpl?: typeof fetch;
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Build a method-bag API client over the configured fetch implementation.
 * On non-2xx responses, parses the body as RFC 7807 ProblemDetails when
 * possible and throws AbeonError; otherwise wraps a generic AbeonError
 * preserving the HTTP status.
 */
export function buildApiClient(config: ApiClientConfig): ApiClient {
    const fetchImpl = config.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
        throw new Error(
            '@abeon/shared: no fetch available — pass `fetchImpl` in config or run on Node 18+',
        );
    }

    async function request<T>(
        method: string,
        path: string,
        options: RequestOptions = {},
    ): Promise<T> {
        const url = joinUrl(config.baseUrl, config.basePath, path) + buildQueryString(options.query);
        const upper = method.toUpperCase();

        const headers: Record<string, string> = {
            Accept: 'application/json',
            ...(config.defaultHeaders ?? {}),
            ...(options.headers ?? {}),
        };

        if (UNSAFE_METHODS.has(upper) && config.csrfToken && !headers[HEADERS.XSRF_TOKEN]) {
            headers[HEADERS.XSRF_TOKEN] = config.csrfToken;
        }

        let body: BodyInit | undefined;
        if (options.body !== undefined && options.body !== null) {
            if (
                typeof options.body === 'string' ||
                options.body instanceof FormData ||
                options.body instanceof Blob ||
                options.body instanceof URLSearchParams
            ) {
                body = options.body;
            } else {
                body = JSON.stringify(options.body);
                if (!headers['Content-Type']) {
                    headers['Content-Type'] = 'application/json';
                }
            }
        }

        const response = await fetchImpl(url, {
            method: upper,
            headers,
            body,
            credentials: 'include',
            ...(options.signal ? { signal: options.signal } : {}),
        });

        if (!response.ok) {
            let parsed: unknown;
            try {
                parsed = await response.json();
            } catch {
                parsed = undefined;
            }
            if (isProblemDetails(parsed)) {
                throw new AbeonError(parsed);
            }
            throw new AbeonError({
                type: 'about:blank',
                title: `HTTP ${response.status}`,
                status: response.status,
                detail: `Non-RFC-7807 error from ${url}`,
            });
        }

        if (response.status === 204) {
            return undefined as T;
        }

        const contentType = response.headers.get('Content-Type') ?? '';
        if (contentType.includes('application/json')) {
            return (await response.json()) as T;
        }
        return (await response.text()) as unknown as T;
    }

    return {
        request,
        get: (path, options) => request('GET', path, options),
        post: (path, body, options) => request('POST', path, { ...options, body }),
        put: (path, body, options) => request('PUT', path, { ...options, body }),
        patch: (path, body, options) => request('PATCH', path, { ...options, body }),
        delete: (path, options) => request('DELETE', path, options),
    };
}
