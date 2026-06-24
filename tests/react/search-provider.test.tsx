// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '../../src/index.js';
import {
    CommandRegistryProvider,
    searchResultToCommand,
    useCommandRegistry,
    useRegisterSearchProvider,
} from '../../src/react/index.js';
import type { ApiClient } from '../../src/_internal/api-client-base.js';

const sample: SearchResult = {
    id: 'crm.contact.42',
    title: 'Jan Kowalski',
    subtitle: 'Acme',
    source_app: 'crm',
    entity_type: 'contact',
    url: '/crm/contacts/42',
    icon: 'users',
    score: 0.9,
};

function wrap({ children }: { children: ReactNode }) {
    return <CommandRegistryProvider>{children}</CommandRegistryProvider>;
}

describe('searchResultToCommand', () => {
    it('maps a result to a navigating command', () => {
        const navigate = vi.fn();
        const close = vi.fn();
        const cmd = searchResultToCommand(sample, navigate, 'Wyniki');

        expect(cmd).toMatchObject({ id: 'crm.contact.42', title: 'Jan Kowalski', group: 'Wyniki' });
        cmd.run?.({ close });
        expect(close).toHaveBeenCalledOnce();
        expect(navigate).toHaveBeenCalledWith('/crm/contacts/42');
    });
});

describe('useRegisterSearchProvider', () => {
    function fakeApi(handler: (path: string, q: unknown) => unknown): ApiClient {
        const get = vi.fn(async (path: string, options?: { query?: { q?: unknown } }) =>
            handler(path, options?.query?.q),
        );
        const reject = async () => {
            throw new Error('not used');
        };
        return {
            request: reject as never,
            get: get as ApiClient['get'],
            post: reject as never,
            put: reject as never,
            patch: reject as never,
            delete: reject as never,
        };
    }

    it('registers a provider that queries the endpoint and maps results', async () => {
        const navigate = vi.fn();
        const api = fakeApi((path, q) => {
            expect(path).toBe('/api/v1/search');
            expect(q).toBe('jan');
            return { data: [sample] };
        });

        const { result } = renderHook(
            () => {
                useRegisterSearchProvider({ api, navigate });
                return useCommandRegistry();
            },
            { wrapper: wrap },
        );

        await waitFor(() => expect(result.current.commands).toHaveLength(1));
        const provider = result.current.commands[0]?.provider;
        expect(provider).toBeTypeOf('function');

        const out = await provider!('jan');
        expect(out.map((c) => c.id)).toEqual(['crm.contact.42']);
        out[0]?.run?.({ close: () => undefined });
        expect(navigate).toHaveBeenCalledWith('/crm/contacts/42');
    });

    it('returns no results for a blank query without calling the API', async () => {
        const navigate = vi.fn();
        const get = vi.fn();
        const api = { get } as unknown as ApiClient;

        const { result } = renderHook(
            () => {
                useRegisterSearchProvider({ api, navigate });
                return useCommandRegistry();
            },
            { wrapper: wrap },
        );

        await waitFor(() => expect(result.current.commands).toHaveLength(1));
        const out = await result.current.commands[0]!.provider!('   ');
        expect(out).toEqual([]);
        expect(get).not.toHaveBeenCalled();
    });
});
