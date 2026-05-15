// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { User } from '../../src/index.js';
import { AbeonProvider, useAuth } from '../../src/react/index.js';
import type { ApiClient } from '../../src/_internal/api-client-base.js';

function noopApi(): ApiClient {
    const noop = async () => undefined as never;
    return {
        request: noop,
        get: noop,
        post: noop,
        put: noop,
        patch: noop,
        delete: noop,
    };
}

const sampleUser: User = {
    id: '42',
    email: 'jan@example.com',
    name: 'Jan',
    roles: ['admin', 'sales_manager'],
    permissions: ['crm.contacts.read', 'crm.deals.manage'],
    org_id: 1,
};

function wrap(initialAuth?: { user: User | null }) {
    return ({ children }: { children: ReactNode }) => (
        <AbeonProvider initialAuth={initialAuth} apiClient={noopApi()}>
            {children}
        </AbeonProvider>
    );
}

describe('useAuth', () => {
    it('throws when used outside <AbeonProvider>', () => {
        expect(() => renderHook(() => useAuth())).toThrow(/AbeonProvider/);
    });

    it('returns null user / isAuthenticated=false by default', () => {
        const { result } = renderHook(() => useAuth(), { wrapper: wrap() });
        expect(result.current.user).toBeNull();
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.hasPermission('crm.contacts.read')).toBe(false);
        expect(result.current.hasRole('admin')).toBe(false);
    });

    it('hydrates from initialAuth', () => {
        const { result } = renderHook(() => useAuth(), {
            wrapper: wrap({ user: sampleUser }),
        });
        expect(result.current.user).toEqual(sampleUser);
        expect(result.current.isAuthenticated).toBe(true);
    });

    it('hasPermission checks the permissions array', () => {
        const { result } = renderHook(() => useAuth(), {
            wrapper: wrap({ user: sampleUser }),
        });
        expect(result.current.hasPermission('crm.contacts.read')).toBe(true);
        expect(result.current.hasPermission('crm.contacts.write')).toBe(false);
    });

    it('hasRole checks the roles array', () => {
        const { result } = renderHook(() => useAuth(), {
            wrapper: wrap({ user: sampleUser }),
        });
        expect(result.current.hasRole('admin')).toBe(true);
        expect(result.current.hasRole('owner')).toBe(false);
    });

    it('setUser updates state and propagates to consumers', () => {
        const { result } = renderHook(() => useAuth(), { wrapper: wrap() });
        expect(result.current.isAuthenticated).toBe(false);

        act(() => {
            result.current.setUser(sampleUser);
        });
        expect(result.current.user).toEqual(sampleUser);
        expect(result.current.isAuthenticated).toBe(true);

        act(() => {
            result.current.setUser(null);
        });
        expect(result.current.user).toBeNull();
        expect(result.current.isAuthenticated).toBe(false);
    });
});
