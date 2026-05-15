/**
 * HTTP header names used by abeon/sdk contract.
 * Use these constants instead of string literals to keep TS and PHP in sync.
 */
export const HEADERS = {
    /** UUIDv4 propagated end-to-end across HTTP and events. */
    CORRELATION_ID: 'X-Correlation-ID',
    /** Bearer JWT for both user and service tokens. */
    AUTHORIZATION: 'Authorization',
    /** Set on every API response by `VersionHeadersMiddleware` (PHP). */
    API_VERSION: 'X-API-Version',
    /** Set on deprecated endpoints (RFC 9745 draft). */
    DEPRECATION: 'Deprecation',
    /** Sunset date for deprecated endpoints (RFC 8594). */
    SUNSET: 'Sunset',
    /** CSRF token header for cookie-authenticated non-safe methods. */
    XSRF_TOKEN: 'X-XSRF-TOKEN',
    /** Standard accept for RFC 7807 problem responses. */
    CONTENT_TYPE_PROBLEM: 'application/problem+json',
} as const;

/**
 * Env var names. Must match `abeon-sdk-php/config/abeon.php` to keep
 * frontend and backend in sync — see ADR-0001 and abeon-shared-phase0-plan.md V2.
 */
export const ENV = {
    /** Browser-side public API URL (Traefik-routed). Next.js requires NEXT_PUBLIC_ prefix. */
    PUBLIC_API_URL: 'NEXT_PUBLIC_ABEON_API_URL',
    /** SSR-side internal K8s DNS. NOT exposed to browser. */
    INTERNAL_API_URL: 'ABEON_INTERNAL_API_URL',
    /** Next.js basePath per app (e.g. /cms, /crm). */
    BASE_PATH: 'NEXT_PUBLIC_ABEON_BASE_PATH',
    /** WebSocket endpoint for Notifications service (Reverb). */
    WS_URL: 'NEXT_PUBLIC_ABEON_WS_URL',
    /** Pusher / Reverb app key (public). */
    PUSHER_KEY: 'NEXT_PUBLIC_ABEON_PUSHER_KEY',
    /** JWKS endpoint URL for SSR JWT verification. */
    JWKS_URL: 'ABEON_JWKS_URL',
    /** Canonical access-token cookie name (MUST match PHP `auth.cookies.access`). */
    JWT_COOKIE_NAME: 'ABEON_JWT_COOKIE_NAME',
    /** Canonical refresh-token cookie name (MUST match PHP `auth.cookies.refresh`). */
    REFRESH_COOKIE_NAME: 'ABEON_REFRESH_COOKIE_NAME',
} as const;

/**
 * Sensible defaults when env vars are not set. Keep in sync with PHP defaults.
 */
export const DEFAULTS = {
    JWT_COOKIE_NAME: 'abeon_token',
    REFRESH_COOKIE_NAME: 'abeon_refresh',
    AUTH_ISSUER: 'abeon-auth',
    AUTH_AUDIENCE: 'abeon',
    JWT_ALGORITHM: 'RS256',
    USER_TOKEN_TTL_SECONDS: 15 * 60,
    SERVICE_TOKEN_TTL_SECONDS: 5 * 60,
    EXCHANGE: 'abeon.events',
    DLX_EXCHANGE: 'abeon.events.dlx',
} as const;
