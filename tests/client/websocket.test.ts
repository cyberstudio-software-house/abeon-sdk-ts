// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture every Echo constructor call's options for assertions, without
// instantiating a real Echo (which tries to open a socket and fails in jsdom).
const echoCalls: Array<Record<string, unknown>> = [];

vi.mock('laravel-echo', () => {
    return {
        default: class FakeEcho {
            connector: { options: Record<string, unknown> };
            constructor(options: Record<string, unknown>) {
                echoCalls.push(options);
                this.connector = { options };
            }
            disconnect() {}
        },
    };
});

vi.mock('pusher-js', () => {
    return { default: class FakePusher {} };
});

import { createEcho } from '../../src/client/websocket.js';

beforeEach(() => {
    echoCalls.length = 0;
});

afterEach(() => {
    delete (window as unknown as { Pusher?: unknown }).Pusher;
});

describe('createEcho — H5 wsPort vs wssPort', () => {
    it('defaults both ports to the value parsed from wsUrl', () => {
        createEcho({ key: 'k', wsUrl: 'wss://app.test:6001' });
        expect(echoCalls[0]?.wsPort).toBe(6001);
        expect(echoCalls[0]?.wssPort).toBe(6001);
    });

    it('lets caller override wsPort and wssPort independently', () => {
        createEcho({
            key: 'k',
            wsUrl: 'wss://app.test:6001',
            wsPort: 8080,
            wssPort: 6001,
        });
        expect(echoCalls[0]?.wsPort).toBe(8080);
        expect(echoCalls[0]?.wssPort).toBe(6001);
    });

    it('falls back to 443 for wss:// without explicit port', () => {
        createEcho({ key: 'k', wsUrl: 'wss://app.test' });
        expect(echoCalls[0]?.wsPort).toBe(443);
        expect(echoCalls[0]?.wssPort).toBe(443);
    });

    it('falls back to 80 for ws:// without explicit port', () => {
        createEcho({ key: 'k', wsUrl: 'ws://app.test' });
        expect(echoCalls[0]?.wsPort).toBe(80);
        expect(echoCalls[0]?.wssPort).toBe(80);
    });
});

describe('createEcho — H3 window.Pusher guard', () => {
    it('installs Pusher on window when missing', () => {
        expect((window as unknown as { Pusher?: unknown }).Pusher).toBeUndefined();
        createEcho({ key: 'k', wsUrl: 'wss://app.test:6001' });
        expect((window as unknown as { Pusher?: unknown }).Pusher).toBeDefined();
    });

    it('does NOT overwrite an existing window.Pusher', () => {
        const sentinel = { tag: 'preexisting' };
        (window as unknown as { Pusher?: unknown }).Pusher = sentinel;
        createEcho({ key: 'k', wsUrl: 'wss://app.test:6001' });
        expect((window as unknown as { Pusher?: unknown }).Pusher).toBe(sentinel);
    });
});

describe('createEcho — authEndpoint + forceTLS', () => {
    it('builds authEndpoint from basePath when not explicitly given', () => {
        createEcho({
            key: 'k',
            wsUrl: 'wss://app.test:6001',
            basePath: '/cms',
        });
        expect(echoCalls[0]?.authEndpoint).toBe('/cms/broadcasting/auth');
    });

    it('honours empty-string authEndpoint as "disabled"', () => {
        createEcho({
            key: 'k',
            wsUrl: 'wss://app.test:6001',
            authEndpoint: '',
        });
        expect(echoCalls[0]?.authEndpoint).toBe('');
    });

    it('infers forceTLS=true from wss:// scheme', () => {
        createEcho({ key: 'k', wsUrl: 'wss://app.test:6001' });
        expect(echoCalls[0]?.forceTLS).toBe(true);
    });

    it('infers forceTLS=false from ws:// scheme', () => {
        createEcho({ key: 'k', wsUrl: 'ws://app.test:6001' });
        expect(echoCalls[0]?.forceTLS).toBe(false);
    });
});
