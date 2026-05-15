import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { ENV } from '../constants.js';

export interface EchoOptions {
    /**
     * Pusher/Reverb app key (public — embedded in client). Default:
     * `NEXT_PUBLIC_ABEON_PUSHER_KEY` env.
     */
    key?: string;
    /**
     * WebSocket host. Default extracted from `NEXT_PUBLIC_ABEON_WS_URL`
     * env (e.g. `wss://app.abeon.pl/notifications/ws`).
     */
    wsUrl?: string;
    /**
     * Broadcasting auth endpoint relative to the current origin
     * (Sanctum / Laravel Reverb convention). Default
     * `${basePath}/broadcasting/auth` — pass empty string to disable.
     * (V5 contract decision.)
     */
    authEndpoint?: string;
    /**
     * basePath when behind a Next.js path-prefix proxy. Default from
     * `NEXT_PUBLIC_ABEON_BASE_PATH` env.
     */
    basePath?: string;
    /**
     * Headers to attach to `/broadcasting/auth` POST — typically X-XSRF-TOKEN
     * read from cookie. Echo / pusher-js handle cookies automatically when
     * `authEndpoint` is same-origin.
     */
    authHeaders?: Record<string, string>;
    /** Cluster identifier for Pusher (not used for self-hosted Reverb). */
    cluster?: string;
    /** Force WSS even when wsUrl uses ws://. Default infers from URL scheme. */
    forceTLS?: boolean;
}

/**
 * Construct a Laravel Echo instance configured for Reverb (Pusher protocol).
 * Returned instance is a singleton per call — caller stores and reuses it.
 *
 *     const echo = createEcho({ authEndpoint: '/cms/broadcasting/auth' });
 *     echo.private(`user.${user.id}`).listen('NotificationCreated', (e) => ...);
 *     // On unmount:
 *     echo.disconnect();
 */
export function createEcho(options: EchoOptions = {}): Echo<'reverb'> {
    const key = options.key ?? readEnv(ENV.PUSHER_KEY);
    if (!key) {
        throw new Error(
            `@abeon/shared/client: Pusher/Reverb key required (set ${ENV.PUSHER_KEY} or pass options.key)`,
        );
    }

    const wsUrl = options.wsUrl ?? readEnv(ENV.WS_URL);
    if (!wsUrl) {
        throw new Error(
            `@abeon/shared/client: WebSocket URL required (set ${ENV.WS_URL} or pass options.wsUrl)`,
        );
    }

    const parsed = new URL(wsUrl);
    const wsHost = parsed.hostname;
    const wsPort = parsed.port ? Number(parsed.port) : parsed.protocol === 'wss:' ? 443 : 80;
    const forceTLS = options.forceTLS ?? parsed.protocol === 'wss:';

    const basePath = options.basePath ?? readEnv(ENV.BASE_PATH) ?? '';
    const authEndpoint =
        options.authEndpoint === ''
            ? ''
            : (options.authEndpoint ?? `${basePath.replace(/\/$/, '')}/broadcasting/auth`);

    // Provide Pusher globally — Echo expects it on window for the `pusher` broadcaster.
    if (typeof window !== 'undefined') {
        (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;
    }

    return new Echo({
        broadcaster: 'reverb',
        key,
        wsHost,
        wsPort,
        wssPort: wsPort,
        forceTLS,
        enabledTransports: ['ws', 'wss'],
        authEndpoint,
        auth: options.authHeaders
            ? { headers: options.authHeaders }
            : undefined,
        ...(options.cluster ? { cluster: options.cluster } : {}),
    });
}

function readEnv(name: string): string | undefined {
    if (typeof process === 'undefined' || !process.env) return undefined;
    const v = process.env[name];
    return v && v !== '' ? v : undefined;
}
