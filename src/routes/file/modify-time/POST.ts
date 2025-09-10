import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { FilePathParser } from '@src/lib/file-api/file-path-parser.js';
import { FilePermissionValidator } from '@src/lib/file-api/file-permission-validator.js';
import { FileTimestampFormatter } from '@src/lib/file-api/file-timestamp-formatter.js';
import type { FileModifyTimeRequest, FileModifyTimeResponse } from '@src/lib/file-api/file-types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/modify-time - File Modification Time Query
 *
 * Lightweight endpoint for FTP MDTM command support.
 * Returns modification timestamps in FTP format (YYYYMMDDHHMMSS)
 * for files, directories, and fields.
 */
export default withParams(async (context, { system, body }) => {
    const request: FileModifyTimeRequest = body;

    logger.info('File modify time operation', {
        path: request.path,
    });

    // Parse path - MDTM works on any path type, no wildcards
    const filePath = FilePathParser.parse(request.path, {
        operation: 'modify-time',
        allowWildcards: false,
    });

    // Build permission context and validate
    const permissionContext = FilePermissionValidator.buildContext(system, 'modify-time');
    permissionContext.path = filePath;

    const permissionResult = await FilePermissionValidator.validate(system, filePath, permissionContext);
    if (!permissionResult.allowed) {
        throw HttpErrors.forbidden(`Permission denied: ${permissionResult.reason}`, 'PERMISSION_DENIED');
    }

    let timestampInfo: {
        timestamp: Date;
        source: 'updated_at' | 'created_at' | 'current_time';
        formatted: string;
    };

    // Get modification time based on path type
    switch (filePath.type) {
        case 'root':
        case 'data':
        case 'describe':
            // Directories use current time
            timestampInfo = {
                timestamp: new Date(),
                source: 'current_time',
                formatted: FileTimestampFormatter.current(),
            };
            break;

        case 'schema':
            timestampInfo = await getSchemaModificationTime(system, filePath);
            break;

        case 'record':
        case 'field':
            timestampInfo = await getRecordModificationTime(system, filePath);
            break;

        default:
            throw HttpErrors.badRequest(`Unsupported path type for modify-time: ${filePath.type}`, 'UNSUPPORTED_PATH_TYPE');
    }

    // Build response
    const response: FileModifyTimeResponse = {
        success: true,
        modified_time: timestampInfo.formatted,
        file_metadata: {
            path: request.path,
            type: filePath.is_directory ? 'directory' : 'file',
            permissions: permissionResult.permissions,
            size: 0, // MDTM doesn't provide size
            modified_time: timestampInfo.formatted,
        },
        timestamp_info: {
            source: timestampInfo.source,
            iso_timestamp: timestampInfo.timestamp.toISOString(),
            timezone: 'UTC',
        },
    };

    logger.info('File modify time completed', {
        path: request.path,
        modifiedTime: timestampInfo.formatted,
        source: timestampInfo.source,
        operationType: filePath.type,
    });

    setRouteResult(context, response);
});

// Helper functions for timestamp operations

async function getSchemaModificationTime(system: any, filePath: any): Promise<{
    timestamp: Date;
    source: 'updated_at' | 'created_at' | 'current_time';
    formatted: string;
}> {
    try {
        // Get most recent record in schema
        const recentRecord = await system.database.selectAny(filePath.schema, {
            order: 'updated_at desc',
            limit: 1,
        });

        if (recentRecord.length > 0) {
            return FileTimestampFormatter.getBestTimestamp(recentRecord[0]);
        }

        // No records, use current time
        const timestamp = new Date();
        return {
            timestamp,
            source: 'current_time',
            formatted: FileTimestampFormatter.format(timestamp),
        };
    } catch (error) {
        // Schema might not exist or no access
        const timestamp = new Date();
        return {
            timestamp,
            source: 'current_time',
            formatted: FileTimestampFormatter.format(timestamp),
        };
    }
}

async function getRecordModificationTime(system: any, filePath: any): Promise<{
    timestamp: Date;
    source: 'updated_at' | 'created_at' | 'current_time';
    formatted: string;
}> {
    const record = await system.database.selectOne(filePath.schema, {
        where: { id: filePath.record_id },
    });

    if (!record) {
        throw HttpErrors.notFound(`Record not found: ${filePath.record_id}`, 'RECORD_NOT_FOUND');
    }

    // For field operations, also check field existence
    if (filePath.type === 'field' && !(filePath.field_name! in record)) {
        throw HttpErrors.notFound(`Field not found: ${filePath.field_name}`, 'FIELD_NOT_FOUND');
    }

    return FileTimestampFormatter.getBestTimestamp(record);
}
