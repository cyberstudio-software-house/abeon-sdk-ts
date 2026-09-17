/**
 * Checksum validators for Polish and international identifiers (architecture §3.4).
 * They accept the usual separators (spaces, dashes) and never throw.
 */

function digitsOf(value: string, allowPrefix: RegExp | null = null): string {
    let normalised = value.replace(/[\s-]/g, '').toUpperCase();
    if (allowPrefix) {
        normalised = normalised.replace(allowPrefix, '');
    }
    return normalised;
}

function weightedSum(digits: string, weights: readonly number[]): number {
    return weights.reduce((sum, weight, i) => sum + weight * Number(digits[i]), 0);
}

export function isValidNip(value: string): boolean {
    const digits = digitsOf(value, /^PL/);
    if (!/^\d{10}$/.test(digits)) {
        return false;
    }
    const check = weightedSum(digits, [6, 5, 7, 2, 3, 4, 5, 6, 7]) % 11;
    return check !== 10 && check === Number(digits[9]);
}

export function isValidRegon(value: string): boolean {
    const digits = digitsOf(value);
    if (/^\d{9}$/.test(digits)) {
        const check = weightedSum(digits, [8, 9, 2, 3, 4, 5, 6, 7]) % 11;
        return (check === 10 ? 0 : check) === Number(digits[8]);
    }
    if (/^\d{14}$/.test(digits)) {
        const check = weightedSum(digits, [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]) % 11;
        return (check === 10 ? 0 : check) === Number(digits[13]) && isValidRegon(digits.slice(0, 9));
    }
    return false;
}

export function isValidPesel(value: string): boolean {
    const digits = digitsOf(value);
    if (!/^\d{11}$/.test(digits)) {
        return false;
    }

    const check = (10 - (weightedSum(digits, [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]) % 10)) % 10;
    if (check !== Number(digits[10])) {
        return false;
    }

    const year = Number(digits.slice(0, 2));
    const encodedMonth = Number(digits.slice(2, 4));
    const day = Number(digits.slice(4, 6));
    const centuries: ReadonlyArray<[number, number]> = [
        [80, 1800],
        [0, 1900],
        [20, 2000],
        [40, 2100],
        [60, 2200],
    ];
    const century = centuries.find(([offset]) => encodedMonth > offset && encodedMonth <= offset + 12);
    if (!century) {
        return false;
    }

    const fullYear = century[1] + year;
    const month = encodedMonth - century[0];
    const date = new Date(Date.UTC(fullYear, month - 1, day));
    return date.getUTCFullYear() === fullYear && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const IBAN_LENGTHS: Readonly<Record<string, number>> = {
    PL: 28, DE: 22, GB: 22, FR: 27, CZ: 24, SK: 24, LT: 20, NL: 18, AT: 20, ES: 24, IT: 27, UA: 29,
};

export function isValidIban(value: string): boolean {
    const iban = digitsOf(value);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
        return false;
    }

    const expectedLength = IBAN_LENGTHS[iban.slice(0, 2)];
    if (expectedLength !== undefined && iban.length !== expectedLength) {
        return false;
    }

    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let remainder = 0;
    for (const char of rearranged) {
        const code = char >= 'A' ? String(char.charCodeAt(0) - 55) : char;
        for (const digit of code) {
            remainder = (remainder * 10 + Number(digit)) % 97;
        }
    }
    return remainder === 1;
}

export function isValidPolishPostalCode(value: string): boolean {
    return /^\d{2}-\d{3}$/.test(value.trim());
}
