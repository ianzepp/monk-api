import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { FilePathParser } from '@src/lib/file-api/file-path-parser.js';
import { FilePermissionValidator } from '@src/lib/file-api/file-permission-validator.js';
import { FileTimestampFormatter } from '@src/lib/file-api/file-timestamp-formatter.js';
import { FileContentCalculator } from '@src/lib/file-api/file-content-calculator.js';
import type { FileRetrieveRequest, FileRetrieveResponse } from '@src/lib/file-api/file-types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/retrieve - File Content Retrieval
 *
 * Optimized file content retrieval with File metadata for FTP integration.
 * Supports record-level and field-level access with resume capabilities.
 */
export default withParams(async (context, { system, body }) => {
    const request: FileRetrieveRequest = body;

    logger.info('File retrieve operation', {
        path: request.path,
        options: request.file_options,
    });

    // Default options
    const options = {
        binary_mode: false,
        start_offset: 0,
        format: 'json' as const,
        ...request.file_options,
    };

    // Parse path - retrieve only works on specific files, no wildcards
    const filePath = FilePathParser.parse(request.path, {
        operation: 'retrieve',
        allowWildcards: false,
        requireFile: false, // Can retrieve both files and directory contents
    });

    // Validate path type - only record and field operations supported
    if (filePath.type !== 'record' && filePath.type !== 'field') {
        throw HttpErrors.badRequest('Retrieve only supports record and field paths', 'INVALID_RETRIEVE_PATH');
    }

    // Build permission context and validate
    const permissionContext = FilePermissionValidator.buildContext(system, 'retrieve');
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

    let content: any;
    let contentType: string;

    if (filePath.type === 'field') {
        // Field-level retrieval
        if (!(filePath.field_name! in record)) {
            throw HttpErrors.notFound(`Field not found: ${filePath.field_name}`, 'FIELD_NOT_FOUND');
        }

        content = record[filePath.field_name!];
        contentType = FileContentCalculator.detectContentType(content, filePath.field_name);
    } else {
        // Record-level retrieval
        content = record;
        contentType = 'application/json';
    }

    const timestampInfo = FileTimestampFormatter.getBestTimestamp(record);

    const canonicalString = typeof content === 'string' ? content : JSON.stringify(content);
    const totalSize = FileContentCalculator.calculateSize(canonicalString);

    let responseContent: any;
    let transmittedString = canonicalString;
    let canResume = false;

    if (options.format === 'raw') {
        const offset = Math.max(0, options.start_offset ?? 0);
        const maxBytes = options.max_bytes ?? null;

        if (offset > 0) {
            transmittedString = transmittedString.substring(offset);
        }
        if (maxBytes !== null && maxBytes >= 0) {
            transmittedString = transmittedString.substring(0, maxBytes);
        }

        canResume = transmittedString.length < canonicalString.length;
        responseContent = transmittedString;
    } else {
        if ((options.start_offset ?? 0) > 0 || options.max_bytes !== undefined) {
            throw HttpErrors.badRequest('start_offset and max_bytes are only supported with format "raw"', 'PARTIAL_READ_UNSUPPORTED');
        }
        responseContent = content;
    }

    // Build response
    const response: FileRetrieveResponse = {
        success: true,
        content: responseContent,
        file_metadata: {
            path: request.path,
            type: 'file',
            permissions: permissionResult.permissions,
            size: totalSize,
            modified_time: timestampInfo.formatted,
            content_type: contentType,
            etag: FileContentCalculator.generateETag(canonicalString),
            can_resume: canResume,
        },
    };

    logger.info('File retrieve completed', {
        path: request.path,
        schema: filePath.schema,
        recordId: filePath.record_id,
        fieldName: filePath.field_name,
        contentSize: options.format === 'raw' ? FileContentCalculator.calculateSize(transmittedString) : totalSize,
        format: options.format,
    });

    setRouteResult(context, response);
});