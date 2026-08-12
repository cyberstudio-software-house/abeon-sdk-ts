# Changelog

All notable changes to `@abeon/shared` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this package is pre-1.0.

## [Unreleased]

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
