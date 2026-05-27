# Changelog

All notable changes to `@abeon/shared` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this package is pre-1.0.

## [Unreleased]

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
