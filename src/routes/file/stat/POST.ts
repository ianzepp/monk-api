import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import type { FileStatRequest, FileStatResponse } from '@src/lib/file-api/file-types.js';
import { FileOperationService } from '@src/lib/file-api/file-operation-service.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/stat - Return metadata about a filesystem path
 */
export default withParams(async (context, { system, body }) => {
    const request: FileStatRequest = body;

    logger.info('File stat operation', {
        path: request.path,
    });

    const service = new FileOperationService(system);
    const result = await service.stat(request.path, request);

    const response: FileStatResponse = {
        success: true,
        file_metadata: result.metadata,
        record_info: result.recordInfo,
        ...(result.childrenCount !== undefined ? { children_count: result.childrenCount } : {}),
        ...(result.schemaInfo ? { schema_info: result.schemaInfo } : {}),
    };

    setRouteResult(context, response);
});
