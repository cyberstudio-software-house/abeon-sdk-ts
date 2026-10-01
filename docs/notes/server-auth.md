# Server auth helpers

Background for `src/server/auth.ts`.

## `onError`

H2: invoked when a token IS present but verification failed (network error reaching JWKS, key not
found, signature mismatch, expired, wrong iss/aud, wrong `type`, malformed JWT). Distinguishes
"user not logged in" (no token) from "user has a token but it's bad" — the latter usually wants a
logout/redirect, not a silent anonymous render. NOT called when the cookie is simply absent.

## Pinning RS256

H1: pin RS256 explicitly. Default jose behaviour accepts any algorithm advertised by the JWK,
which leaves a small surface for `alg: none` / HS256-with-public-key confusion attacks if a JWKS
endpoint is ever misconfigured. Abeon JWTs are RS256.

M11: jose accepts a generic for typed payload — no unsafe cast.

## Extracting `Set-Cookie`

H8: `package.json` `engines.node >= 20`, so `Headers#getSetCookie` is native. The old
`.get('set-cookie')` fallback collapsed multiple cookies into one comma-joined string and lost the
access/refresh split — actively wrong rather than degraded.

H6: drop any cookie containing CR/LF. Auth is internal and trusted, but we forward these straight
onto the outgoing NextResponse via `headers.append('Set-Cookie', ...)`. A stray newline from a
misbehaving upstream would split the response — defensive against header injection even from
"trusted" sources.
