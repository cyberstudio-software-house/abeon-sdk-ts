import { createRemoteJWKSet } from 'jose';
import type { FlattenedJWSInput, GetKeyFunction, JWSHeaderParameters } from 'jose';

export type JwksFn = GetKeyFunction<JWSHeaderParameters, FlattenedJWSInput>;

const cache = new Map<string, JwksFn>();

/**
 * Get a cached JWKS key resolver for a URL. The same instance is reused
 * across requests in the Node process — `jose` itself handles HTTP caching
 * internally per the cooldownDuration option.
 *
 * Lifetime: module scope (persists until Node restarts). Cleared via
 * `clearJwksCache()` in tests.
 */
export function getJwks(
    jwksUrl: string,
    options: { cooldownDuration?: number } = {},
): JwksFn {
    let fn = cache.get(jwksUrl);
    if (!fn) {
        fn = createRemoteJWKSet(new URL(jwksUrl), {
            cooldownDuration: options.cooldownDuration ?? 30_000,
        });
        cache.set(jwksUrl, fn);
    }
    return fn;
}

export function clearJwksCache(): void {
    cache.clear();
}
