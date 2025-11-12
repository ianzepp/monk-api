import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import type { FileSizeRequest, FileSizeResponse } from '@src/lib/file-api/file-types.js';
import { FileOperationService } from '@src/lib/file-api/file-operation-service.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/size - Return byte size for a virtual file
 */
export default withParams(async (context, { system, body }) => {
    const request: FileSizeRequest = body;

    logger.info('File size operation', {
        path: request.path,
    });

    const service = new FileOperationService(system);
    const result = await service.size(request.path, request);

    const response: FileSizeResponse = {
        success: true,
        size: result.size,
        file_metadata: result.metadata,
    };

    setRouteResult(context, response);
});
