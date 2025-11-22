/**
 * DDL Indexes Observer - Ring 6 PostDatabase
 *
 * Manages index creation/deletion based on index, unique, and searchable flags.
 * Runs after column DDL operations to create/drop indexes as needed.
 *
 * Priority 20 (after column DDL at priority 10) to ensure column exists first.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';
import { SqlUtils } from '@src/lib/observers/sql-utils.js';
import { isSystemField } from '@src/lib/describe.js';
import { SchemaCache } from '@src/lib/schema-cache.js';
import type { SchemaRecord } from '@src/lib/schema-record.js';

export default class DdlIndexesObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['create', 'update', 'delete'] as const;
    readonly priority = 20;  // After column DDL (priority 10)

    async executeOne(record: SchemaRecord, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { schema_name, column_name } = record;

        // Load schema from cache to check if external
        const schema = await SchemaCache.getInstance().getSchema(system, schema_name);

        // Skip DDL operations for external schemas (managed elsewhere)
        if (schema.external === true) {
            console.info(`Skipping DDL operation for external schema column: ${schema_name}.${column_name}`);
            return;
        }

        // Skip system fields - they cannot have user-defined indexes
        if (isSystemField(column_name)) {
            return;
        }

        const operation = context.operation;

        if (operation === 'create') {
            await this.handleCreate(record, system, schema_name, column_name);
        } else if (operation === 'update') {
            await this.handleUpdate(record, context, system, schema_name, column_name);
        } else if (operation === 'delete') {
            await this.handleDelete(record, system, schema_name, column_name);
        }
    }

    /**
     * Create indexes on column creation if flags are set
     */
    private async handleCreate(record: any, system: any, schema_name: string, column_name: string): Promise<void> {
        const pool = SqlUtils.getPool(system);

        // Create unique index if unique flag is set
        if (record.unique === true) {
            const indexName = `${schema_name}_${column_name}_unique_idx`;
            const ddl = `CREATE UNIQUE INDEX IF NOT EXISTS "${indexName}" ON "${schema_name}" ("${column_name}")`;

            try {
                await pool.query(ddl);
                console.info(`Created unique index: ${indexName}`);
            } catch (error) {
                throw new SystemError(
                    `Failed to create unique index on ${schema_name}.${column_name}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        // Create standard index if index flag is set
        if (record.index === true) {
            const indexName = `${schema_name}_${column_name}_idx`;
            const ddl = `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${schema_name}" ("${column_name}")`;

            try {
                await pool.query(ddl);
                console.info(`Created index: ${indexName}`);
            } catch (error) {
                throw new SystemError(
                    `Failed to create index on ${schema_name}.${column_name}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        // Create full-text search index if searchable flag is set
        if (record.searchable === true) {
            const indexName = `${schema_name}_${column_name}_search_idx`;
            const ddl = `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${schema_name}" USING GIN (to_tsvector('english', "${column_name}"))`;

            try {
                await pool.query(ddl);
                console.info(`Created full-text search index: ${indexName}`);
            } catch (error) {
                throw new SystemError(
                    `Failed to create search index on ${schema_name}.${column_name}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    }

    /**
     * Update indexes when flags change
     */
    private async handleUpdate(record: any, context: ObserverContext, system: any, schema_name: string, column_name: string): Promise<void> {
        const pool = SqlUtils.getPool(system);

        // Handle unique index changes using SchemaRecord's change tracking
        await this.handleIndexChange(
            pool,
            schema_name,
            column_name,
            'unique',
            Boolean(record.getOriginal('unique')),
            Boolean(record.get('unique')),
            `${schema_name}_${column_name}_unique_idx`,
            `CREATE UNIQUE INDEX IF NOT EXISTS "${schema_name}_${column_name}_unique_idx" ON "${schema_name}" ("${column_name}")`
        );

        // Handle standard index changes
        await this.handleIndexChange(
            pool,
            schema_name,
            column_name,
            'index',
            Boolean(record.getOriginal('index')),
            Boolean(record.get('index')),
            `${schema_name}_${column_name}_idx`,
            `CREATE INDEX IF NOT EXISTS "${schema_name}_${column_name}_idx" ON "${schema_name}" ("${column_name}")`
        );

        // Handle searchable index changes
        await this.handleIndexChange(
            pool,
            schema_name,
            column_name,
            'searchable',
            Boolean(record.getOriginal('searchable')),
            Boolean(record.get('searchable')),
            `${schema_name}_${column_name}_search_idx`,
            `CREATE INDEX IF NOT EXISTS "${schema_name}_${column_name}_search_idx" ON "${schema_name}" USING GIN (to_tsvector('english', "${column_name}"))`
        );
    }

    /**
     * Helper to handle index creation/deletion on flag change
     */
    private async handleIndexChange(
        pool: any,
        schema_name: string,
        column_name: string,
        flagName: string,
        oldValue: boolean,
        newValue: boolean,
        indexName: string,
        createDdl: string
    ): Promise<void> {
        if (oldValue === newValue) {
            return; // No change
        }

        try {
            if (newValue === true) {
                // Flag changed from false to true - create index
                await pool.query(createDdl);
                console.info(`Created ${flagName} index: ${indexName}`);
            } else {
                // Flag changed from true to false - drop index
                const dropDdl = `DROP INDEX IF EXISTS "${indexName}"`;
                await pool.query(dropDdl);
                console.info(`Dropped ${flagName} index: ${indexName}`);
            }
        } catch (error) {
            throw new SystemError(
                `Failed to ${newValue ? 'create' : 'drop'} ${flagName} index on ${schema_name}.${column_name}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Drop indexes when column is deleted
     * Note: DROP COLUMN should cascade to indexes, but we explicitly drop for clarity
     */
    private async handleDelete(record: any, system: any, schema_name: string, column_name: string): Promise<void> {
        const pool = SqlUtils.getPool(system);

        // Drop all possible indexes for this column
        const indexNames = [
            `${schema_name}_${column_name}_unique_idx`,
            `${schema_name}_${column_name}_idx`,
            `${schema_name}_${column_name}_search_idx`
        ];

        for (const indexName of indexNames) {
            try {
                const ddl = `DROP INDEX IF EXISTS "${indexName}"`;
                await pool.query(ddl);
                console.debug(`Dropped index if exists: ${indexName}`);
            } catch (error) {
                // Log but don't throw - index might not exist
                console.warn(`Could not drop index ${indexName}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
}
