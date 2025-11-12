import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import type { FileRetrieveRequest, FileRetrieveResponse } from '@src/lib/file-api/file-types.js';
import { FileOperationService } from '@src/lib/file-api/file-operation-service.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/retrieve - Fetch file or field content
 */
export default withParams(async (context, { system, body }) => {
    const request: FileRetrieveRequest = body;

    logger.info('File retrieve operation', {
        path: request.path,
        options: request.file_options,
    });

    const service = new FileOperationService(system);
    const result = await service.retrieve(request.path, request.file_options);

    const response: FileRetrieveResponse = {
        success: true,
        content: result.content,
        file_metadata: result.metadata,
    };

    setRouteResult(context, response);
});
