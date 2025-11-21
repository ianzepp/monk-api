import type { System } from '@src/lib/system.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import type { FilterData } from '@src/lib/filter-types.js';
import type {
    ColumnRecord,
    DbCreateInput,
    SystemFields,
} from '@src/lib/database-types.js';

/**
 * DescribeColumns - Wrapper for column operations on 'columns' table
 *
 * Provides Database-like interface for column metadata operations with
 * column-specific validation (name rules, reserved words, schema protection).
 */
export class DescribeColumns {
    constructor(private system: System) {}

    /**
     * Validate that schema is not protected (requires sudo access)
     *
     * Uses cached schema to check sudo requirement. This is a data-driven approach
     * that allows marking any schema as requiring sudo access without code changes.
     */
    private async validateSchemaProtection(schemaName: string): Promise<void> {
        // Load schema from cache to check sudo requirement
        const schema = await this.system.database.toSchema(schemaName);

        // Check if schema requires sudo access
        if (!schema.sudo) {
            // Schema doesn't require sudo - allow modification
            return;
        }

        // Schema requires sudo - verify user has sudo token
        const jwtPayload = this.system.context.get('jwtPayload');

        if (!jwtPayload?.is_sudo) {
            throw HttpErrors.forbidden(
                `Schema '${schemaName}' requires sudo access. Use POST /api/user/sudo to get short-lived sudo token.`,
                'SCHEMA_REQUIRES_SUDO'
            );
        }

        console.info('Sudo access validated for protected schema modification', {
            schemaName,
            userId: this.system.getUser?.()?.id,
            elevation_reason: jwtPayload.elevation_reason
        });
    }

    /**
     * Validate column name follows PostgreSQL naming rules
     */
    private validateColumnName(columnName: string): void {
        if (!columnName || typeof columnName !== 'string') {
            throw HttpErrors.badRequest(`Column name must be a non-empty string`, 'INVALID_COLUMN_NAME');
        }

        if (columnName.length > 63) {
            throw HttpErrors.badRequest(`Column name '${columnName}' exceeds 63 character limit`, 'COLUMN_NAME_TOO_LONG');
        }

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)) {
            throw HttpErrors.badRequest(`Column name '${columnName}' must start with letter or underscore and contain only letters, digits, and underscores`, 'INVALID_COLUMN_NAME');
        }

        // Check against PostgreSQL reserved words
        const reservedWords = [
            'select', 'insert', 'update', 'delete', 'from', 'where', 'join', 'inner', 'outer',
            'left', 'right', 'on', 'group', 'order', 'by', 'having', 'union', 'table', 'index',
            'primary', 'key', 'foreign', 'constraint', 'create', 'drop', 'alter', 'database',
            'schema', 'view', 'trigger', 'function', 'procedure', 'user', 'grant', 'revoke'
        ];

        if (reservedWords.includes(columnName.toLowerCase())) {
            throw HttpErrors.badRequest(`Column name '${columnName}' is a PostgreSQL reserved word`, 'RESERVED_COLUMN_NAME');
        }
    }

    /**
     * Select multiple columns with optional filtering
     */
    async selectAny(filter?: FilterData, options?: { context?: 'api' | 'observer' | 'system' }): Promise<ColumnRecord[]> {
        return this.system.database.selectAny<ColumnRecord>('columns', filter, options);
    }

    /**
     * Select single column (returns null if not found)
     */
    async selectOne(filter: FilterData, options?: { context?: 'api' | 'observer' | 'system' }): Promise<ColumnRecord | null> {
        return this.system.database.selectOne<ColumnRecord>('columns', filter, options);
    }

    /**
     * Select single column (throws 404 if not found)
     */
    async select404(filter: FilterData, message?: string, options?: { context?: 'api' | 'observer' | 'system' }): Promise<ColumnRecord> {
        return await this.system.database.select404<ColumnRecord>('columns', filter, message, options)
            .catch(e => HttpErrors.remap(e, 'RECORD_NOT_FOUND', 'COLUMN_NOT_FOUND'));
    }

    /**
     * Create new column
     *
     * Validates schema protection and column name, then creates column record.
     * Observer pipeline will handle DDL (ALTER TABLE ADD COLUMN) and type mapping.
     */
    async createOne(data: DbCreateInput<Omit<ColumnRecord, keyof SystemFields>>): Promise<ColumnRecord> {
        // Validate schema is not protected
        if (data.schema_name) {
            await this.validateSchemaProtection(data.schema_name);
        }

        // Validate column name
        if (data.column_name) {
            this.validateColumnName(data.column_name);
        }

        console.info('Creating column via observer pipeline', {
            schemaName: data.schema_name,
            columnName: data.column_name
        });

        // Delegate to database (observer pipeline handles type mapping and DDL)
        return this.system.database.createOne<Omit<ColumnRecord, keyof SystemFields>>('columns', {
            ...data,
            type: data.type || 'text'
        }) as Promise<ColumnRecord>;
    }

    /**
     * Update column by filter (throws 404 if not found)
     *
     * Validates schema protection before updating.
     * Observer pipeline handles structural changes (ALTER TABLE) and type mapping.
     */
    async update404(filter: FilterData, updates: Partial<ColumnRecord>, message?: string): Promise<ColumnRecord> {
        // Extract schema name from filter for validation
        const schemaName = filter.where?.schema_name;
        if (schemaName) {
            await this.validateSchemaProtection(schemaName);
        }

        console.info('Updating column via observer pipeline', {
            schemaName,
            columnName: filter.where?.column_name
        });

        return await this.system.database.update404<ColumnRecord>('columns', filter, updates, message)
            .catch(e => HttpErrors.remap(e, 'RECORD_NOT_FOUND', 'COLUMN_NOT_FOUND'));
    }

    /**
     * Delete column by filter (throws 404 if not found)
     *
     * Validates schema protection before deleting.
     * Observer pipeline will handle DDL (ALTER TABLE DROP COLUMN).
     */
    async delete404(filter: FilterData, message?: string): Promise<ColumnRecord> {
        // Extract schema name from filter for validation
        const schemaName = filter.where?.schema_name;
        if (schemaName) {
            await this.validateSchemaProtection(schemaName);
        }

        console.info('Deleting column via observer pipeline', {
            schemaName,
            columnName: filter.where?.column_name
        });

        return await this.system.database.delete404<ColumnRecord>('columns', filter, message)
            .catch(e => HttpErrors.remap(e, 'RECORD_NOT_FOUND', 'COLUMN_NOT_FOUND'));
    }
}
