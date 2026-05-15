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
 */
export function crossAppHref(
    appPath: string | null | undefined,
    path?: string,
): string {
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
