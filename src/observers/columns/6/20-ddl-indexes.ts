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

export default class DdlIndexesObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['create', 'update', 'delete'] as const;
    readonly priority = 20;  // After column DDL (priority 10)

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        const { system } = context;
        const { schema_name: schemaName, column_name: columnName } = record;

        // Skip system fields - they cannot have user-defined indexes
        if (isSystemField(columnName)) {
            return;
        }

        const operation = context.operation;

        if (operation === 'create') {
            await this.handleCreate(record, system, schemaName, columnName);
        } else if (operation === 'update') {
            await this.handleUpdate(record, context, system, schemaName, columnName);
        } else if (operation === 'delete') {
            await this.handleDelete(record, system, schemaName, columnName);
        }
    }

    /**
     * Create indexes on column creation if flags are set
     */
    private async handleCreate(record: any, system: any, schemaName: string, columnName: string): Promise<void> {
        const pool = SqlUtils.getPool(system);

        // Create unique index if unique flag is set
        if (record.unique === true) {
            const indexName = `${schemaName}_${columnName}_unique_idx`;
            const ddl = `CREATE UNIQUE INDEX IF NOT EXISTS "${indexName}" ON "${schemaName}" ("${columnName}")`;

            try {
                await pool.query(ddl);
                logger.info(`Created unique index: ${indexName}`);
            } catch (error) {
                throw new SystemError(
                    `Failed to create unique index on ${schemaName}.${columnName}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        // Create standard index if index flag is set
        if (record.index === true) {
            const indexName = `${schemaName}_${columnName}_idx`;
            const ddl = `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${schemaName}" ("${columnName}")`;

            try {
                await pool.query(ddl);
                logger.info(`Created index: ${indexName}`);
            } catch (error) {
                throw new SystemError(
                    `Failed to create index on ${schemaName}.${columnName}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        // Create full-text search index if searchable flag is set
        if (record.searchable === true) {
            const indexName = `${schemaName}_${columnName}_search_idx`;
            const ddl = `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${schemaName}" USING GIN (to_tsvector('english', "${columnName}"))`;

            try {
                await pool.query(ddl);
                logger.info(`Created full-text search index: ${indexName}`);
            } catch (error) {
                throw new SystemError(
                    `Failed to create search index on ${schemaName}.${columnName}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    }

    /**
     * Update indexes when flags change
     */
    private async handleUpdate(record: any, context: ObserverContext, system: any, schemaName: string, columnName: string): Promise<void> {
        // Get old record from metadata (preloaded by ring 0)
        const oldRecord = context.metadata.get('preloaded_records')?.[0];

        if (!oldRecord) {
            logger.warn(`No old record found for index update: ${schemaName}.${columnName}`);
            return;
        }

        const pool = SqlUtils.getPool(system);

        // Handle unique index changes
        await this.handleIndexChange(
            pool,
            schemaName,
            columnName,
            'unique',
            Boolean(oldRecord.unique),
            Boolean(record.unique),
            `${schemaName}_${columnName}_unique_idx`,
            `CREATE UNIQUE INDEX IF NOT EXISTS "${schemaName}_${columnName}_unique_idx" ON "${schemaName}" ("${columnName}")`
        );

        // Handle standard index changes
        await this.handleIndexChange(
            pool,
            schemaName,
            columnName,
            'index',
            Boolean(oldRecord.index),
            Boolean(record.index),
            `${schemaName}_${columnName}_idx`,
            `CREATE INDEX IF NOT EXISTS "${schemaName}_${columnName}_idx" ON "${schemaName}" ("${columnName}")`
        );

        // Handle searchable index changes
        await this.handleIndexChange(
            pool,
            schemaName,
            columnName,
            'searchable',
            Boolean(oldRecord.searchable),
            Boolean(record.searchable),
            `${schemaName}_${columnName}_search_idx`,
            `CREATE INDEX IF NOT EXISTS "${schemaName}_${columnName}_search_idx" ON "${schemaName}" USING GIN (to_tsvector('english', "${columnName}"))`
        );
    }

    /**
     * Helper to handle index creation/deletion on flag change
     */
    private async handleIndexChange(
        pool: any,
        schemaName: string,
        columnName: string,
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
                logger.info(`Created ${flagName} index: ${indexName}`);
            } else {
                // Flag changed from true to false - drop index
                const dropDdl = `DROP INDEX IF EXISTS "${indexName}"`;
                await pool.query(dropDdl);
                logger.info(`Dropped ${flagName} index: ${indexName}`);
            }
        } catch (error) {
            throw new SystemError(
                `Failed to ${newValue ? 'create' : 'drop'} ${flagName} index on ${schemaName}.${columnName}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Drop indexes when column is deleted
     * Note: DROP COLUMN should cascade to indexes, but we explicitly drop for clarity
     */
    private async handleDelete(record: any, system: any, schemaName: string, columnName: string): Promise<void> {
        const pool = SqlUtils.getPool(system);

        // Drop all possible indexes for this column
        const indexNames = [
            `${schemaName}_${columnName}_unique_idx`,
            `${schemaName}_${columnName}_idx`,
            `${schemaName}_${columnName}_search_idx`
        ];

        for (const indexName of indexNames) {
            try {
                const ddl = `DROP INDEX IF EXISTS "${indexName}"`;
                await pool.query(ddl);
                logger.debug(`Dropped index if exists: ${indexName}`);
            } catch (error) {
                // Log but don't throw - index might not exist
                logger.warn(`Could not drop index ${indexName}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
}
