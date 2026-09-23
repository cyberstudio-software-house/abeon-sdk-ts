# Changelog

All notable changes to `@abeon/sdk-ts` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this package is pre-1.0.

## [Unreleased]

Nothing yet.

## [0.11.0] — 2026-09-23

### Added

- Synced schemas for the public surface (ADR-0033): `public_host` on the instance order and the new
  `unified.app_instance.host_changed` event.

## [0.10.0] — 2026-09-23

### Added

- **`status`** on `AppDescriptor` and in the synced schemas (ADR-0031 §5), so the chrome can tell an
  application that is serving from one whose instance is still being built.

## [0.9.0] — 2026-09-23

### Added

- **`host`** on `Tenant` and in the synced schemas: where an organisation's applications are served
  (ADR-0031 §2). The tenant switcher sends the browser to that host rather than assuming the current
  one serves every organisation.

## [0.8.3] — 2026-09-18

### Added

- `events/auth.message.requested.json`, synced from `abeon/sdk` 0.6.1 — keeps the schema trees identical,
  which `sync-schemas:check` and `verify.sh` both assert.

## [0.8.2] — 2026-09-18

### Fixed

- **`useNotifications` listens for `.NotificationCreated`.** The default lacked Echo's leading dot, so the
  hook waited for a class-named event while AbeonUnified broadcasts with `broadcastAs` — socket connected,
  channel subscribed, nothing ever arrived.

## [0.8.1] — 2026-09-18

### Fixed

- **`createEcho` no longer passes `auth: undefined`.** pusher-js reads `auth.params` without checking, so
  the first channel subscription failed with "Cannot use 'in' operator to search for 'params' in
  undefined" — a client-side error that reads like a broken broadcasting server.

## [0.8.0] — 2026-09-18

### Added

- Types for transactional messages (`MessageDto`, `MessageRequestedPayload`, `MessageLocale`,
  `MessageStatus`) and `User.email_verified`, synced from `abeon/sdk` 0.6.0. ADR-0030, FR-4.

### Fixed

- **`useNotifications` no longer shows a notification twice** when the initial fetch and the broadcast
  race: incoming events are deduplicated by id and update the row in place instead of prepending a
  second copy under the same React key.

## [0.7.1] — 2026-09-18

### Fixed

- `tsc -p tsconfig.tests.json` failed on the new `useAdminUsers` paging test — the test only, no
  shipped code.

## [0.7.0] — 2026-09-17

### Added

- **Formatting** (`formatDate`, `formatCurrency`, `formatRelativeTime`) over `Intl`, Polish by default;
  each returns `''` for input it cannot read. Architecture §3.4.
- **Validators** `isValidNip`, `isValidRegon` (9 and 14 digits), `isValidPesel` (checksum and date),
  `isValidIban` (mod-97, country lengths), `isValidPolishPostalCode`.
- **`crossAppHref(appPath, path, query)`** — a third argument carries context between applications
  (§3.7), merged with any query in `path`, fragment kept. `CrossAppQuery` type.
- **`useAdminUsers({ query })`** with `filter.status`, `sort`, `page`, `perPage` (ADR-0004) and
  `pagination` in the result; `adminUsersQueryString`. Without a query nothing changes.

## [0.6.0] — 2026-09-17

### Added

- **`useNotificationPreferences()`** — the signed-in user's delivery rules from AbeonUnified
  (`/api/v1/notifications/preferences`): `preferences`, `refresh`, and `save`, which replaces the whole set.
  ADR-0028.
- Types `NotificationChannel`, `NotificationPreference`, `NotificationPreferenceChannels`,
  `NotificationPreferences`.
- Schemas synced from `abeon/sdk` 0.4.0: `channels` in `events/notification-requested.json`,
  `dto/notification-preferences.json`, and their fixtures, validated by the contract suite.

### Changed

- The README describes the package as the frontend half of the contract, as `docs/ARCHITECTURE.md` always
  did. ADR-0029.

## [0.5.0] — 2026-09-17

### Added

- **Pinned sections.** `ChromePreferences.pinnedSections` and `PinnedSection`; `usePinnedItems()` returns
  `sections` and `savePins({ pinned?, sections? })`, which writes both keys in one request so removing a
  section and moving its pins cannot half-happen.
- **The pin logic every application needs, in `@abeon/sdk-ts/client`**, moved out of the boilerplate:
  `addPin`, `removePin`, `isPinnedIn`, `arrangePins` (a drag within and between sections, keeping pins of
  applications this one does not show), `toSidebarPins` (with an optional caption such as the owning
  application's name), and `resolveSections`, `addSection`, `renameSection`, `removeSection` with
  `DEFAULT_SECTION_ID`. `order` is now a position within a section.
- `buildPinnedCommands()` puts a pin's `caption` in the command's `subtitle`.

## [0.4.0] — 2026-09-17

### Removed — breaking

- **`ChromePreferences.appOrder`**, and with it `useAppOrder().order` and `setOrder`. The field came from
  the MVP's app-order screen, whose "save" only showed a toast; here nothing set it and nothing read it,
  and the app switcher is ordered by the catalogue. ADR-0009 amended.

### Changed — breaking

- **`useAppOrder` is `usePinnedItems`** (`UseAppOrderReturn` → `UsePinnedItemsReturn`), returning
  `{ pinned, busy, setPinned }`. With the order gone the old name described nothing it did.

## [0.3.0] — 2026-09-17

### Changed — breaking for type consumers

- **`PinnedItem.app` is required.** Pins are stored once per user per organisation and shown by every
  application of it; without the owning application a pin to `/settings` opened whichever application
  rendered the sidebar, and two applications with a `settings` item shared one pin. Ids are now
  `{app}.{item}` (`pinId()`). The schema said `{app, path, label}` while every pin written was
  `{id, label, href, iconName, sectionId, order}`; both now describe the stored shape and a contract
  test compares them.

### Added

- `resolvePins(pinned, currentApp, apps)` and `pinId()` in `@abeon/sdk-ts/client`: pins of the current
  application are visited in place, pins of another application open with a full load under its
  path (`crossAppHref`), pins of applications the organisation does not have — or that predate the
  `app` field — are hidden without being deleted.
- `buildPinnedCommands()` passes the pin to `navigate` as a second argument.

### Fixed

- `useAppOrder().setPinned` and `setOrder` sent the whole `chrome` object from the render they were
  created in, so a pin saved while the sidebar was being collapsed restored the old
  `sidebarCollapsed`. They send only their own key now.
- `usePreferences().update()` merged into the state of the render it came from rather than the latest
  one, so a held callback briefly showed stale values even when it sent a single key.

## [0.2.0] — 2026-09-16

### Added

- `AbeonProvider` and `PreferencesProvider` accept `initialPreferences`. A version 1 document seeds the
  shared preferences state and the mount fetch is skipped, so a saved dark theme or collapsed sidebar
  no longer renders the defaults for the length of a request first. A tenant switch still re-fetches.
- `buildPinnedCommands()` and `buildAppCommands()` map pinned items and the `useApps()` catalogue to
  command-palette commands, with `pin.` and `app.` id prefixes. Until now only navigation was
  registered, so the palette could not reach an application or a pin.

## [0.1.0] — 2026-09-07

First tagged version. Everything below was already in use — four services and the
boilerplate consume this package through a symlink, so the code has been exercised
continuously — but nothing pointed at a fixed reference, so a fresh checkout could only
track a moving branch. The tag exists so the boilerplate can pin.

### 2026-09-07 — renamed from `abeon-shared` / `@abeon/shared`

Three names changed together, because the gap between them was the problem:

| | Before | After |
|---|---|---|
| directory | `abeon-shared/` | `abeon-sdk-ts/` |
| GitHub repository | `cyberstudio-software-house/abeon-shared` | `…/abeon-sdk-ts` |
| npm package | `@abeon/shared` | `@abeon/sdk-ts` |

This package is the platform's **TypeScript SDK** — the counterpart to `abeon-sdk-php`. "Shared" said
that something was shared, not what it was, and the asymmetry showed every time the two were named
together.

All three moved at once deliberately. `abeon-ui` already carries three names for one thing — the
directory `abeon-ui`, the published package `@cyberstudio-software-house/ui`, and the `@abeon/ui`
Vite alias — and that has cost time at least once. Repeating the pattern here would have imported a
known problem into a second place.

**No published version is affected.** The package is `private: true` and has never been published, so
there is nothing in a registry under the old name.

Every entry below this one was written while the package was called `@abeon/shared`. The names in
them were updated so the document reads consistently; the history of what changed and when is
unaffected.

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
