/**
 * Duck-typed cookie reader. Compatible with Next.js `cookies()` from
 * `next/headers` (Server Components, middleware), and with any other
 * framework that exposes a `.get(name).value` shape.
 */
export interface CookieReader {
    get(name: string): { value: string } | undefined;
}

/**
 * Duck-typed header reader. Compatible with Next.js `headers()` and
 * with the standard `Headers` interface.
 */
export interface HeaderReader {
    get(name: string): string | null;
}
