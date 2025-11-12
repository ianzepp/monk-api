import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import type { FileDeleteRequest, FileDeleteResponse } from '@src/lib/file-api/file-types.js';
import { FileOperationService } from '@src/lib/file-api/file-operation-service.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/delete - Remove records or fields
 */
export default withTransactionParams(async (context, { system, body }) => {
    const request: FileDeleteRequest = body;

    logger.info('File delete operation', {
        path: request.path,
        options: request.file_options,
        safetyChecks: request.safety_checks,
    });

    const service = new FileOperationService(system);
    const result = await service.delete(request.path, request);

    const responseResults: FileDeleteResponse['results'] = {
        deleted_count: result.deletedCount,
        paths: [request.path],
        records_affected: result.affectedRecords,
        ...(result.clearedFields ? { fields_cleared: result.clearedFields } : {}),
    };

    const response: FileDeleteResponse = {
        success: true,
        operation: result.operation,
        results: responseResults,
        file_metadata: {
            can_restore: result.canRestore,
            restore_deadline: result.restoreDeadline,
        },
    };

    setRouteResult(context, response);
});
