#!/usr/bin/env tsx
/**
 * Fixtures Build CLI
 *
 * Compiles fixture source files into deployable SQL.
 *
 * Usage:
 *   npm run fixtures:build system
 *   npm run fixtures:build demo
 *   npm run fixtures:build all    # Builds all fixtures
 */

import { FixtureBuilder } from '../src/lib/fixtures/builder.js';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const FIXTURES_DIR = join(process.cwd(), 'fixtures');

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Fixtures Build Script

Usage:
  npm run fixtures:build <fixture-name>
  npm run fixtures:build all

Arguments:
  fixture-name    Name of the fixture to build (system, testing, demo)
  all             Build all fixtures

Examples:
  npm run fixtures:build system
  npm run fixtures:build demo
  npm run fixtures:build all
        `);
        process.exit(0);
    }

    const fixtureName = args[0];

    try {
        if (fixtureName === 'all') {
            // Build all fixtures
            const fixtures = getAvailableFixtures();
            console.log(`Building ${fixtures.length} fixtures: ${fixtures.join(', ')}\n`);

            for (const fixture of fixtures) {
                await buildFixture(fixture);
            }

            console.log(`\n✓ All fixtures built successfully`);
        } else {
            // Build single fixture
            await buildFixture(fixtureName);
        }

        process.exit(0);
    } catch (error) {
        console.error('Build failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

async function buildFixture(fixtureName: string): Promise<void> {
    const builder = new FixtureBuilder();
    await builder.build(fixtureName);
}

function getAvailableFixtures(): string[] {
    const entries = readdirSync(FIXTURES_DIR, { withFileTypes: true });

    return entries
        .filter((entry) => {
            if (!entry.isDirectory()) return false;
            if (entry.name === 'infrastructure') return false; // Skip infrastructure
            if (entry.name.startsWith('.')) return false; // Skip hidden dirs

            // Check if it has a load.sql file
            const loadSqlPath = join(FIXTURES_DIR, entry.name, 'load.sql');
            try {
                statSync(loadSqlPath);
                return true;
            } catch {
                return false;
            }
        })
        .map((entry) => entry.name)
        .sort();
}

main();
