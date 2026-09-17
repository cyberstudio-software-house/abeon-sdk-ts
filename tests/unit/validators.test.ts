import { describe, expect, it } from 'vitest';
import {
    isValidIban,
    isValidNip,
    isValidPesel,
    isValidPolishPostalCode,
    isValidRegon,
} from '../../src/index.js';

describe('isValidNip', () => {
    it.each(['1234563218', '123-456-32-18', 'PL 1234563218'])('accepts %s', (nip) => {
        expect(isValidNip(nip)).toBe(true);
    });

    it.each(['1234563217', '123456321', 'abcdefghij', ''])('refuses %s', (nip) => {
        expect(isValidNip(nip)).toBe(false);
    });
});

describe('isValidRegon', () => {
    it.each(['123456785', '12345678512347'])('accepts %s', (regon) => {
        expect(isValidRegon(regon)).toBe(true);
    });

    it.each(['123456786', '12345678512348', '12345678612347', '1234'])('refuses %s', (regon) => {
        expect(isValidRegon(regon)).toBe(false);
    });
});

describe('isValidPesel', () => {
    it.each(['44051401359', '02270803624'])('accepts %s', (pesel) => {
        expect(isValidPesel(pesel)).toBe(true);
    });

    it.each(['44051401358', '44053201357', '4405140135', ''])('refuses %s', (pesel) => {
        expect(isValidPesel(pesel)).toBe(false);
    });
});

describe('isValidIban', () => {
    it.each(['PL61109010140000071219812874', 'PL61 1090 1014 0000 0712 1981 2874', 'DE89370400440532013000'])(
        'accepts %s',
        (iban) => {
            expect(isValidIban(iban)).toBe(true);
        },
    );

    it.each(['PL61109010140000071219812875', 'PL6110901014000007121981287', 'XX00', ''])('refuses %s', (iban) => {
        expect(isValidIban(iban)).toBe(false);
    });
});

describe('isValidPolishPostalCode', () => {
    it('accepts NN-NNN and refuses anything else', () => {
        expect(isValidPolishPostalCode('00-950')).toBe(true);
        expect(isValidPolishPostalCode('00950')).toBe(false);
        expect(isValidPolishPostalCode('0-9500')).toBe(false);
    });
});
