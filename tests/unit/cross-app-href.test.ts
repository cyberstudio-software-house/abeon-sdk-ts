import { describe, expect, it } from 'vitest';
import { crossAppHref } from '../../src/client/cross-app-href.js';

describe('crossAppHref', () => {
    it('returns the prefix when no path provided', () => {
        expect(crossAppHref('/crm')).toBe('/crm');
    });

    it('joins prefix with leading-slash path', () => {
        expect(crossAppHref('/crm', '/contacts/42')).toBe('/crm/contacts/42');
    });

    it('joins prefix with path lacking leading slash', () => {
        expect(crossAppHref('/crm', 'contacts/42')).toBe('/crm/contacts/42');
    });

    it('returns path with leading slash when prefix is null', () => {
        expect(crossAppHref(null, '/contacts/42')).toBe('/contacts/42');
        expect(crossAppHref(null, 'contacts/42')).toBe('/contacts/42');
    });

    it('returns / when nothing given', () => {
        expect(crossAppHref(null)).toBe('/');
        expect(crossAppHref(undefined)).toBe('/');
        expect(crossAppHref('')).toBe('/');
    });

    it('does not double the prefix', () => {
        expect(crossAppHref('/crm', '/crm/contacts/42')).toBe('/crm/contacts/42');
        expect(crossAppHref('/crm', '/crm')).toBe('/crm');
    });

    it('passes through absolute URLs', () => {
        expect(crossAppHref('/crm', 'https://other.example/x')).toBe(
            'https://other.example/x',
        );
        expect(crossAppHref(null, 'http://x.test')).toBe('http://x.test');
    });

    it('normalises prefix slashes', () => {
        expect(crossAppHref('crm/', '/foo')).toBe('/crm/foo');
        expect(crossAppHref('/crm/', '/foo')).toBe('/crm/foo');
    });

    it('treats "/" prefix as no prefix', () => {
        expect(crossAppHref('/', '/contacts/42')).toBe('/contacts/42');
    });

    it('appends query parameters for context between applications', () => {
        expect(crossAppHref('/finance', '/invoices', { contact_id: 123 })).toBe('/finance/invoices?contact_id=123');
    });

    it('merges with a query already in the path and keeps the fragment', () => {
        expect(crossAppHref('/crm', '/deals?tab=open#notes', { owner: 'me', page: 2 })).toBe(
            '/crm/deals?tab=open&owner=me&page=2#notes',
        );
    });

    it('skips null and undefined, and leaves the href alone when nothing remains', () => {
        expect(crossAppHref('/crm', '/deals', { owner: null, page: undefined })).toBe('/crm/deals');
        expect(crossAppHref('/crm', '/deals', { archived: false })).toBe('/crm/deals?archived=false');
    });
});
