/**
 * Recursive snake_case ↔ camelCase converters for application code that
 * prefers camelCase internally while the wire format is snake_case.
 *
 * NOTE: TS types in `./types/*` use snake_case (wire format) so they match
 * JSON schemas exactly. Application code may keep snake_case (zero mapping)
 * or wrap the API client with these mappers — the choice is per consumer.
 *
 * Conversion preserves:
 *   - Arrays (recurses into elements).
 *   - null / undefined.
 *   - Primitive values (string, number, boolean).
 *   - Date instances (returned as-is, not deep-traversed).
 *
 * Conversion does NOT:
 *   - Handle circular references — pass plain JSON-shaped data.
 *   - Transform Map/Set instances (use plain objects on the wire).
 */

type Plain =
    | string
    | number
    | boolean
    | null
    | undefined
    | Date
    | Plain[]
    | { [key: string]: Plain };

const snakeToCamel = (key: string): string =>
    key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const camelToSnake = (key: string): string =>
    key.replace(/([A-Z])/g, (_, c: string) => `_${c.toLowerCase()}`);

function transformKeys<T>(value: unknown, keyFn: (k: string) => string): T {
    if (Array.isArray(value)) {
        return value.map((item) => transformKeys(item, keyFn)) as T;
    }
    if (value instanceof Date) {
        return value as T;
    }
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[keyFn(k)] = transformKeys(v, keyFn);
        }
        return out as T;
    }
    return value as T;
}

/**
 * snake_case → camelCase (wire → app). Recursive.
 */
export function wireToCamel<T = Plain>(value: unknown): T {
    return transformKeys<T>(value, snakeToCamel);
}

/**
 * camelCase → snake_case (app → wire). Recursive.
 */
export function camelToWire<T = Plain>(value: unknown): T {
    return transformKeys<T>(value, camelToSnake);
}
