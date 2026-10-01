# Notifications hook

Background for `src/react/use-notifications.ts`.

## What the hook does

Notifications for the Topbar bell — combines:

1. Initial fetch of recent notifications + unread count from REST.
2. Live updates via Echo private channel `user.{id}` (when an Echo instance is provided).
3. Optimistic mark-as-read REST mutations.

Channel binding is set up in useEffect with proper cleanup on unmount (`channel.stopListening`
+ `echo.leave`). No-op when the user is not authenticated.

## `EchoLike`

Minimal Echo-like interface that `useNotifications` consumes. The actual `Echo` from
`laravel-echo` matches this structurally — we keep the type loose so tests can inject a fake
without depending on Echo internals.

## `eventName` and the leading dot

The leading dot is Echo's "this is the broadcast name, not a class name" marker. AbeonUnified
broadcasts with `broadcastAs('NotificationCreated')` (ADR-0006), so without the dot Echo listens
for `App\Events\NotificationCreated` and the bell silently never updates — the socket connects,
the channel subscribes, nothing arrives.

## The unread count has three sources

Three sources, in order of how much they know.

ADR-0006 names this field `unread_count`. It was read as `count` here until 2026-08-13, and the
dev stub copied the hook rather than the ADR, so nothing disagreed until a real service served
the contract shape.

The list already carries the authoritative count in `meta`, and the hook was throwing it away.
Until 2026-08-15 a failing `/unread-count` — a 401 while the token was being refreshed, a
timeout, anything — was swallowed by `.catch(() => null)` and the badge fell straight to counting
the loaded page.

Counting the loaded page is the last resort, and genuinely wrong rather than merely approximate.
A page is 20 items newest-first, so somebody whose 20 most recent are read and whose older ones
are not gets **zero** — a silent bell, with `error` still null because the failure was already
caught. It exists for a service that has no count endpoint at all.

## Broadcast payloads

M5: validate WS payload shape at runtime. Reverb delivers whatever the backend broadcasts — a
contract drift on the PHP side would otherwise corrupt React state silently. The check is
lightweight (~5 fields), not a full JSON Schema validation.

`extractNotification` is that lightweight runtime validator. Laravel Reverb may deliver the
NotificationDto directly or wrapped as `{ notification: NotificationDto }` (depending on
broadcast format). It returns null when the payload doesn't carry a usable shape — the handler
skips instead of corrupting state.

## Deduplicating broadcasts against the fetched page

The same notification can arrive twice — the initial fetch and the broadcast race each other —
and React then renders two rows under one key. The set of ids is kept outside state so two events
in one tick still see each other.
