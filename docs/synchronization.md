# Synchronization — PHP ↔ TS contract

This document captures how the canonical JSON schemas stay aligned between `abeon-sdk-php` (source of truth) and `abeon-shared` (vendored copy + hand-written TS types).

## Source of truth

**`abeon-sdk-php/schemas/`** holds the canonical JSON Schema 2020-12 documents:

```
abeon-sdk-php/schemas/
├── auth/{jwt-user,jwt-service}.json
├── dto/{user,permission,pagination,app-descriptor}.json
├── events/_envelope.json
├── http/{envelope,problem-details}.json
└── fixtures/                              ← golden test fixtures
```

The PHP side validates fixtures against these schemas in its contract tests (planned, Sprint 0 verification). The TS side validates the SAME fixtures (vendored copies) against the SAME schemas in `tests/contract/schema-fixtures.test.ts`. When both pass, the contract is end-to-end aligned.

## Flow — changing a contract

Scenario: you need to add a new field to `User` DTO.

1. **Edit the schema** in `abeon-sdk-php/schemas/dto/user.json`:
   ```diff
     "required": ["id", "email", "roles", "permissions"],
     "properties": {
       "id":          { "type": "string" },
   +   "avatar_url":  { "type": ["string", "null"] },
       ...
   ```

2. **Update PHP DTO** in `abeon-sdk-php/src/DTO/User.php`:
   ```diff
     public function __construct(
         public string $id,
   +     public ?string $avatarUrl,
         ...
     ) {}
   ```
   PHP contract tests must still pass.

3. **Sync to TS**:
   ```bash
   cd abeon-shared
   npm run sync-schemas
   ```
   Output shows `modified: 1 (dto/user.json)`.

4. **Update TS type** in `abeon-shared/src/types/user.ts`:
   ```diff
     export interface User {
         id: string;
   +    avatar_url: string | null;
         ...
     }
   ```

5. **Update fixture** in `abeon-shared/schemas/fixtures/user.json` (and the equivalent in PHP repo if maintained separately):
   ```diff
     {
       "id": "42",
   +   "avatar_url": "https://cdn.abeon.pl/avatars/42.jpg",
       ...
     }
   ```

6. **Run contract tests**:
   ```bash
   npm test
   ```
   Both `schema ↔ fixture contract` and unit tests must pass.

7. **Commit in BOTH repos** in the same PR cycle. Composer + npm version bumps follow SemVer (additive = minor; breaking = major). See [Versioning](#versioning).

## `sync-schemas` script

`scripts/sync-schemas.ts` is a thin Node CLI:

- Reads `../abeon-sdk-php/schemas/` recursively.
- For each `*.json`, validates it parses as JSON Schema 2020-12 via ajv.
- Copies to `abeon-shared/schemas/` preserving directory structure.
- Reports added / modified / unchanged / invalid-JSON / orphaned files.
- Skips `fixtures/` from orphan detection (TS may maintain extra test fixtures).

Modes:

| Command | Behavior |
|---|---|
| `npm run sync-schemas` | Default — copy + report. Run after editing PHP schemas. |
| `npm run sync-schemas:check` | CI mode — no writes. Exit 1 on drift. |

CI workflow (`/.github/workflows/ci.yml`) checks out **both** `abeon-shared` and `abeon-sdk-php` as sibling directories and runs `sync-schemas:check`. Drift = red CI.

## Versioning

`@abeon/shared` follows SemVer paired with `abeon/sdk`:

- **Same major version** = same contract era (1.x ↔ 1.x).
- **Additive change** in schema (new optional field) → minor bump in BOTH repos.
- **Breaking change** in schema (rename, type change, removed required field) → major bump in BOTH repos, with the standard 3-month coexistence window documented in [ADR-0004](../../abeon-sdk-php/docs/adr/0004-rest-envelope-and-errors.md).

`README.md` includes a compatibility matrix that's maintained per release.

## Why not codegen?

Hand-written types are intentional for Phase 0:

| Approach | Trade-off |
|---|---|
| **Hand-written (current)** | Low ceremony, easy to add JSDoc/business comments, IDE-friendly, drift caught by contract tests. Manual update on every schema change (2-3 minutes). |
| **Codegen with json-schema-to-typescript** | Zero drift guaranteed, but adds a build step, output is harder to read (anonymous unions), generates broader types than usable shapes, lost JSDoc. |
| **OpenAPI as source of truth** | Heavier overall, doesn't cover event payloads well (oneOf union over routing keys is verbose). |

Codegen revisit is planned for Phase 1+ when schemas stabilize and we have enough events to make the manual maintenance painful.

## Naming convention

| Repo | Schema file | TS type | PHP DTO |
|---|---|---|---|
| Both | `dto/user.json` | `User` in `src/types/user.ts` | `Abeon\SDK\DTO\User` |
| Both | `events/_envelope.json` | `EventEnvelope<T>` | `Abeon\SDK\Events\EnvelopeBuilder` produces, `Event::fromEnvelope()` parses |
| TS-only | `events/crm.contact.created.json` (in service repo) | `CrmContactCreatedPayload` (in `@abeon/crm-events`) | Service repo |

Per-domain event schemas (e.g. `crm.contact.created.json`) live in **each service's repo** and are federated via composer / npm metadata — see [`events-catalog.md`](../../abeon-sdk-php/docs/events-catalog.md) in the PHP SDK.

## Related

- [Phase 0 plan §H](../../abeon-shared-phase0-plan.md) — synchronization decision in TS plan.
- [ADR-0002 (PHP SDK)](../../abeon-sdk-php/docs/adr/0002-event-envelope.md) — envelope contract.
- [PHP events catalog](../../abeon-sdk-php/docs/events-catalog.md) — federation convention for per-event payload schemas.
