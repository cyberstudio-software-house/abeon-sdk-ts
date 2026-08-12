# Changelog

All notable changes to `@abeon/shared` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this package is pre-1.0.

## [Unreleased]

### 2026-08-12 — tenant state and switching (ADR-0016 / ADR-0017)

The chrome half of multi-tenancy. Until now nothing in this package knew organisations existed.

#### Added
- **`useTenant()` + `<TenantProvider>`** — `{ tenants, currentTenant, canSwitch, loading, switching,
  error, refresh, switchTenant }`. Mirrors `useApps`/`AppsProvider`: hoisted to a single fetch when the
  provider is mounted, with a standalone fallback so the hook works on its own.
  - `switchTenant(orgId)` posts to Auth, which verifies membership and **re-issues the token** with the
    target membership's roles and permissions. The client never asserts its own tenant — `org_id` is an
    authorization dimension, so a client-side selection would be a client choosing its own authorisation.
  - `canSwitch` is false for a single-organisation user, who should see a label rather than a menu.
  - A refused switch (403 for a non-membership) surfaces on `error` and leaves auth and the current
    organisation untouched. Being refused is a normal outcome, not a broken session.
- **`Tenant` type** mirroring `schemas/dto/tenant.json`. Carries no roles or permissions by contract —
  it is a display list, and authorisation arrives only in the re-issued token.
- **`tenantEpoch` on the Abeon context** — the invalidation signal for tenant-scoped state. A counter
  rather than an event emitter, so it composes with React's dependency tracking: a hook opts in by
  listing it, and nothing subscribes or unsubscribes.

#### Changed
- **`useApps` re-derives on switch.** `/apps` returns `tenant_apps` ∩ permissions (ADR-0010 as amended),
  so both halves change and a stale list is a wrong list.
- **`usePreferences` re-fetches on switch** — preferences are per-user-per-organisation (ADR-0009 as
  amended). Pinned apps especially: a pin to `/crm/contacts` is meaningless in an organisation with no CRM.

8 new tests, including one that asserts the app list actually re-derives — verified to fail when the
epoch dependency is removed, so it is a real guard rather than a passing assertion.

### 2026-08-12 — multi-tenancy contract sync

Mirrors the contract changes from `abeon/sdk` (ADR-0016 to ADR-0021). See
`../abeon-adr-reconciliation-plan-2026-08-12.md`.

#### Changed
- Vendored schemas re-synced: `auth/jwt-user.json` (`org_id` now **required and non-null**),
  `auth/jwt-service.json` (optional `org_id`), `dto/user.json` (`org_id` a required key),
  `events/_envelope.json` (new required top-level `org_id`), plus the new `events/app-registered.json`.
- `src/types/jwt.ts` — `UserJwtPayload.org_id` is now `number` (was `number | null` and optional);
  `ServiceJwtPayload` gains optional `org_id`.
- `schemas/fixtures/envelope.json` — carries `org_id`, kept byte-identical with the PHP golden fixture.

#### Not yet done (tracked in `../abeon-sdk-delta-2026-08-12.md`)
The chrome has **no tenant awareness at all**: `AbeonContextValue` is still `{user, setUser, apiClient}`,
and none of the exported hooks knows about organisations. Still needed: tenant state in the provider, a
`useTenant()` hook, the switch flow against the new Auth endpoint (ADR-0017), app re-derivation on
switch, per-organisation preferences and per-organisation store installs.

#### Added
- Contract guards locking `org_id` in place: the event envelope and the user JWT are rejected without
  it, a null `org_id` is rejected on a user JWT, a **null envelope `org_id` is accepted** (platform-level
  events), and the service JWT may legitimately omit it. Without these a later edit could quietly relax
  the requirement while every other test still passed.

**Verified:** 154/154 tests, `tsc --noEmit` clean, `sync-schemas:check` in sync (14 files).

### 2026-05-27 — schema sync

#### Added
- Vendored 3 schemas that had drifted out of sync with the source of truth
  (`abeon-sdk-php/schemas/`), via `npm run sync-schemas`:
  - `schemas/dto/notification.json`
  - `schemas/dto/preferences.json`
  - `schemas/events/notification-requested.json`

  The hand-written TS types for these already existed; only the vendored schema
  copies were missing. `npm run sync-schemas:check` is now green and `npm test`
  passes (136 tests). See `../abeon-base-hardening-2026-05-27.md`.

#### Known issue (deferred)
- `scripts/sync-schemas.ts` crashes (`ENOENT`) on "added" files in `--check`
  mode instead of reporting drift and exiting non-zero. Currently masked (no
  drift). To be fixed alongside the notifications/preferences work.
