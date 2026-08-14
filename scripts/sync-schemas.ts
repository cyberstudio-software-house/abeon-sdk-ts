/**
 * Vendored copy of JSON schemas from sibling repo `abeon-sdk-php`.
 *
 * Usage:
 *   npm run sync-schemas         → copy + report changes
 *   npm run sync-schemas:check   → CI mode: fail if local differs from source
 *
 * Source of truth: `../abeon-sdk-php/schemas/`.
 * Drift between PHP and TS is caught by contract tests in CI:
 *   - PHP side validates fixtures against the same schema.
 *   - TS side validates the same fixtures (via ajv) against the vendored copy.
 * If both pass with the same fixtures, contracts are aligned.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE_DIR = resolve(ROOT, '..', 'abeon-sdk-php', 'schemas');
const TARGET_DIR = resolve(ROOT, 'schemas');

const checkMode = process.argv.includes('--check');

interface SyncStats {
    added: string[];
    modified: string[];
    unchanged: string[];
    invalidJson: string[];
}

function walk(dir: string, base: string = dir): string[] {
    const out: string[] = [];
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            out.push(...walk(full, base));
        } else if (entry.endsWith('.json')) {
            out.push(relative(base, full));
        }
    }
    return out;
}

function ensureDir(path: string): void {
    if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
    }
}

function syncFile(relativePath: string, stats: SyncStats): void {
    const sourcePath = join(SOURCE_DIR, relativePath);
    const targetPath = join(TARGET_DIR, relativePath);
    const sourceContent = readFileSync(sourcePath, 'utf8');

    try {
        JSON.parse(sourceContent);
    } catch {
        stats.invalidJson.push(relativePath);
        return;
    }

    if (!existsSync(targetPath)) {
        if (!checkMode) {
            ensureDir(dirname(targetPath));
            writeFileSync(targetPath, sourceContent);
        }
        stats.added.push(relativePath);
        return;
    }

    const targetContent = readFileSync(targetPath, 'utf8');
    if (sourceContent !== targetContent) {
        if (!checkMode) {
            writeFileSync(targetPath, sourceContent);
        }
        stats.modified.push(relativePath);
    } else {
        stats.unchanged.push(relativePath);
    }
}

/**
 * Compile every schema, to catch one that is not a valid JSON Schema.
 *
 * `fixtures/` is skipped: those files are *instances* — a user, a problem document, a
 * decoded token — and compiling a `{"id": "42"}` as a schema fails on the `id` keyword
 * rather than on anything real. They are still copied and still orphan-checked, which
 * is the point of them living in this tree; what they are validated *against* is their
 * schema, and both languages' contract tests do that.
 */
function validateSchemas(files: string[]): string[] {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats.default(ajv);
    const failures: string[] = [];

    for (const file of files.filter((f) => !f.startsWith('fixtures/'))) {
        const content = readFileSync(join(TARGET_DIR, file), 'utf8');
        try {
            ajv.compile(JSON.parse(content));
        } catch (err) {
            failures.push(`${file}: ${(err as Error).message}`);
        }
    }

    return failures;
}

function main(): void {
    if (!existsSync(SOURCE_DIR)) {
        console.error(`Source directory not found: ${SOURCE_DIR}`);
        console.error('This script expects abeon-sdk-php as a sibling directory.');
        process.exit(1);
    }

    const files = walk(SOURCE_DIR);
    const stats: SyncStats = { added: [], modified: [], unchanged: [], invalidJson: [] };

    for (const file of files) {
        syncFile(file, stats);
    }

    // Detect orphaned files in target (present locally, missing in source).
    const orphans: string[] = [];
    if (existsSync(TARGET_DIR)) {
        const localFiles = walk(TARGET_DIR);
        for (const file of localFiles) {
            // `fixtures/` used to be excluded here, which meant the golden fixtures
            // could drift from the PHP side while this reported `orphaned: 0`. They now
            // live in the source tree like everything else, so the check covers them —
            // which is what makes "byte-identical to the SDK's" a mechanism rather than
            // a claim in a docblock.
            if (!files.includes(file)) {
                orphans.push(file);
            }
        }
    }

    console.log(`Source: ${SOURCE_DIR}`);
    console.log(`Target: ${TARGET_DIR}`);
    console.log(`Mode:   ${checkMode ? 'check (no writes)' : 'write'}`);
    console.log();
    console.log(`  unchanged:    ${stats.unchanged.length}`);
    console.log(`  modified:     ${stats.modified.length}${stats.modified.length ? ` (${stats.modified.join(', ')})` : ''}`);
    console.log(`  added:        ${stats.added.length}${stats.added.length ? ` (${stats.added.join(', ')})` : ''}`);
    console.log(`  invalid JSON: ${stats.invalidJson.length}${stats.invalidJson.length ? ` (${stats.invalidJson.join(', ')})` : ''}`);
    console.log(`  orphaned:     ${orphans.length}${orphans.length ? ` (${orphans.join(', ')})` : ''}`);

    // Validate that every schema is a parseable JSON Schema.
    const validationFailures = validateSchemas(files);
    if (validationFailures.length > 0) {
        console.error();
        console.error('Schema validation failures:');
        for (const failure of validationFailures) {
            console.error(`  ${failure}`);
        }
    }

    const hasDrift = stats.added.length + stats.modified.length + orphans.length > 0;
    const hasErrors = stats.invalidJson.length + validationFailures.length > 0;

    if (checkMode && hasDrift) {
        console.error();
        console.error('DRIFT DETECTED — run `npm run sync-schemas` and commit.');
        process.exit(1);
    }

    if (hasErrors) {
        process.exit(1);
    }

    console.log();
    console.log(checkMode ? 'OK — in sync.' : 'OK — synced.');
}

main();
