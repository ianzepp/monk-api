import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { RestoreProcessor } from '@src/lib/restore-processor.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

/**
 * POST /api/restores/import
 *
 * Upload and execute restore in one step (convenience endpoint)
 *
 * Accepts multipart/form-data with:
 * - file: ZIP file from extract download
 * - conflict_strategy: replace|upsert|merge|sync|skip|error (optional, default: upsert)
 * - include: comma-separated list (optional, default: describe,data)
 * - models: comma-separated list (optional, default: all)
 * - create_models: true|false (optional, default: true)
 */
export default withTransactionParams(async (context, { system }) => {
    const request = context.req.raw;
    const contentType = request.headers.get('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
        throw HttpErrors.badRequest('Content-Type must be multipart/form-data');
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
        throw HttpErrors.badRequest('No file uploaded');
    }

    // Get optional configuration
    const conflictStrategy = (formData.get('conflict_strategy') as string) || 'upsert';
    const includeRaw = (formData.get('include') as string) || 'describe,data';
    const modelsRaw = formData.get('models') as string;
    const createModels = (formData.get('create_models') as string) !== 'false';

    const include = includeRaw.split(',').map(s => s.trim());
    const models = modelsRaw ? modelsRaw.split(',').map(s => s.trim()) : null;

    // Save uploaded file to temporary location
    const uploadId = randomBytes(16).toString('hex');
    const uploadDir = '/tmp/restores/uploads';
    await mkdir(uploadDir, { recursive: true });

    const filepath = join(uploadDir, `${uploadId}.zip`);
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(arrayBuffer));

    // Execute restore
    const processor = new RestoreProcessor(system);
    const runId = await processor.executeFromFile(filepath, file.name, {
        name: `Import ${file.name}`,
        conflict_strategy: conflictStrategy,
        include,
        models,
        create_models: createModels
    });

    setRouteResult(context, {
        run_id: runId,
        message: 'Restore queued for execution',
        status_url: `/api/data/restore_runs/${runId}`,
        filename: file.name,
        size: file.size,
        config: {
            conflict_strategy: conflictStrategy,
            include,
            models,
            create_models: createModels
        }
    });
});
