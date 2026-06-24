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

import { readFileSync } from 'node:fs';
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
    { name: 'Permission DTO', schema: 'dto/permission.json', fixture: 'permission.json' },
    { name: 'Pagination DTO', schema: 'dto/pagination.json', fixture: 'pagination.json' },
    { name: 'AppDescriptor DTO', schema: 'dto/app-descriptor.json', fixture: 'app-descriptor.json' },
    { name: 'SearchResult DTO', schema: 'dto/search-result.json', fixture: 'search-result.json' },
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

describe('regression — fixture changes do not silently break', () => {
    it('a fixture mutation is caught by validator', () => {
        const validate = compile('dto/user.json');
        const bad = { ...loadJson(join(FIXTURES_DIR, 'user.json')) } as Record<string, unknown>;
        bad.id = 42; // canonical schema requires string
        expect(validate(bad)).toBe(false);
        expect(validate.errors).toBeDefined();
    });
});
