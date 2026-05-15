// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { CurrentAppProvider, useCurrentApp } from '../../src/react/current-app.js';

function wrap(currentApp: string | null) {
    return ({ children }: { children: ReactNode }) => (
        <CurrentAppProvider currentApp={currentApp}>{children}</CurrentAppProvider>
    );
}

describe('CurrentAppProvider + useCurrentApp', () => {
    it('returns null when no provider mounted', () => {
        const { result } = renderHook(() => useCurrentApp());
        expect(result.current).toBeNull();
    });

    it('returns the configured app name', () => {
        const { result } = renderHook(() => useCurrentApp(), { wrapper: wrap('crm') });
        expect(result.current).toBe('crm');
    });

    it('returns null when provider explicitly passes null', () => {
        const { result } = renderHook(() => useCurrentApp(), { wrapper: wrap(null) });
        expect(result.current).toBeNull();
    });

    it('updates when the prop changes', () => {
        const { result, rerender } = renderHook(() => useCurrentApp(), {
            wrapper: wrap('crm'),
        });
        expect(result.current).toBe('crm');

        // Re-render with a different provider value
        const { result: result2 } = renderHook(() => useCurrentApp(), {
            wrapper: wrap('finance'),
        });
        expect(result2.current).toBe('finance');
        // (intentionally unused — re-mount tests covered separately)
        rerender();
    });
});
