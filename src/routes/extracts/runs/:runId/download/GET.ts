import { withParams } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { createReadStream, createWriteStream } from 'fs';
import { stat, readdir } from 'fs/promises';
import { join } from 'path';
import { createGzip } from 'zlib';
import archiver from 'archiver';

/**
 * GET /api/extracts/runs/:runId/download
 *
 * Download all artifacts for a run as a ZIP archive
 */
export default withParams(async (context, { system, runId }) => {
    // Get run record
    const run = await system.database.select404(
        'extract_runs',
        { where: { id: runId } },
        'Extract run not found'
    );

    // Verify run completed successfully
    if (run.status !== 'completed') {
        throw HttpErrors.conflict(
            `Extract run is ${run.status}, not ready for download`
        );
    }

    // Get all artifacts for this run
    const artifacts = await system.database.selectAny('extract_artifacts', {
        where: { run_id: runId },
        order: { artifact_type: 'asc' }
    });

    if (artifacts.length === 0) {
        throw HttpErrors.notFound('No artifacts found for this run');
    }

    // Check if any artifacts expired
    const now = new Date();
    const expiredArtifacts = artifacts.filter(
        (a: any) => a.expires_at && new Date(a.expires_at) < now
    );

    if (expiredArtifacts.length > 0) {
        throw HttpErrors.gone('Some artifacts have expired');
    }

    // Create ZIP archive
    const archive = archiver('zip', {
        zlib: { level: 6 } // Compression level
    });

    // Add each artifact to archive
    for (const artifact of artifacts) {
        try {
            await stat(artifact.storage_path);
            archive.file(artifact.storage_path, { name: artifact.artifact_name });
        } catch (err) {
            throw HttpErrors.notFound(`Artifact file not found: ${artifact.artifact_name}`);
        }
    }

    // Finalize archive
    archive.finalize();

    // Generate filename
    const extractName = run.extract_name || 'extract';
    const timestamp = new Date(run.created_at).toISOString().split('T')[0];
    const filename = `${extractName}-${timestamp}-${runId.substring(0, 8)}.zip`;

    return new Response(archive as any, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${filename}"`
        }
    });
});
