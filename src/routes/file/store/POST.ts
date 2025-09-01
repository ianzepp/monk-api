import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { FilePathParser } from '@src/lib/file-api/file-path-parser.js';
import { FilePermissionValidator } from '@src/lib/file-api/file-permission-validator.js';
import { FileTimestampFormatter } from '@src/lib/file-api/file-timestamp-formatter.js';
import { FileContentCalculator } from '@src/lib/file-api/file-content-calculator.js';
import type { FileStoreRequest, FileStoreResponse } from '@src/lib/file-api/file-types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/store - File Storage with Transaction Support
 *
 * Advanced file storage endpoint supporting atomic operations, field-level updates,
 * and comprehensive error handling. Uses database transactions for consistency.
 */
export default withTransactionParams(async (context, { system, body }) => {
    const request: FileStoreRequest = body;

    logger.info('File store operation', {
        path: request.path,
        options: request.file_options,
        hasContent: !!request.content,
    });

    // Default options
    const options = {
        binary_mode: false,
        overwrite: true,
        append_mode: false,
        create_path: false,
        atomic: true,
        validate_schema: true,
        ...request.file_options,
    };

    // Parse File path for write operations
    const filePath = FilePathParser.parse(request.path, {
        operation: 'store',
        allowWildcards: false, // Store operations must be specific
    });

    // Validate path type - only record and field operations supported
    if (filePath.type !== 'record' && filePath.type !== 'field') {
        throw HttpErrors.badRequest('Store only supports record and field paths', 'INVALID_STORE_PATH');
    }

    // Build permission context and validate
    const permissionContext = FilePermissionValidator.buildContext(system, 'store');
    permissionContext.path = filePath;

    const permissionResult = await FilePermissionValidator.validate(system, filePath, permissionContext);
    if (!permissionResult.allowed) {
        throw HttpErrors.forbidden(`Permission denied: ${permissionResult.reason}`, 'PERMISSION_DENIED');
    }

    // Validate and process content
    FileContentCalculator.validate(request.content, filePath.type === 'field' ? 'field' : 'store');
    const processedContent = FileContentCalculator.processContent(request.content, {
        format: filePath.type === 'field' ? 'raw' : 'json',
        binaryMode: options.binary_mode,
    });

    let operationResult: any;
    let operation: 'create' | 'update' | 'field_update';

    // Execute the storage operation
    if (filePath.type === 'record') {
        operationResult = await handleRecordStorage(system, filePath, request.content, options);
        operation = operationResult.created ? 'create' : 'update';
    } else {
        operationResult = await handleFieldStorage(system, filePath, request.content, options);
        operation = 'field_update';
    }

    // Build response
    const response: FileStoreResponse = {
        success: true,
        operation,
        result: {
            record_id: filePath.record_id!,
            field_name: filePath.field_name,
            created: operationResult.created || false,
            updated: operationResult.updated || true,
            validation_passed: true, // TODO: Implement schema validation
        },
        file_metadata: {
            path: request.path,
            type: 'file',
            permissions: permissionResult.permissions,
            size: processedContent.size,
            modified_time: FileTimestampFormatter.current(),
            content_type: processedContent.contentType,
            etag: FileContentCalculator.generateETag(operationResult.result),
        },
    };

    logger.info('File store completed', {
        path: request.path,
        operation,
        recordId: filePath.record_id,
        fieldName: filePath.field_name,
        size: processedContent.size,
    });

    setRouteResult(context, response);
});

// Helper functions for storage operations

async function handleRecordStorage(system: any, filePath: any, content: any, options: any): Promise<any> {
    // Check if record exists
    const existingRecord = await system.database.selectOne(filePath.schema, {
        where: { id: filePath.record_id },
    });

    if (existingRecord && !options.overwrite) {
        throw HttpErrors.conflict(`Record ${filePath.record_id} already exists and overwrite is disabled`, 'RECORD_EXISTS');
    }

    let result: any;
    let created = false;
    let updated = false;

    if (existingRecord) {
        // Update existing record
        if (options.append_mode && typeof content === 'object') {
            // Append mode - merge with existing data
            const mergedContent = { ...existingRecord, ...content };
            result = await system.database.updateOne(filePath.schema, filePath.record_id, mergedContent);
            updated = true;
        } else {
            // Replace mode
            result = await system.database.updateOne(filePath.schema, filePath.record_id, content);
            updated = true;
        }
    } else {
        // Create new record
        const recordData = {
            id: filePath.record_id,
            ...content,
        };
        result = await system.database.createOne(filePath.schema, recordData);
        created = true;
    }

    return { result, created, updated };
}

async function handleFieldStorage(system: any, filePath: any, content: any, options: any): Promise<any> {
    // Field updates always target existing records
    const existingRecord = await system.database.selectOne(filePath.schema, {
        where: { id: filePath.record_id },
    });

    if (!existingRecord) {
        throw HttpErrors.notFound(`Record ${filePath.record_id} not found in schema ${filePath.schema}`, 'RECORD_NOT_FOUND');
    }

    // Update the specific field
    const fieldUpdate: any = {};

    if (options.append_mode && 
        typeof existingRecord[filePath.field_name] === 'string' && 
        typeof content === 'string') {
        // Append to existing string field
        fieldUpdate[filePath.field_name] = existingRecord[filePath.field_name] + content;
    } else {
        // Replace field value
        fieldUpdate[filePath.field_name] = content;
    }

    const result = await system.database.updateOne(filePath.schema, filePath.record_id, fieldUpdate);

    return { result, created: false, updated: true };
}