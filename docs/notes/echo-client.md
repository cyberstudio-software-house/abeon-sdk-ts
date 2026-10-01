# Echo client

Background for `src/client/websocket.ts`.

## ws and wss ports

H5: ws and wss ports may differ (TLS termination at sidecar/ingress). Both default to the value
parsed from `wsUrl`, but explicit overrides are allowed — otherwise Pusher fails over to ws on a
wss-only port (or vice versa) and silently never connects.

## Installing Pusher on `window`

H3: install Pusher on window only when missing. Overwriting silently breaks apps that vendor their
own Pusher instance (e.g. when two bundles co-exist during a phased deploy, or when an app uses
pusher-js for non-Reverb use cases alongside Reverb).

## `auth.headers`

Omitted rather than set to `undefined`: pusher-js reads `auth.params` without checking, so passing
the key with no value fails the first subscription with "Cannot use 'in' operator to search for
'params' in undefined".
