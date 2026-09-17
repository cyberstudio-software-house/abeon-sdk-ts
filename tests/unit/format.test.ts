import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, formatRelativeTime } from '../../src/index.js';

const NOW = Date.parse('2026-09-17T12:00:00Z');

describe('formatDate', () => {
    it('formats a date in Polish by default', () => {
        expect(formatDate('2026-09-17T08:30:00Z', { timeZone: 'UTC' })).toBe('17 wrz 2026');
    });

    it('adds the time when asked', () => {
        expect(formatDate('2026-09-17T08:30:00Z', { time: true, timeZone: 'UTC' })).toBe('17 wrz 2026, 08:30');
    });

    it('returns an empty string for missing or broken input', () => {
        expect(formatDate(null)).toBe('');
        expect(formatDate('')).toBe('');
        expect(formatDate('not a date')).toBe('');
    });
});

describe('formatCurrency', () => {
    it('formats złoty with Polish separators', () => {
        expect(formatCurrency(12345.5).replace(/\s/g, ' ')).toBe('12 345,50 zł');
    });

    it('formats another currency', () => {
        expect(formatCurrency(10, 'EUR').replace(/\s/g, ' ')).toBe('10,00 €');
    });

    it('returns an empty string for non-numbers and unknown currencies', () => {
        expect(formatCurrency(null)).toBe('');
        expect(formatCurrency(Number.NaN)).toBe('');
        expect(formatCurrency(10, 'NOPE')).toBe('');
    });
});

describe('formatRelativeTime', () => {
    it.each([
        ['2026-09-17T11:59:50Z', 'teraz'],
        ['2026-09-17T11:55:00Z', '5 minut temu'],
        ['2026-09-17T09:00:00Z', '3 godziny temu'],
        ['2026-09-16T12:00:00Z', 'wczoraj'],
        ['2026-09-19T12:00:00Z', 'pojutrze'],
    ])('%s → %s', (iso, expected) => {
        expect(formatRelativeTime(iso, NOW)).toBe(expected);
    });

    it('returns an empty string for broken input', () => {
        expect(formatRelativeTime('nope', NOW)).toBe('');
    });
});
