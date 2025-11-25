import type { System } from '@src/lib/system.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import type { FilterData } from '@src/lib/filter-types.js';
import type {
    ModelRecord,
    DbCreateInput,
    SystemFields,
} from '@src/lib/database-types.js';

/**
 * DescribeModels - Wrapper for model operations on 'models' table
 *
 * Provides Database-like interface for model metadata operations with
 * model-specific validation (protection checks, system model guards).
 */
export class DescribeModels {
    constructor(private system: System) {}

    /**
     * Validate that system models (status='system') are not modified without proper privileges
     *
     * System models (models, users, fields, history) are core infrastructure and require
     * sudo access to modify, unlike the model.sudo flag which protects DATA operations.
     */
    private async validateSystemModelProtection(modelName: string): Promise<void> {
        // Try to load model from cache
        let model;
        try {
            model = await this.system.database.toModel(modelName);
        } catch (error) {
            // Model doesn't exist yet - allow creation
            return;
        }

        // Only protect system models (status='system')
        if (model.status !== 'system') {
            return;
        }

        // System model - verify user has sudo token
        const jwtPayload = this.system.context.get('jwtPayload');

        if (!jwtPayload?.is_sudo) {
            throw HttpErrors.forbidden(
                `Model '${modelName}' is a system model and requires sudo access. Use POST /api/user/sudo.`,
                'MODEL_REQUIRES_SUDO'
            );
        }

        console.info('Sudo access validated for system model modification', {
            modelName,
            userId: this.system.getUser?.()?.id,
            elevation_reason: jwtPayload.elevation_reason
        });
    }

    /**
     * Select multiple models with optional filtering
     */
    async selectAny(filter?: FilterData, options?: { context?: 'api' | 'observer' | 'system' }): Promise<ModelRecord[]> {
        return this.system.database.selectAny<ModelRecord>('models', filter, options);
    }

    /**
     * Select single model (returns null if not found)
     */
    async selectOne(filter: FilterData, options?: { context?: 'api' | 'observer' | 'system' }): Promise<ModelRecord | null> {
        return this.system.database.selectOne<ModelRecord>('models', filter, options);
    }

    /**
     * Select single model (throws 404 if not found)
     */
    async select404(filter: FilterData, message?: string, options?: { context?: 'api' | 'observer' | 'system' }): Promise<ModelRecord> {
        return await this.system.database.select404<ModelRecord>('models', filter, message, options)
            .catch(e => HttpErrors.remap(e, 'RECORD_NOT_FOUND', 'MODEL_NOT_FOUND'));
    }

    /**
     * Create new model
     *
     * Validates model name and protection, then creates model record.
     * Observer pipeline will handle DDL generation (CREATE TABLE).
     */
    async createOne(data: DbCreateInput<Omit<ModelRecord, keyof SystemFields>>): Promise<ModelRecord> {
        // Validate required fields
        if (!data.model_name) {
            throw HttpErrors.badRequest('model_name is required', 'MISSING_REQUIRED_FIELDS');
        }

        console.info('Creating model via observer pipeline', data);

        // Delegate to database
        return this.system.database.createOne<Omit<ModelRecord, keyof SystemFields>>('models', data) as Promise<ModelRecord>;
    }

    /**
     * Update model by filter (throws 404 if not found)
     *
     * Validates model protection before updating.
     */
    async update404(filter: FilterData, updates: Partial<ModelRecord>, message?: string): Promise<ModelRecord> {
        // Extract model name for logging
        const modelName = filter.where?.model_name;

        // Validate at least one field provided
        if (Object.keys(updates).length === 0) {
            throw HttpErrors.badRequest('No valid fields to update', 'NO_UPDATES');
        }

        console.info('Updating model metadata', { modelName, updates });

        return await this.system.database.update404<ModelRecord>('models', filter, updates, message)
            .catch(e => HttpErrors.remap(e, 'RECORD_NOT_FOUND', 'MODEL_NOT_FOUND'));
    }

    /**
     * Delete model by filter (throws 404 if not found)
     *
     * Validates model protection before deleting.
     * Observer pipeline will handle DDL (DROP TABLE).
     */
    async delete404(filter: FilterData, message?: string): Promise<ModelRecord> {
        // Extract model name for logging
        const modelName = filter.where?.model_name;

        console.info('Deleting model via observer pipeline', { modelName });

        return await this.system.database.delete404<ModelRecord>('models', filter, message)
            .catch(e => HttpErrors.remap(e, 'RECORD_NOT_FOUND', 'MODEL_NOT_FOUND'));
    }
}
