import { withParams } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

/**
 * GET /api/extracts/artifacts/:artifactId/download
 *
 * Download a single extract artifact
 */
export default withParams(async (context, { system, artifactId }) => {
    // Get artifact record
    const artifact = await system.database.select404(
        'extract_artifacts',
        { where: { id: artifactId } },
        'Artifact not found'
    );

    // Check if expired
    if (artifact.expires_at && new Date(artifact.expires_at) < new Date()) {
        throw HttpErrors.gone('Artifact has expired and been deleted');
    }

    // Check if file exists
    try {
        await stat(artifact.storage_path);
    } catch (err) {
        throw HttpErrors.notFound('Artifact file not found on disk');
    }

    // Update access stats
    await system.database.updateOne('extract_artifacts', artifactId!, {
        accessed_at: new Date(),
        download_count: (artifact.download_count || 0) + 1
    });

    // Stream file to client
    const fileStream = createReadStream(artifact.storage_path);

    return new Response(fileStream as any, {
        headers: {
            'Content-Type': artifact.content_type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${artifact.artifact_name}"`,
            'Content-Length': artifact.size_bytes.toString(),
            'X-Checksum-SHA256': artifact.checksum || ''
        }
    });
});
