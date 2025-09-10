import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { FilePathParser } from '@src/lib/file-api/file-path-parser.js';
import { FilePermissionValidator } from '@src/lib/file-api/file-permission-validator.js';
import { FileTimestampFormatter } from '@src/lib/file-api/file-timestamp-formatter.js';
import { FileContentCalculator } from '@src/lib/file-api/file-content-calculator.js';
import type { FileSizeRequest, FileSizeResponse } from '@src/lib/file-api/file-types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/size - File Size Query
 *
 * Lightweight endpoint for FTP SIZE command support.
 * Returns exact byte sizes for files without full metadata overhead.
 * Supports both complete record JSON files and individual field files.
 */
export default withParams(async (context, { system, body }) => {
    const request: FileSizeRequest = body;

    logger.info('File size operation', {
        path: request.path,
    });

    // Parse path - SIZE only works on files, not directories
    const filePath = FilePathParser.parse(request.path, {
        operation: 'size',
        allowWildcards: false,
        requireFile: true, // SIZE command only works on files
    });

    // Validate path type - only record JSON files and field files supported
    if (filePath.type === 'record' && !filePath.is_json_file) {
        throw HttpErrors.badRequest('SIZE command only works on files, not directories', 'NOT_A_FILE');
    }

    if (filePath.type !== 'record' && filePath.type !== 'field') {
        throw HttpErrors.badRequest('SIZE command only supports record and field files', 'INVALID_SIZE_PATH');
    }

    // Build permission context and validate
    const permissionContext = FilePermissionValidator.buildContext(system, 'size');
    permissionContext.path = filePath;

    const permissionResult = await FilePermissionValidator.validate(system, filePath, permissionContext);
    if (!permissionResult.allowed) {
        throw HttpErrors.forbidden(`Permission denied: ${permissionResult.reason}`, 'PERMISSION_DENIED');
    }

    // Retrieve the record
    const record = await system.database.selectOne(filePath.schema!, {
        where: { id: filePath.record_id! },
    });

    if (!record) {
        throw HttpErrors.notFound(`Record not found: ${filePath.record_id}`, 'RECORD_NOT_FOUND');
    }

    let fileSize: number;

    if (filePath.type === 'field') {
        // Individual field size
        if (!(filePath.field_name! in record)) {
            throw HttpErrors.notFound(`Field not found: ${filePath.field_name}`, 'FIELD_NOT_FOUND');
        }

        const fieldValue = record[filePath.field_name!];
        fileSize = FileContentCalculator.calculateFieldSize(fieldValue);
    } else {
        // Complete JSON record size
        fileSize = FileContentCalculator.calculateRecordSize(record);
    }

    // Build response
    const response: FileSizeResponse = {
        success: true,
        size: fileSize,
        file_metadata: {
            path: request.path,
            type: 'file',
            permissions: permissionResult.permissions,
            size: fileSize,
            modified_time: FileTimestampFormatter.getBestTimestamp(record).formatted,
            content_type: filePath.type === 'field' 
                ? FileContentCalculator.detectContentType(record[filePath.field_name!], filePath.field_name)
                : 'application/json',
        },
    };

    logger.info('File size completed', {
        path: request.path,
        size: fileSize,
        operationType: filePath.type,
        fieldName: filePath.field_name,
    });

    setRouteResult(context, response);
});