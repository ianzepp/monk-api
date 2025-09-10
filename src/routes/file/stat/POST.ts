import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { FilePathParser } from '@src/lib/file-api/file-path-parser.js';
import { FilePermissionValidator } from '@src/lib/file-api/file-permission-validator.js';
import { FileTimestampFormatter } from '@src/lib/file-api/file-timestamp-formatter.js';
import { FileContentCalculator } from '@src/lib/file-api/file-content-calculator.js';
import type { FileStatRequest, FileStatResponse } from '@src/lib/file-api/file-types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/stat - File/Directory Status Information
 *
 * Provides detailed file/directory status for FTP STAT command.
 * Returns comprehensive metadata with schema and field introspection.
 */
export default withParams(async (context, { system, body }) => {
    const request: FileStatRequest = body;

    logger.info('File stat operation', {
        path: request.path,
    });

    // Parse path - stat works on any path type, no wildcards
    const filePath = FilePathParser.parse(request.path, {
        operation: 'stat',
        allowWildcards: false,
    });

    // Build permission context and validate
    const permissionContext = FilePermissionValidator.buildContext(system, 'stat');
    permissionContext.path = filePath;

    const permissionResult = await FilePermissionValidator.validate(system, filePath, permissionContext);
    if (!permissionResult.allowed) {
        throw HttpErrors.forbidden(`Permission denied: ${permissionResult.reason}`, 'PERMISSION_DENIED');
    }

    let response: FileStatResponse;

    switch (filePath.type) {
        case 'root':
            response = createRootStatResponse(filePath);
            break;

        case 'data':
        case 'describe':
            response = await createApiRootStatResponse(system, filePath);
            break;

        case 'schema':
            response = await createSchemaStatResponse(system, filePath, permissionResult);
            break;

        case 'record':
            response = await createRecordStatResponse(system, filePath, permissionResult);
            break;

        case 'field':
            response = await createFieldStatResponse(system, filePath, permissionResult);
            break;

        default:
            throw HttpErrors.badRequest(`Unsupported path type for stat: ${filePath.type}`, 'UNSUPPORTED_PATH_TYPE');
    }

    logger.info('File stat completed', {
        path: request.path,
        type: response.file_metadata.type,
        size: response.file_metadata.size,
        permissions: response.file_metadata.permissions,
    });

    setRouteResult(context, response);
});

// Helper functions for different stat operations

function createRootStatResponse(filePath: any): FileStatResponse {
    const currentTime = FileTimestampFormatter.current();

    return {
        success: true,
        file_metadata: {
            path: '/',
            type: 'directory',
            permissions: 'r-x',
            size: 0,
            modified_time: currentTime,
            created_time: currentTime,
            access_time: currentTime,
        },
        record_info: {
            schema: '',
            soft_deleted: false,
            access_permissions: ['read'],
        },
        children_count: 2, // /data and /describe
    };
}

async function createApiRootStatResponse(system: any, filePath: any): Promise<FileStatResponse> {
    const schemas = await system.database.selectAny('schemas');
    const currentTime = FileTimestampFormatter.current();

    return {
        success: true,
        file_metadata: {
            path: filePath.normalized_path,
            type: 'directory',
            permissions: 'r-x',
            size: 0,
            modified_time: currentTime,
            created_time: currentTime,
            access_time: currentTime,
        },
        record_info: {
            schema: '',
            soft_deleted: false,
            access_permissions: ['read'],
        },
        children_count: schemas.length,
    };
}

async function createSchemaStatResponse(system: any, filePath: any, permissionResult: any): Promise<FileStatResponse> {
    const recordCount = await system.database.count(filePath.schema);
    const currentTime = FileTimestampFormatter.current();

    // Generate schema information
    let schemaInfo;
    try {
        const schema = await system.database.toSchema(filePath.schema);
        const schemaJson = schema.definition;

        schemaInfo = {
            description: schemaJson.description || schemaJson.title || `${filePath.schema} schema`,
            record_count: recordCount,
            field_definitions: generateFieldDefinitions(schemaJson),
        };
    } catch (error) {
        schemaInfo = {
            description: `${filePath.schema} schema`,
            record_count: recordCount,
            field_definitions: [],
        };
    }

    return {
        success: true,
        file_metadata: {
            path: filePath.normalized_path,
            type: 'directory',
            permissions: permissionResult.permissions,
            size: 0,
            modified_time: currentTime,
            created_time: currentTime,
            access_time: currentTime,
        },
        record_info: {
            schema: filePath.schema,
            soft_deleted: false,
            access_permissions: [permissionResult.access_level],
        },
        children_count: recordCount,
        schema_info: schemaInfo,
    };
}

async function createRecordStatResponse(system: any, filePath: any, permissionResult: any): Promise<FileStatResponse> {
    const record = await system.database.selectOne(filePath.schema, {
        where: { id: filePath.record_id },
    });

    if (!record) {
        throw HttpErrors.notFound(`Record not found: ${filePath.record_id}`, 'RECORD_NOT_FOUND');
    }

    const timestampInfo = FileTimestampFormatter.getBestTimestamp(record);
    const isJsonFile = filePath.is_json_file;

    if (isJsonFile) {
        // JSON file status
        const contentSize = FileContentCalculator.calculateRecordSize(record);

        return {
            success: true,
            file_metadata: {
                path: filePath.normalized_path,
                type: 'file',
                permissions: permissionResult.permissions,
                size: contentSize,
                modified_time: timestampInfo.formatted,
                created_time: FileTimestampFormatter.format(record.created_at),
                access_time: FileTimestampFormatter.current(),
                content_type: 'application/json',
                etag: FileContentCalculator.generateETag(record),
            },
            record_info: {
                schema: filePath.schema,
                record_id: filePath.record_id,
                field_count: Object.keys(record).length,
                soft_deleted: !!record.trashed_at,
                access_permissions: [permissionResult.access_level],
            },
        };
    } else {
        // Record directory status
        const fieldCount = Object.keys(record).filter(key =>
            !['id', 'created_at', 'updated_at', 'trashed_at', 'deleted_at'].includes(key)
        ).length;

        return {
            success: true,
            file_metadata: {
                path: filePath.normalized_path,
                type: 'directory',
                permissions: permissionResult.permissions,
                size: 0,
                modified_time: timestampInfo.formatted,
                created_time: FileTimestampFormatter.format(record.created_at),
                access_time: FileTimestampFormatter.current(),
            },
            record_info: {
                schema: filePath.schema,
                record_id: filePath.record_id,
                field_count: fieldCount + 1, // +1 for .json file
                soft_deleted: !!record.trashed_at,
                access_permissions: [permissionResult.access_level],
            },
            children_count: fieldCount + 1,
        };
    }
}

async function createFieldStatResponse(system: any, filePath: any, permissionResult: any): Promise<FileStatResponse> {
    const record = await system.database.selectOne(filePath.schema, {
        where: { id: filePath.record_id },
    });

    if (!record) {
        throw HttpErrors.notFound(`Record not found: ${filePath.record_id}`, 'RECORD_NOT_FOUND');
    }

    if (!(filePath.field_name in record)) {
        throw HttpErrors.notFound(`Field not found: ${filePath.field_name}`, 'FIELD_NOT_FOUND');
    }

    const fieldValue = record[filePath.field_name];
    const fieldSize = FileContentCalculator.calculateFieldSize(fieldValue);
    const timestampInfo = FileTimestampFormatter.getBestTimestamp(record);

    return {
        success: true,
        file_metadata: {
            path: filePath.normalized_path,
            type: 'file',
            permissions: permissionResult.permissions,
            size: fieldSize,
            modified_time: timestampInfo.formatted,
            created_time: FileTimestampFormatter.format(record.created_at),
            access_time: FileTimestampFormatter.current(),
            content_type: FileContentCalculator.detectContentType(fieldValue, filePath.field_name),
            etag: FileContentCalculator.generateETag(fieldValue),
        },
        record_info: {
            schema: filePath.schema,
            record_id: filePath.record_id,
            field_name: filePath.field_name,
            soft_deleted: !!record.trashed_at,
            access_permissions: [permissionResult.access_level],
        },
    };
}

function generateFieldDefinitions(schemaJson: any): any[] {
    const fields: any[] = [];
    const properties = schemaJson.properties || {};
    const required = schemaJson.required || [];

    for (const [fieldName, fieldDef] of Object.entries(properties)) {
        const field: any = fieldDef as any;

        fields.push({
            name: fieldName,
            type: field.type || 'unknown',
            required: required.includes(fieldName),
            constraints: buildConstraintsString(field),
            description: field.description || `${fieldName} field`,
        });
    }

    return fields;
}

function buildConstraintsString(field: any): string {
    const constraints: string[] = [];

    if (field.minLength) constraints.push(`min ${field.minLength} chars`);
    if (field.maxLength) constraints.push(`max ${field.maxLength} chars`);
    if (field.minimum) constraints.push(`min ${field.minimum}`);
    if (field.maximum) constraints.push(`max ${field.maximum}`);
    if (field.format) constraints.push(`${field.format} format`);
    if (field.enum) constraints.push(field.enum.join('|'));

    return constraints.join(', ') || 'no constraints';
}
