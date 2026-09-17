/**
 * Build an href for cross-app navigation. Cross-app navigation is a full
 * browser reload (per arch doc §3.7) — the chrome's `<AppSwitcher>` uses
 * this to construct `<a href>` values.
 *
 * Inputs:
 *   - `appPath` — the destination app's path prefix from AppDescriptor.path
 *     (e.g. `/crm`, `/finance`). May be empty/null/undefined when the
 *     descriptor lacks one — in that case we return the relative path
 *     as-is, leaving the browser to resolve.
 *   - `path` — optional relative path within the destination app. When
 *     omitted, the link lands on the app's root (the destination app
 *     is responsible for redirecting to its own dashboard).
 *
 * Examples:
 *   crossAppHref('/crm')                          → '/crm'
 *   crossAppHref('/crm', '/contacts/42')           → '/crm/contacts/42'
 *   crossAppHref('/crm', 'contacts/42')            → '/crm/contacts/42'
 *   crossAppHref(null, '/contacts/42')             → '/contacts/42'
 *   crossAppHref('/crm', 'https://other.example')  → 'https://other.example'
 *   crossAppHref('/finance', '/invoices', { contact_id: 123 }) → '/finance/invoices?contact_id=123'
 *
 * `query` carries context between applications (§3.7): it merges with a query already
 * in `path`, skips `null` and `undefined`, and keeps a `#fragment` at the end.
 */
export type CrossAppQuery = Record<string, string | number | boolean | null | undefined>;

export function crossAppHref(
    appPath: string | null | undefined,
    path?: string,
    query?: CrossAppQuery,
): string {
    return withQuery(baseHref(appPath, path), query);
}

function baseHref(appPath: string | null | undefined, path?: string): string {
    if (path && (path.startsWith('http://') || path.startsWith('https://'))) {
        return path;
    }

    const prefix = normalisePrefix(appPath);
    if (!prefix) {
        return path ? ensureLeadingSlash(path) : '/';
    }

    if (!path) {
        return prefix;
    }

    if (path.startsWith(prefix + '/') || path === prefix) {
        return path;
    }

    return prefix + '/' + path.replace(/^\/+/, '');
}

function normalisePrefix(input: string | null | undefined): string {
    if (!input) return '';
    const trimmed = input.trim();
    if (trimmed === '' || trimmed === '/') return '';
    return '/' + trimmed.replace(/^\/+|\/+$/g, '');
}

function ensureLeadingSlash(path: string): string {
    return path.startsWith('/') ? path : '/' + path;
}

function withQuery(href: string, query?: CrossAppQuery): string {
    if (!query) {
        return href;
    }

    const entries = Object.entries(query).filter(
        (entry): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined,
    );
    if (entries.length === 0) {
        return href;
    }

    const hashIndex = href.indexOf('#');
    const hash = hashIndex >= 0 ? href.slice(hashIndex) : '';
    const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
    const queryIndex = withoutHash.indexOf('?');
    const pathPart = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
    const params = new URLSearchParams(queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '');

    for (const [key, value] of entries) {
        params.set(key, String(value));
    }

    return `${pathPart}?${params.toString()}${hash}`;
}
