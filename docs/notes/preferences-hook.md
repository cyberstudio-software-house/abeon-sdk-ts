# Preferences hook

Background for `src/react/use-preferences.tsx`.

## `PreferencesProvider`

Optional provider that hosts one `usePreferences()` state instance for the subtree, so every
`usePreferences()` call inside it returns the same state — one PATCH propagates instantly to every
component.

`<AbeonProvider>` mounts this automatically, so consumer apps don't have to wire it themselves. Use
it directly only in tests or when isolating a subtree from the shared cache.

## `usePreferences()` behaviour

Hook for the user's preferences blob (chrome layout, theme, pinned items, cross-app settings).
Wraps `GET / PATCH /api/v1/auth/me/preferences`.

- Inside `<PreferencesProvider>` (auto-mounted by `<AbeonProvider>`), every call returns the SHARED
  state — one update propagates immediately to every consumer. This is the normal case.
- Without a provider, falls back to per-instance local state (back-compat for tests / standalone
  usage). Each caller fetches independently.
- When unauthenticated, returns defaults and no-ops on writes.
- `update()` is optimistic: state updates before the PATCH completes; a failed PATCH restores the
  previous state and surfaces the error.

## Re-fetching on a tenant switch

`tenantEpoch`: preferences are per-user-per-organisation (ADR-0009 as amended by ADR-0016), so a
switch must re-fetch them. Pinned apps in particular are meaningless across organisations — a pin
to `/crm/contacts` means nothing in an organisation that has no CRM.
