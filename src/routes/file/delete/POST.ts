import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { WildcardTranslator } from '@src/lib/file-wildcard-translator.js';
import { FilePathParser } from '@src/lib/file-api/file-path-parser.js';
import { FilePermissionValidator } from '@src/lib/file-api/file-permission-validator.js';
import { FileTimestampFormatter } from '@src/lib/file-api/file-timestamp-formatter.js';
import type { FileDeleteRequest, FileDeleteResponse } from '@src/lib/file-api/file-types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/delete - File Deletion with Transaction Support
 *
 * Advanced file deletion endpoint supporting soft/hard deletes, field clearing,
 * wildcard patterns, and cross-schema operations. Uses database transactions for consistency.
 */
export default withTransactionParams(async (context, { system, body }) => {
    const request: FileDeleteRequest = body;

    logger.info('File delete operation', {
        path: request.path,
        options: request.file_options,
        safetyChecks: request.safety_checks,
    });

    // Default options with safety-first approach
    const options = {
        recursive: false,
        force: false,
        permanent: false,
        atomic: true,
        ...request.file_options,
    };

    const safetyChecks = {
        require_empty: false,
        max_deletions: 100,
        ...request.safety_checks,
    };

    // Parse File path for delete operations - allows wildcards and cross-schema
    const filePath = FilePathParser.parse(request.path, {
        operation: 'delete',
        allowWildcards: true,
        allowCrossSchema: true,
        allowDangerous: options.force,
    });

    // Handle wildcard deletions
    if (filePath.has_wildcards) {
        await handleWildcardDeletion(system, filePath, request, options, safetyChecks, context);
        return;
    }

    // Handle specific path deletion
    await handleSpecificDeletion(system, filePath, request, options, context);
});

// Helper functions for different deletion scenarios

async function handleWildcardDeletion(system: any, filePath: any, request: FileDeleteRequest, options: any, safetyChecks: any, context: any): Promise<void> {
    // Use WildcardTranslator to expand pattern into specific paths
    const wildcardTranslation = WildcardTranslator.translatePath(request.path);
    
    if (wildcardTranslation.cross_schema && !options.force) {
        throw HttpErrors.badRequest('Cross-schema deletion requires force=true flag', 'CROSS_SCHEMA_REQUIRES_FORCE');
    }

    const deletedPaths: string[] = [];
    const recordsAffected: string[] = [];
    const fieldsCleared: string[] = [];
    let deletedCount = 0;

    // Query matching records using the filter
    for (const schema of wildcardTranslation.schemas) {
        const records = await system.database.selectAny(schema, wildcardTranslation.filter);

        // Safety check for mass deletion
        if (records.length > safetyChecks.max_deletions) {
            throw HttpErrors.badRequest(
                `Operation would delete ${records.length} records, exceeding safety limit of ${safetyChecks.max_deletions}`,
                'TOO_MANY_DELETIONS'
            );
        }

        for (const record of records) {
            // Validate permission for each individual record
            const recordPath = FilePathParser.parse(`/data/${schema}/${record.id}`, {
                operation: 'delete',
                allowWildcards: false,
            });

            const permissionContext = FilePermissionValidator.buildContext(system, 'delete');
            permissionContext.path = recordPath;

            const permissionResult = await FilePermissionValidator.validate(system, recordPath, permissionContext);
            
            if (permissionResult.allowed) {
                await executeRecordDeletion(system, schema, record.id, options);
                deletedPaths.push(`/data/${schema}/${record.id}`);
                recordsAffected.push(record.id);
                deletedCount++;
            }
        }
    }

    // Build response
    const response: FileDeleteResponse = {
        success: true,
        operation: options.permanent ? 'permanent_delete' : 'soft_delete',
        results: {
            deleted_count: deletedCount,
            paths: deletedPaths,
            records_affected: recordsAffected,
            fields_cleared: fieldsCleared,
        },
        file_metadata: {
            can_restore: !options.permanent,
            restore_deadline: options.permanent ? undefined : 
                new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
    };

    logger.info('Wildcard delete completed', {
        path: request.path,
        deletedCount,
        recordsAffected: recordsAffected.length,
        schemasAffected: wildcardTranslation.schemas.length,
    });

    setRouteResult(context, response);
}

async function handleSpecificDeletion(system: any, filePath: any, request: FileDeleteRequest, options: any, context: any): Promise<void> {
    // Build permission context and validate
    const permissionContext = FilePermissionValidator.buildContext(system, 'delete');
    permissionContext.path = filePath;

    const permissionResult = await FilePermissionValidator.validate(system, filePath, permissionContext);
    if (!permissionResult.allowed) {
        throw HttpErrors.forbidden(`Permission denied: ${permissionResult.reason}`, 'PERMISSION_DENIED');
    }

    let operationResult: any;
    let operation: 'soft_delete' | 'permanent_delete' | 'field_delete';

    // Execute the delete operation
    switch (filePath.type) {
        case 'record':
            operationResult = await executeRecordDeletion(system, filePath.schema, filePath.record_id, options);
            operation = options.permanent ? 'permanent_delete' : 'soft_delete';
            break;

        case 'field':
            operationResult = await executeFieldDeletion(system, filePath, options);
            operation = 'field_delete';
            break;

        case 'schema':
            throw HttpErrors.forbidden('Schema deletion not implemented - too dangerous', 'SCHEMA_DELETION_FORBIDDEN');

        default:
            throw HttpErrors.badRequest(`Unsupported delete operation type: ${filePath.type}`, 'UNSUPPORTED_DELETE_TYPE');
    }

    // Build response
    const response: FileDeleteResponse = {
        success: true,
        operation,
        results: {
            deleted_count: operationResult.deleted_count,
            paths: [request.path],
            records_affected: operationResult.records_affected,
            fields_cleared: operationResult.fields_cleared,
        },
        file_metadata: {
            can_restore: operationResult.can_restore,
            restore_deadline: operationResult.restore_deadline,
        },
    };

    logger.info('File delete completed', {
        path: request.path,
        operation,
        deletedCount: operationResult.deleted_count,
        recordsAffected: operationResult.records_affected?.length || 0,
    });

    setRouteResult(context, response);
}

// Storage operation helpers

async function executeRecordDeletion(system: any, schema: string, recordId: string, options: any): Promise<any> {
    if (options.permanent) {
        // Permanent deletion (hard delete)
        const result = await system.database.deleteOne(schema, recordId, {
            permanent: true,
        });

        return {
            deleted_count: result ? 1 : 0,
            records_affected: result ? [recordId] : [],
            can_restore: false,
        };
    } else {
        // Soft deletion (set trashed_at)
        const result = await system.database.updateOne(schema, recordId, {
            trashed_at: new Date().toISOString(),
        });

        return {
            deleted_count: result ? 1 : 0,
            records_affected: result ? [recordId] : [],
            can_restore: true,
            restore_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
    }
}

async function executeFieldDeletion(system: any, filePath: any, options: any): Promise<any> {
    // Verify record exists
    const record = await system.database.selectOne(filePath.schema, {
        where: { id: filePath.record_id },
    });

    if (!record) {
        throw HttpErrors.notFound(`Record ${filePath.record_id} not found in schema ${filePath.schema}`, 'RECORD_NOT_FOUND');
    }

    if (!(filePath.field_name in record)) {
        throw HttpErrors.notFound(`Field not found: ${filePath.field_name}`, 'FIELD_NOT_FOUND');
    }

    // Clear the field value
    const updateData: any = {};
    updateData[filePath.field_name] = null;

    const result = await system.database.updateOne(filePath.schema, filePath.record_id, updateData);

    return {
        deleted_count: result ? 1 : 0,
        records_affected: result ? [filePath.record_id] : [],
        fields_cleared: [filePath.field_name],
        can_restore: false, // Field values can't be restored automatically
    };
}