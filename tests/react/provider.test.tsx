// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { User } from '../../src/index.js';
import { AbeonProvider, useAuth } from '../../src/react/index.js';
import { AbeonContext } from '../../src/react/context.js';
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
    roles: ['admin'],
    permissions: ['crm.contacts.read'],
    org_id: 1,
};

describe('AbeonProvider — C1 apiClient stability', () => {
    it('keeps the same apiClient reference across setUser calls', () => {
        const stableApi = noopApi();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AbeonProvider apiClient={stableApi}>{children}</AbeonProvider>
        );

        const { result } = renderHook(
            () => {
                const ctx = useContext(AbeonContext);
                const auth = useAuth();
                return { ctx, auth };
            },
            { wrapper },
        );

        const apiBefore = result.current.ctx!.apiClient;
        expect(apiBefore).toBe(stableApi);

        act(() => {
            result.current.auth.setUser(sampleUser);
        });
        // After setUser, apiClient reference MUST be the same — otherwise
        // child useEffect([api,...]) would refire on every login.
        expect(result.current.ctx!.apiClient).toBe(apiBefore);

        act(() => {
            result.current.auth.setUser(null);
        });
        expect(result.current.ctx!.apiClient).toBe(apiBefore);
    });

    it('keeps the same apiClient when no apiClient prop is provided', () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AbeonProvider>{children}</AbeonProvider>
        );
        const { result } = renderHook(
            () => {
                const ctx = useContext(AbeonContext);
                const auth = useAuth();
                return { ctx, auth };
            },
            { wrapper },
        );
        const apiBefore = result.current.ctx!.apiClient;

        act(() => {
            result.current.auth.setUser(sampleUser);
        });
        expect(result.current.ctx!.apiClient).toBe(apiBefore);
    });
});

describe('AbeonProvider — M6 initialAuth shape validation', () => {
    it('renders anonymous when initialAuth.user lacks required fields', () => {
        const malformed = { id: '42' } as unknown as User; // missing email/roles/permissions
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AbeonProvider initialAuth={{ user: malformed }} apiClient={noopApi()}>
                {children}
            </AbeonProvider>
        );
        const { result } = renderHook(() => useAuth(), { wrapper });
        expect(result.current.user).toBeNull();
        expect(result.current.isAuthenticated).toBe(false);
    });

    it('renders anonymous when roles is not an array', () => {
        const malformed = {
            id: '42',
            email: 'x@y.z',
            name: null,
            roles: 'admin',
            permissions: [],
            org_id: null,
        } as unknown as User;
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AbeonProvider initialAuth={{ user: malformed }} apiClient={noopApi()}>
                {children}
            </AbeonProvider>
        );
        const { result } = renderHook(() => useAuth(), { wrapper });
        expect(result.current.user).toBeNull();
    });

    it('accepts a well-formed User unchanged', () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AbeonProvider initialAuth={{ user: sampleUser }} apiClient={noopApi()}>
                {children}
            </AbeonProvider>
        );
        const { result } = renderHook(() => useAuth(), { wrapper });
        expect(result.current.user).toEqual(sampleUser);
    });
});
