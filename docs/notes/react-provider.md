# React provider

Background for `src/react/provider.tsx`.

## Validating `initialAuth`

M6: validate initialAuth shape at the entry point. Most callers pass the result of
`getServerAuthContext()` directly — but a typo, an old SSR helper, or hydration from a stale cache
may yield something that type-checks `User` only by structural coincidence. Bad shape → render as
anonymous rather than crash a deep child accessing `user.roles`.

## Stable API client

C1: stable apiClient reference — recreates only when the caller swaps the `apiClient` prop, not
when `user` changes. Otherwise every `setUser` would mint a fresh client, busting downstream
`useEffect([api, ...])`.

## `tenantEpoch`

Invalidation signal for tenant-scoped state (ADR-0017). A counter rather than an event emitter: it
composes with React's own dependency tracking, so a hook opts in by listing it, and nothing needs
to subscribe or unsubscribe.

## Mounting `PreferencesProvider` here

So every `usePreferences()` (and `usePinnedItems()`) call inside the tree returns the SAME state
instance. A single PATCH then propagates instantly to every consumer (sidebar, settings page, theme
toggle, etc.) without anyone needing to re-fetch.
