/**
 * Contract tests: every fixture in `schemas/fixtures/` validates cleanly
 * against the canonical schema it represents.
 *
 * The same fixture files are validated on the PHP side against the same
 * source schemas (`abeon-sdk-php/schemas/`). When both sides pass, the
 * contract is aligned end-to-end.
 *
 * Failure here means: either the fixture is wrong, or the schema drifted.
 * Run `npm run sync-schemas` first to rule out drift, then investigate.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { describe, expect, it } from 'vitest';

const SCHEMAS_DIR = join(__dirname, '..', '..', 'schemas');
const FIXTURES_DIR = join(SCHEMAS_DIR, 'fixtures');

function loadJson<T = unknown>(path: string): T {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function ajv(): Ajv2020 {
    const instance = new Ajv2020({ strict: false, allErrors: true });
    addFormats.default(instance);
    return instance;
}

function compile(schemaPath: string): ValidateFunction {
    return ajv().compile(loadJson(join(SCHEMAS_DIR, schemaPath)));
}

interface Case {
    name: string;
    schema: string;
    fixture: string;
}

const cases: Case[] = [
    { name: 'User DTO', schema: 'dto/user.json', fixture: 'user.json' },
    { name: 'Tenant DTO', schema: 'dto/tenant.json', fixture: 'tenant.json' },
    { name: 'Permission DTO', schema: 'dto/permission.json', fixture: 'permission.json' },
    { name: 'Pagination DTO', schema: 'dto/pagination.json', fixture: 'pagination.json' },
    { name: 'AppDescriptor DTO', schema: 'dto/app-descriptor.json', fixture: 'app-descriptor.json' },
    { name: 'SearchResult DTO', schema: 'dto/search-result.json', fixture: 'search-result.json' },
    {
        name: 'OrganisationMember DTO',
        schema: 'dto/organisation-member.json',
        fixture: 'organisation-member.json',
    },
    { name: 'Organisation DTO', schema: 'dto/organisation.json', fixture: 'organisation.json' },
    { name: 'Role DTO', schema: 'dto/role.json', fixture: 'role.json' },
    { name: 'Event envelope', schema: 'events/_envelope.json', fixture: 'envelope.json' },
    { name: 'REST envelope', schema: 'http/envelope.json', fixture: 'envelope-rest.json' },
    { name: 'Problem details', schema: 'http/problem-details.json', fixture: 'problem-details.json' },
    { name: 'User JWT payload', schema: 'auth/jwt-user.json', fixture: 'jwt-user-decoded.json' },
    { name: 'Service JWT payload', schema: 'auth/jwt-service.json', fixture: 'jwt-service-decoded.json' },
];

describe('schema ↔ fixture contract', () => {
    for (const c of cases) {
        it(`${c.name}: ${c.fixture} validates against ${c.schema}`, () => {
            const validate = compile(c.schema);
            const fixture = loadJson(join(FIXTURES_DIR, c.fixture));
            const ok = validate(fixture);
            if (!ok) {
                throw new Error(
                    `${c.fixture} failed validation:\n${JSON.stringify(validate.errors, null, 2)}`,
                );
            }
            expect(ok).toBe(true);
        });
    }
});

describe('every fixture is actually validated', () => {
    it('no fixture is missing from the case list', () => {
        // The list above is hand-maintained, so a fixture added to `schemas/fixtures/`
        // is synced by `sync-schemas`, validated on the PHP side, and validated *here*
        // by nobody — the suite stays green while one side of the contract goes
        // unchecked. That happened to `organisation.json` the moment it was added.
        const onDisk = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
        const covered = new Set(cases.map((c) => c.fixture));

        expect(onDisk.filter((f) => !covered.has(f))).toEqual([]);
    });
});

describe('regression — fixture changes do not silently break', () => {
    it('a fixture mutation is caught by validator', () => {
        const validate = compile('dto/user.json');
        const bad = { ...loadJson(join(FIXTURES_DIR, 'user.json')) } as Record<string, unknown>;
        bad.id = 42; // canonical schema requires string
        expect(validate(bad)).toBe(false);
        expect(validate.errors).toBeDefined();
    });
});

/**
 * `org_id` is the authorization and data-scoping dimension (ADR-0016). These lock
 * in that it stays required, so a later edit cannot quietly relax it while every
 * other test still passes.
 */
describe('multi-tenancy — org_id stays required', () => {
    function without(fixture: string, key: string): Record<string, unknown> {
        const copy = { ...loadJson<Record<string, unknown>>(join(FIXTURES_DIR, fixture)) };
        delete copy[key];
        return copy;
    }

    it('event envelope without org_id is rejected', () => {
        // A consumer has no request context and no AuthContext, so the envelope is
        // its only possible source of tenant (ADR-0018).
        expect(compile('events/_envelope.json')(without('envelope.json', 'org_id'))).toBe(false);
    });

    it('event envelope accepts a null org_id for platform-level events', () => {
        const platform = {
            ...loadJson<Record<string, unknown>>(join(FIXTURES_DIR, 'envelope.json')),
            org_id: null,
        };
        // null = "no organisation", not "all organisations". Consumers that need a
        // tenant must refuse it; the envelope itself is well-formed.
        expect(compile('events/_envelope.json')(platform)).toBe(true);
    });

    it('user DTO without org_id is rejected', () => {
        expect(compile('dto/user.json')(without('user.json', 'org_id'))).toBe(false);
    });

    it('an organisation member row cannot carry a global user status', () => {
        // The whole administration surface rests on the membership and the user being
        // different things. `deleted` is a value `users.status` has and a membership
        // does not, so accepting it here would let one organisation's screen present a
        // platform-wide decision as its own.
        const bad = {
            ...loadJson<Record<string, unknown>>(join(FIXTURES_DIR, 'organisation-member.json')),
            status: 'deleted',
        };
        expect(compile('dto/organisation-member.json')(bad)).toBe(false);
    });

    it('user JWT without org_id is rejected', () => {
        expect(compile('auth/jwt-user.json')(without('jwt-user-decoded.json', 'org_id'))).toBe(false);
    });

    it('user JWT with a null org_id is rejected', () => {
        const nulled = {
            ...loadJson<Record<string, unknown>>(join(FIXTURES_DIR, 'jwt-user-decoded.json')),
            org_id: null,
        };
        // A user token is always scoped to exactly one organisation.
        expect(compile('auth/jwt-user.json')(nulled)).toBe(false);
    });

    it('service JWT may omit org_id — organisation-less work is legitimate', () => {
        // Registry self-registration, health probes, scheduled maintenance.
        expect(
            compile('auth/jwt-service.json')(without('jwt-service-decoded.json', 'org_id')),
        ).toBe(true);
    });
});
