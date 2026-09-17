// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AbeonProvider, usePinnedItems, usePreferences } from '../../src/react/index.js';
import type { ApiClient } from '../../src/_internal/api-client-base.js';
import type { PinnedItem, Preferences, User } from '../../src/index.js';

const user: User = { id: '1', email: 'admin@abeon.dev', name: 'Admin', roles: [], permissions: [], org_id: 1 };

const pinned: PinnedItem = {
    id: 'boilerplate.settings',
    app: 'boilerplate',
    label: 'Settings',
    href: '/settings',
    iconName: 'Settings',
    sectionId: 'default',
    order: 0,
};

function setup() {
    const saved: Preferences = { version: 1, chrome: { pinned: [], sidebarCollapsed: false, theme: 'system' } };
    let stored: Preferences = saved;
    const reject = async (): Promise<never> => {
        throw new Error('not used');
    };
    // Merges key by key into what it holds, as PreferencesController does.
    const patch = vi.fn(async (_path: string, body: { chrome?: Record<string, unknown> }) => {
        stored = { ...stored, chrome: { ...stored.chrome, ...body.chrome } };
        return { data: stored };
    });
    const api = {
        request: reject,
        get: vi.fn(async () => ({ data: saved })),
        post: reject,
        put: reject,
        patch,
        delete: reject,
    } as unknown as ApiClient;

    const wrapper = ({ children }: { children: ReactNode }) => (
        <AbeonProvider apiClient={api} initialAuth={{ user }} initialPreferences={saved}>
            {children}
        </AbeonProvider>
    );

    return { patch, wrapper };
}

describe('usePinnedItems', () => {
    it('saves pins and sections in one request', async () => {
        const { patch, wrapper } = setup();
        const { result } = renderHook(() => usePinnedItems(), { wrapper });
        const sections = [{ id: 'sales', label: 'Sprzedaż', order: 1 }];

        await act(async () => {
            await result.current.savePins({ pinned: [pinned], sections });
        });

        expect(patch).toHaveBeenCalledTimes(1);
        expect(patch).toHaveBeenCalledWith('/api/v1/auth/me/preferences', {
            chrome: { pinned: [pinned], pinnedSections: sections },
        });
        expect(result.current.sections).toEqual(sections);
    });

    it('sends only the keys it was given', async () => {
        const { patch, wrapper } = setup();
        const { result } = renderHook(() => usePinnedItems(), { wrapper });

        await act(async () => {
            await result.current.savePins({ sections: [] });
        });

        expect(patch).toHaveBeenCalledWith('/api/v1/auth/me/preferences', { chrome: { pinnedSections: [] } });
    });

    it('sends only the pinned list, not the whole chrome namespace', async () => {
        const { patch, wrapper } = setup();
        const { result } = renderHook(() => usePinnedItems(), { wrapper });

        await act(async () => {
            await result.current.setPinned([pinned]);
        });

        expect(patch).toHaveBeenCalledWith('/api/v1/auth/me/preferences', { chrome: { pinned: [pinned] } });
        expect(result.current.pinned).toEqual([pinned]);
    });

    it('does not undo a change made through another key in the meantime', async () => {
        const { wrapper } = setup();
        const { result } = renderHook(() => ({ order: usePinnedItems(), prefs: usePreferences() }), { wrapper });

        const staleSetPinned = result.current.order.setPinned;

        await act(async () => {
            await result.current.prefs.update({ chrome: { sidebarCollapsed: true } });
        });
        await act(async () => {
            await staleSetPinned([pinned]);
        });

        await waitFor(() => expect(result.current.prefs.preferences.chrome?.pinned).toEqual([pinned]));
        expect(result.current.prefs.preferences.chrome?.sidebarCollapsed).toBe(true);
    });

    it('keeps the newer value on screen while a stale save is still in flight', async () => {
        const { patch, wrapper } = setup();
        const { result } = renderHook(() => ({ order: usePinnedItems(), prefs: usePreferences() }), { wrapper });

        const staleSetPinned = result.current.order.setPinned;

        await act(async () => {
            await result.current.prefs.update({ chrome: { sidebarCollapsed: true } });
        });

        let release: () => void = () => {};
        patch.mockImplementationOnce(
            (_path: string, body: { chrome?: Record<string, unknown> }) =>
                new Promise((resolve) => {
                    release = () =>
                        resolve({ data: { version: 1, chrome: { sidebarCollapsed: true, ...body.chrome } } });
                }),
        );

        let pending: Promise<void> = Promise.resolve();
        act(() => {
            pending = staleSetPinned([pinned]);
        });

        expect(result.current.prefs.preferences.chrome?.pinned).toEqual([pinned]);
        expect(result.current.prefs.preferences.chrome?.sidebarCollapsed).toBe(true);

        await act(async () => {
            release();
            await pending;
        });
    });
});
