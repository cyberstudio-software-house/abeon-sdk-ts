/**
 * Compose a URL from base + optional basePath + path.
 *
 *   joinUrl('https://app.abeon.pl', '/cms', '/api/v1/pages') →
 *     'https://app.abeon.pl/cms/api/v1/pages'
 */
export function joinUrl(baseUrl: string, basePath: string | undefined, path: string): string {
    const base = baseUrl.replace(/\/+$/, '');
    const prefix = basePath ? `/${basePath.replace(/^\/+|\/+$/g, '')}` : '';
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${prefix}${suffix}`;
}

/**
 * Build a `?key=value&...` query string from an object. Arrays produce
 * repeated keys (`?tags=a&tags=b`). null / undefined values are skipped.
 */
export function buildQueryString(query?: Record<string, unknown>): string {
    if (!query) return '';
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
            for (const v of value) {
                if (v !== undefined && v !== null) {
                    params.append(key, String(v));
                }
            }
        } else {
            params.append(key, String(value));
        }
    }
    const serialized = params.toString();
    return serialized ? `?${serialized}` : '';
}
