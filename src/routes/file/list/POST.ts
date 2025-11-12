import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import type { FileListRequest, FileListResponse } from '@src/lib/file-api/file-types.js';
import { FileOperationService } from '@src/lib/file-api/file-operation-service.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/list - Filesystem-style directory listing
 */
export default withParams(async (context, { system, body }) => {
    const request: FileListRequest = body;

    logger.info('File list operation', {
        path: request.path,
        options: request.file_options,
    });

    const service = new FileOperationService(system);
    const result = await service.list(request.path, request.file_options);

    const response: FileListResponse = {
        success: true,
        entries: result.entries,
        total: result.entries.length,
        has_more: false,
        file_metadata: result.metadata,
    };

    setRouteResult(context, response);
});
