import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import type { FileModifyTimeRequest, FileModifyTimeResponse } from '@src/lib/file-api/file-types.js';
import { FileOperationService } from '@src/lib/file-api/file-operation-service.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/modify-time - Return last-modified timestamp
 */
export default withParams(async (context, { system, body }) => {
    const request: FileModifyTimeRequest = body;

    logger.info('File modify time operation', {
        path: request.path,
    });

    const service = new FileOperationService(system);
    const result = await service.modifyTime(request.path, request);

    const response: FileModifyTimeResponse = {
        success: true,
        modified_time: result.modifiedTime,
        file_metadata: result.metadata,
        timestamp_info: result.timestampInfo,
    };

    setRouteResult(context, response);
});
