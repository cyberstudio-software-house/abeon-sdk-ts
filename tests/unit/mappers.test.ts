import { describe, expect, it } from 'vitest';
import { camelToWire, wireToCamel } from '../../src/mappers.js';

describe('wireToCamel', () => {
    it('transforms simple object keys', () => {
        expect(wireToCamel({ user_id: 1, first_name: 'Jan' })).toEqual({
            userId: 1,
            firstName: 'Jan',
        });
    });

    it('recurses into nested objects', () => {
        expect(wireToCamel({ outer_key: { inner_key: { deep_key: 'v' } } })).toEqual({
            outerKey: { innerKey: { deepKey: 'v' } },
        });
    });

    it('recurses into arrays', () => {
        expect(wireToCamel({ items: [{ first_name: 'A' }, { first_name: 'B' }] })).toEqual({
            items: [{ firstName: 'A' }, { firstName: 'B' }],
        });
    });

    it('preserves null and primitives', () => {
        expect(wireToCamel({ value: null, count: 0, ok: false, name: '' })).toEqual({
            value: null,
            count: 0,
            ok: false,
            name: '',
        });
    });

    it('handles numeric segments in keys', () => {
        expect(wireToCamel({ field_1: 'v', api_v2_path: 'p' })).toEqual({
            field1: 'v',
            apiV2Path: 'p',
        });
    });

    it('does not deep-traverse Date instances', () => {
        const date = new Date('2026-01-01');
        const result = wireToCamel<{ createdAt: Date }>({ created_at: date });
        expect(result.createdAt).toBe(date);
    });
});

describe('camelToWire', () => {
    it('transforms simple object keys', () => {
        expect(camelToWire({ userId: 1, firstName: 'Jan' })).toEqual({
            user_id: 1,
            first_name: 'Jan',
        });
    });

    it('is inverse of wireToCamel for round trip', () => {
        const wire = {
            event_id: 'abc',
            event_type: 'crm.contact.created',
            actor: { type: 'user', user_id: '42' },
            data: { contact_id: 1, created_by: 'jan' },
        };
        expect(camelToWire(wireToCamel(wire))).toEqual(wire);
    });
});
