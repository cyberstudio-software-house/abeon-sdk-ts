/**
 * Locale-aware formatting shared by every Abeon frontend (architecture §3.4).
 * Pure functions over `Intl`; every one returns `''` for input it cannot read, so a
 * table cell shows nothing instead of "Invalid Date".
 */

export const DEFAULT_LOCALE = 'pl-PL';

export interface FormatDateOptions {
    locale?: string;
    /** Also show hours and minutes. Default `false`. */
    time?: boolean;
    timeZone?: string;
}

function toDate(value: string | number | Date | null | undefined): Date | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
    value: string | number | Date | null | undefined,
    options: FormatDateOptions = {},
): string {
    const date = toDate(value);
    if (date === null) {
        return '';
    }

    return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...(options.time ? { hour: '2-digit', minute: '2-digit' } : {}),
        ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date);
}

export function formatCurrency(
    amount: number | null | undefined,
    currency: string = 'PLN',
    locale: string = DEFAULT_LOCALE,
): string {
    if (amount === null || amount === undefined || !Number.isFinite(amount)) {
        return '';
    }

    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
    } catch {
        return '';
    }
}

const RELATIVE_STEPS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.34524],
    ['month', 12],
    ['year', Number.POSITIVE_INFINITY],
];

/** "5 minut temu", "za 2 dni", "teraz". */
export function formatRelativeTime(
    value: string | number | Date | null | undefined,
    now: number = Date.now(),
    locale: string = DEFAULT_LOCALE,
): string {
    const date = toDate(value);
    if (date === null) {
        return '';
    }

    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    let amount = (date.getTime() - now) / 1000;

    for (const [unit, size] of RELATIVE_STEPS) {
        if (Math.abs(amount) < size) {
            const rounded = Math.round(amount);
            return formatter.format(unit === 'second' && Math.abs(rounded) < 45 ? 0 : rounded, unit);
        }
        amount /= size;
    }

    return '';
}
