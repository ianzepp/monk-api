import type { System } from '@src/lib/system.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';
import type { FilterData } from '@src/lib/filter-types.js';
import type {
    SchemaRecord,
    DbCreateInput,
    SystemFields,
} from '@src/lib/database-types.js';

/**
 * DescribeSchemas - Wrapper for schema operations on 'schemas' table
 *
 * Provides Database-like interface for schema metadata operations with
 * schema-specific validation (protection checks, system schema guards).
 */
export class DescribeSchemas {
    constructor(private system: System) {}

    /**
     * Validate that schema is not protected (requires sudo access)
     *
     * Uses cached schema to check sudo requirement. This is a data-driven approach
     * that allows marking any schema as requiring sudo access without code changes.
     */
    private async validateSchemaProtection(schemaName: string): Promise<void> {
        // Try to load schema from cache (will throw if not found during updates/deletes)
        let schema;
        try {
            schema = await this.system.database.toSchema(schemaName);
        } catch (error) {
            // Schema doesn't exist yet - allow creation (will be validated by other checks)
            return;
        }

        // Check if schema requires sudo access
        if (!schema.sudo) {
            // Schema doesn't require sudo - allow modification
            return;
        }

        // Schema requires sudo - verify user has sudo token
        const jwtPayload = this.system.context.get('jwtPayload');

        if (!jwtPayload?.is_sudo) {
            throw HttpErrors.forbidden(
                `Schema '${schemaName}' requires sudo access. Use POST /api/auth/sudo to get short-lived sudo token.`,
                'SCHEMA_REQUIRES_SUDO'
            );
        }

        logger.info('Sudo access validated for protected schema modification', {
            schemaName,
            userId: this.system.getUser?.()?.id,
            elevation_reason: jwtPayload.elevation_reason
        });
    }

    /**
     * Select multiple schemas with optional filtering
     */
    async selectAny(filter?: FilterData, options?: { context?: 'api' | 'observer' | 'system' }): Promise<SchemaRecord[]> {
        return this.system.database.selectAny<SchemaRecord>('schemas', filter, options);
    }

    /**
     * Select single schema (returns null if not found)
     */
    async selectOne(filter: FilterData, options?: { context?: 'api' | 'observer' | 'system' }): Promise<SchemaRecord | null> {
        return this.system.database.selectOne<SchemaRecord>('schemas', filter, options);
    }

    /**
     * Select single schema (throws 404 if not found)
     */
    async select404(filter: FilterData, message?: string, options?: { context?: 'api' | 'observer' | 'system' }): Promise<SchemaRecord> {
        return this.system.database.select404<SchemaRecord>('schemas', filter, message, options);
    }

    /**
     * Create new schema
     *
     * Validates schema name and protection, then creates schema record.
     * Observer pipeline will handle DDL generation (CREATE TABLE).
     */
    async createOne(data: DbCreateInput<Omit<SchemaRecord, keyof SystemFields>>): Promise<SchemaRecord> {
        // Validate required fields
        if (!data.schema_name) {
            throw HttpErrors.badRequest('schema_name is required', 'MISSING_REQUIRED_FIELDS');
        }

        // Validate schema protection
        await this.validateSchemaProtection(data.schema_name);

        logger.info('Creating schema via observer pipeline', { schemaName: data.schema_name });

        // Delegate to database
        return this.system.database.createOne<Omit<SchemaRecord, keyof SystemFields>>('schemas', data) as Promise<SchemaRecord>;
    }

    /**
     * Update schema by filter (throws 404 if not found)
     *
     * Validates schema protection before updating.
     */
    async update404(filter: FilterData, updates: Partial<SchemaRecord>, message?: string): Promise<SchemaRecord> {
        // Extract schema name from filter for validation
        const schemaName = filter.where?.schema_name;
        if (schemaName) {
            await this.validateSchemaProtection(schemaName);
        }

        // Validate at least one field provided
        if (Object.keys(updates).length === 0) {
            throw HttpErrors.badRequest('No valid fields to update', 'NO_UPDATES');
        }

        logger.info('Updating schema metadata', { schemaName, updates });

        // Delegate to database
        return this.system.database.update404<SchemaRecord>('schemas', filter, updates, message);
    }

    /**
     * Delete schema by filter (throws 404 if not found)
     *
     * Validates schema protection before deleting.
     * Observer pipeline will handle DDL (DROP TABLE).
     */
    async delete404(filter: FilterData, message?: string): Promise<SchemaRecord> {
        // Extract schema name from filter for validation
        const schemaName = filter.where?.schema_name;
        if (schemaName) {
            await this.validateSchemaProtection(schemaName);
        }

        logger.info('Deleting schema via observer pipeline', { schemaName });

        // Delegate to database
        return this.system.database.delete404<SchemaRecord>('schemas', filter, message);
    }
}
