import { useMemo } from 'react';
import type { ApiClient } from '../_internal/api-client-base.js';
import type { SearchResult } from '../types/search-result.js';
import { useRegisterCommands, type Command } from './command-registry.js';

export interface UseRegisterSearchProviderOptions {
    /** API client used to query the search endpoint (e.g. from `useApi()`). */
    api: Pick<ApiClient, 'get'>;
    /** Navigate on result selection (e.g. Inertia's `router.visit`). */
    navigate: (url: string) => void;
    /** Search endpoint path. Default `/api/v1/search` (ADR-0011). */
    path?: string;
    /** Palette group label for results. Default `"Wyniki wyszukiwania"`. */
    group?: string;
    /** Stable command id for the provider entry. Default `"search.global"`. */
    id?: string;
}

/**
 * Maps a `SearchResult` to a palette `Command` that navigates on selection.
 * Exported for unit testing the wire→command mapping.
 */
export function searchResultToCommand(
    result: SearchResult,
    navigate: (url: string) => void,
    group: string,
): Command {
    return {
        id: result.id,
        title: result.title,
        subtitle: result.subtitle,
        group,
        icon: result.icon,
        score: result.score,
        run: (ctx) => {
            ctx.close();
            navigate(result.url);
        },
    };
}

/**
 * Registers the cross-app search service (ADR-0011) as a single async provider
 * behind the command palette — exactly the "one more provider behind the same
 * palette" integration ADR-0007 deferred to Phase 2. On each keystroke the
 * palette calls the provider, which queries `abeon-search` and maps the
 * `SearchResult[]` envelope into navigable commands. Reuses
 * `useRegisterCommands` / the `Command.provider` mechanism.
 */
export function useRegisterSearchProvider(options: UseRegisterSearchProviderOptions): void {
    const { api, navigate } = options;
    const path = options.path ?? '/api/v1/search';
    const group = options.group ?? 'Wyniki wyszukiwania';
    const id = options.id ?? 'search.global';

    const commands = useMemo<Command[]>(
        () => [
            {
                id,
                title: 'Szukaj w aplikacjach',
                group,
                provider: async (query: string): Promise<Command[]> => {
                    const q = query.trim();
                    if (q === '') return [];
                    const response = await api.get<{ data: SearchResult[] }>(path, {
                        query: { q },
                    });
                    const results = Array.isArray(response?.data) ? response.data : [];
                    return results.map((r) => searchResultToCommand(r, navigate, group));
                },
            },
        ],
        [api, navigate, path, group, id],
    );

    useRegisterCommands(commands);
}
