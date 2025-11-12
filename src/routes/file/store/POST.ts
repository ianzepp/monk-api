import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import type { FileStoreRequest, FileStoreResponse } from '@src/lib/file-api/file-types.js';
import { FileOperationService } from '@src/lib/file-api/file-operation-service.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/store - Create or update records via filesystem paths
 */
export default withTransactionParams(async (context, { system, body }) => {
    const request: FileStoreRequest = body;

    logger.info('File store operation', {
        path: request.path,
        options: request.file_options,
        hasContent: request.content !== undefined,
    });

    const service = new FileOperationService(system);
    const result = await service.store(request.path, request.content, request.file_options);

    const responseResult: FileStoreResponse['result'] = {
        record_id: result.recordId,
        created: result.created,
        updated: result.updated,
        validation_passed: result.validationPassed,
        ...(result.fieldName ? { field_name: result.fieldName } : {}),
    };

    const response: FileStoreResponse = {
        success: true,
        operation: result.operation,
        result: responseResult,
        file_metadata: result.metadata,
    };


    setRouteResult(context, response);
});
