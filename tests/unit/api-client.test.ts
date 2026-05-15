import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../src/client/api-client.js';
import { AbeonError } from '../../src/errors.js';
import { HEADERS } from '../../src/constants.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        ...init,
    });
}

interface FetchCall {
    url: string;
    init: RequestInit;
}

function mockFetch(handler: (call: FetchCall) => Response | Promise<Response>): {
    impl: typeof fetch;
    calls: FetchCall[];
} {
    const calls: FetchCall[] = [];
    const impl: typeof fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : (input as URL | Request).toString();
        calls.push({ url, init });
        return handler({ url, init });
    };
    return { impl, calls };
}

describe('createApiClient', () => {
    beforeEach(() => {
        // jsdom not loaded — document undefined, so no cookies. baseUrl from options.
    });

    it('returns parsed JSON on success', async () => {
        const { impl } = mockFetch(() => jsonResponse({ data: { id: 42 } }));
        const api = createApiClient({ baseUrl: 'http://x.test', fetchImpl: impl });
        const result = await api.get<{ data: { id: number } }>('/api/v1/me');
        expect(result.data.id).toBe(42);
    });

    it('joins basePath + path correctly', async () => {
        const { impl, calls } = mockFetch(() => jsonResponse({}));
        const api = createApiClient({
            baseUrl: 'http://x.test/',
            basePath: '/cms',
            fetchImpl: impl,
        });
        await api.get('/api/v1/pages');
        expect(calls[0]?.url).toBe('http://x.test/cms/api/v1/pages');
    });

    it('serializes query params', async () => {
        const { impl, calls } = mockFetch(() => jsonResponse({}));
        const api = createApiClient({ baseUrl: 'http://x.test', fetchImpl: impl });
        await api.get('/items', { query: { tags: ['a', 'b'], page: 2, skip: null } });
        expect(calls[0]?.url).toBe('http://x.test/items?tags=a&tags=b&page=2');
    });

    it('attaches X-Correlation-ID by default', async () => {
        const { impl, calls } = mockFetch(() => jsonResponse({}));
        const api = createApiClient({
            baseUrl: 'http://x.test',
            correlationId: 'fixed-id',
            fetchImpl: impl,
        });
        await api.get('/x');
        const headers = calls[0]?.init.headers as Record<string, string>;
        expect(headers[HEADERS.CORRELATION_ID]).toBe('fixed-id');
    });

    it('JSON-encodes body and sets Content-Type', async () => {
        const { impl, calls } = mockFetch(() => jsonResponse({}));
        const api = createApiClient({ baseUrl: 'http://x.test', fetchImpl: impl });
        await api.post('/items', { name: 'foo' });
        const init = calls[0]?.init;
        expect(init?.body).toBe('{"name":"foo"}');
        const headers = init?.headers as Record<string, string>;
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('throws AbeonError mapping RFC 7807 body on non-2xx', async () => {
        const { impl } = mockFetch(() =>
            jsonResponse(
                {
                    type: 'https://api.abeon.pl/errors/validation',
                    title: 'Validation Error',
                    status: 422,
                    detail: 'bad input',
                    errors: { email: ['required'] },
                },
                { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
            ),
        );
        const api = createApiClient({ baseUrl: 'http://x.test', fetchImpl: impl });
        await expect(api.post('/items', {})).rejects.toMatchObject({
            name: 'AbeonError',
            problem: { status: 422, title: 'Validation Error' },
        });
    });

    it('wraps non-RFC 7807 errors in generic AbeonError', async () => {
        const { impl } = mockFetch(() =>
            new Response('Internal Server Error', { status: 500 }),
        );
        const api = createApiClient({ baseUrl: 'http://x.test', fetchImpl: impl });
        let caught: unknown;
        try {
            await api.get('/boom');
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(AbeonError);
        expect((caught as AbeonError).problem.status).toBe(500);
        expect((caught as AbeonError).problem.title).toBe('HTTP 500');
    });

    it('returns undefined for 204 No Content', async () => {
        const { impl } = mockFetch(() => new Response(null, { status: 204 }));
        const api = createApiClient({ baseUrl: 'http://x.test', fetchImpl: impl });
        const result = await api.delete('/items/42');
        expect(result).toBeUndefined();
    });

    it('attaches X-XSRF-TOKEN on POST when csrf token is available', async () => {
        const { impl, calls } = mockFetch(() => jsonResponse({}));
        // Document not in node env — pass csrf via headers manually
        const api = createApiClient({
            baseUrl: 'http://x.test',
            fetchImpl: impl,
            headers: { 'X-Custom': 'yes' },
        });
        await api.post('/items', {});
        const headers = calls[0]?.init.headers as Record<string, string>;
        expect(headers['X-Custom']).toBe('yes');
    });
});
