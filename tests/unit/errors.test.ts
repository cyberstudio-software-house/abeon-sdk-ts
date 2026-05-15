import { describe, expect, it } from 'vitest';
import {
    AbeonError,
    AuthError,
    ContractViolationError,
    isProblemDetails,
} from '../../src/errors.js';

describe('AbeonError', () => {
    it('exposes problem and message', () => {
        const err = new AbeonError({
            type: 'about:blank',
            title: 'Boom',
            status: 500,
            detail: 'kaboom',
        });
        expect(err.message).toBe('kaboom');
        expect(err.status).toBe(500);
        expect(err.type).toBe('about:blank');
        expect(err.problem.title).toBe('Boom');
    });

    it('falls back to title when detail missing', () => {
        const err = new AbeonError({ type: 't', title: 'Boom', status: 500 });
        expect(err.message).toBe('Boom');
    });

    it('is an instance of Error', () => {
        const err = new AbeonError({ type: 't', title: 'T', status: 500 });
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('AbeonError');
    });
});

describe('AuthError', () => {
    it('builds unauthenticated 401', () => {
        const err = AuthError.unauthenticated('bad token');
        expect(err).toBeInstanceOf(AuthError);
        expect(err).toBeInstanceOf(AbeonError);
        expect(err.status).toBe(401);
        expect(err.problem.type).toContain('unauthenticated');
        expect(err.problem.detail).toBe('bad token');
    });

    it('builds forbidden 403 with default reason', () => {
        const err = AuthError.forbidden();
        expect(err.status).toBe(403);
        expect(err.problem.detail).toBe('Insufficient permissions');
    });
});

describe('ContractViolationError', () => {
    it('builds unknownService', () => {
        const err = ContractViolationError.unknownService('foo');
        expect(err.status).toBe(500);
        expect(err.problem.detail).toContain("'foo'");
    });

    it('builds invalidRoutingKey', () => {
        const err = ContractViolationError.invalidRoutingKey('BAD');
        expect(err.problem.detail).toContain("'BAD'");
    });
});

describe('isProblemDetails', () => {
    it('returns true for valid shape', () => {
        expect(
            isProblemDetails({ type: 't', title: 'T', status: 500 }),
        ).toBe(true);
    });

    it('returns false for missing fields', () => {
        expect(isProblemDetails({ type: 't', title: 'T' })).toBe(false);
        expect(isProblemDetails({ type: 't', status: 500 })).toBe(false);
        expect(isProblemDetails({})).toBe(false);
        expect(isProblemDetails(null)).toBe(false);
        expect(isProblemDetails(undefined)).toBe(false);
        expect(isProblemDetails('string')).toBe(false);
    });

    it('returns false when status is not number', () => {
        expect(
            isProblemDetails({ type: 't', title: 'T', status: '500' }),
        ).toBe(false);
    });
});
