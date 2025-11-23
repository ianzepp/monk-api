import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Fixture Builder Options
 */
export interface BuildOptions {
    /**
     * Enable optimizations (INSERT → COPY conversion, etc.)
     * Future enhancement - currently placeholder
     */
    optimize?: boolean;

    /**
     * Output directory for compiled fixtures
     * Defaults to fixtures/<name>/ (alongside source files)
     */
    outputDir?: string;
}

/**
 * Fixture Builder
 *
 * Compiles fixture source files into optimized, deployable SQL.
 *
 * Process:
 * 1. Read load.sql (master file with \ir directives)
 * 2. Inline all \ir (include relative) directives
 * 3. Add parameterization for database/schema
 * 4. Optionally optimize (placeholder for future)
 * 5. Write to fixtures/<name>/deploy.sql
 *
 * Example:
 *   const builder = new FixtureBuilder();
 *   await builder.build('system');
 *   // Creates: fixtures/system/deploy.sql
 */
export class FixtureBuilder {
    /**
     * Build (compile) a fixture into optimized SQL
     *
     * @param fixtureName - Name of fixture (system, crm, etc.)
     * @param options - Build options
     */
    async build(fixtureName: string, options: BuildOptions = {}): Promise<void> {
        console.log(`Building fixture: ${fixtureName}`);

        const fixturePath = join(process.cwd(), 'fixtures', fixtureName);
        const outputDir = options.outputDir || fixturePath;
        const outputPath = join(outputDir, 'deploy.sql');

        // 1. Read load.sql (master file)
        const loadSqlPath = join(fixturePath, 'load.sql');
        const loadSql = await readFile(loadSqlPath, 'utf-8');

        // 2. Parse \ir directives and inline referenced files
        const compiled = await this.inlineIncludes(fixturePath, loadSql);

        // 3. Add parameterization
        const parameterized = this.addParameterization(compiled, fixtureName);

        // 4. Optimize (future)
        const optimized = options.optimize ? this.optimize(parameterized) : parameterized;

        // 5. Write output
        await mkdir(outputDir, { recursive: true });
        await writeFile(outputPath, optimized, 'utf-8');

        console.log(`✓ Compiled: ${outputPath}`);
    }

    /**
     * Inline all \ir (include relative) directives
     *
     * Recursively processes \ir directives in SQL files, replacing them
     * with the contents of the referenced files.
     *
     * @param basePath - Base directory for resolving relative paths
     * @param sql - SQL content with \ir directives
     * @returns SQL with all includes inlined
     * @private
     */
    private async inlineIncludes(basePath: string, sql: string): Promise<string> {
        const lines = sql.split('\n');
        const result: string[] = [];

        for (let line of lines) {
            // Match: \ir path/to/file.sql (with optional inline comments)
            const includeMatch = line.match(/^\\ir\s+(.+)$/);

            if (includeMatch) {
                // Extract path and strip inline SQL comments
                let relativePath = includeMatch[1].trim();

                // Remove inline comments (-- ...)
                const commentIndex = relativePath.indexOf('--');
                if (commentIndex !== -1) {
                    relativePath = relativePath.substring(0, commentIndex).trim();
                }
                const fullPath = join(basePath, relativePath);

                try {
                    const content = await readFile(fullPath, 'utf-8');
                    result.push(`-- BEGIN: ${relativePath}`);
                    result.push(content);
                    result.push(`-- END: ${relativePath}`);
                } catch (error) {
                    console.warn(`Warning: Could not read ${relativePath}`);
                    // Convert failed \ir to comment (psql meta-command won't work with pg.Client)
                    result.push(`-- MISSING: ${line}`);
                }
            } else {
                // Convert psql meta-commands to SQL comments
                // These don't work with pg.Client, only with psql CLI
                if (line.match(/^\\echo\s+/)) {
                    line = line.replace(/^\\echo\s+/, '-- ECHO: ');
                } else if (line.match(/^\\set\s+/)) {
                    line = line.replace(/^\\set\s+/, '-- SET: ');
                }

                result.push(line);
            }
        }

        return result.join('\n');
    }

    /**
     * Add parameterization for database/schema
     *
     * Wraps the fixture SQL in:
     * - Transaction (BEGIN/COMMIT)
     * - Schema creation
     * - Search path configuration
     * - Placeholder parameters (:database, :schema)
     *
     * @param sql - Compiled SQL content
     * @param fixtureName - Name of the fixture
     * @returns Parameterized SQL
     * @private
     */
    private addParameterization(sql: string, fixtureName: string): string {
        const header = `-- Compiled Fixture: ${fixtureName}
-- Generated: ${new Date().toISOString()}
-- Parameters: :database, :schema
--
-- Usage:
--   Replace :database and :schema placeholders before execution
--   Example: sed 's/:database/db_main/g; s/:schema/ns_tenant_abc123/g' deploy.sql | psql

BEGIN;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS :schema;

-- Set search path to target schema
SET search_path TO :schema, public;

`;
        const footer = `
COMMIT;
`;

        return header + sql + footer;
    }

    /**
     * Optimize SQL (future enhancement)
     *
     * Planned optimizations:
     * - Convert INSERT statements to COPY (5-10x faster)
     * - Reorder operations for performance
     * - Defer index creation until after data load
     *
     * @param sql - Parameterized SQL
     * @returns Optimized SQL
     * @private
     */
    private optimize(sql: string): string {
        // TODO: Implement optimizations
        // For now, just return as-is
        return sql;
    }
}
