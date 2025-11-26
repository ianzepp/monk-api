import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { stripSystemFields } from '@src/lib/describe.js';
import { YamlFormatter } from '@src/lib/formatters/yaml.js';
import { createWriteStream, mkdirSync } from 'fs';
import { stat, readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

const EXTRACTS_DIR = '/tmp/extracts';

/**
 * POST /api/extracts/:record/execute
 *
 * Execute an extract job synchronously.
 * This is the internal endpoint called by the fire-and-forget mechanism.
 * The HTTP connection stays open until the extract completes.
 *
 * Expects :record to be an extract_runs.id (not extracts.id)
 */
export default withTransactionParams(async (context, { system, record: runId }) => {
    if (!runId) {
        throw HttpErrors.badRequest('Run ID required');
    }

    // Get the extract run record
    const run = await system.database.select404(
        'extract_runs',
        { where: { id: runId } },
        'Extract run not found'
    );

    // Validate run is in queued state
    if (run.status !== 'queued') {
        throw HttpErrors.conflict(`Extract run is not queued (status: ${run.status})`);
    }

    // Get the extract configuration
    const extract = await system.database.select404(
        'extracts',
        { where: { id: run.extract_id } },
        'Extract configuration not found'
    );

    const startTime = Date.now();

    try {
        // Update to running
        await system.database.updateOne('extract_runs', runId, {
            status: 'running',
            started_at: new Date(),
            progress: 0
        });

        await system.database.updateOne('extracts', extract.id, {
            last_run_status: 'running'
        });

        // Create run directory
        mkdirSync(EXTRACTS_DIR, { recursive: true });
        const runDir = join(EXTRACTS_DIR, runId);
        mkdirSync(runDir, { recursive: true });

        const artifacts: any[] = [];
        const config = extract;
        const include = config.include || ['describe', 'data'];

        // Determine models to export
        // Filter out: models/fields (metadata), external models (non-standard schema)
        const modelsToExport = config.models ||
            (await system.describe.models.selectAny({}))
                .filter((m: any) => !m.external)
                .map((m: any) => m.model_name)
                .filter((name: string) => !['models', 'fields'].includes(name));

        let totalRecords = 0;
        let modelsExported = 0;

        // Export describe metadata
        if (include.includes('describe')) {
            console.info('Exporting describe metadata', { runId });

            const artifact = await exportDescribeMetadata(
                system,
                runId,
                extract.id,
                runDir,
                modelsToExport,
                config
            );

            artifacts.push(artifact);

            await updateProgress(system, runId, 25, {
                phase: 'exported_describe',
                models_total: modelsToExport.length,
                models_completed: 0
            });
        }

        // Export data
        if (include.includes('data')) {
            console.info('Exporting data', { runId, models: modelsToExport.length });

            for (const modelName of modelsToExport) {
                const artifact = await exportModelData(
                    system,
                    runId,
                    extract.id,
                    runDir,
                    modelName,
                    config
                );

                artifacts.push(artifact);
                totalRecords += artifact.recordCount || 0;
                modelsExported++;

                // Update progress (25% for describe, 75% for data)
                const dataProgress = 25 + Math.floor((modelsExported / modelsToExport.length) * 75);
                await updateProgress(system, runId, Math.min(dataProgress, 99), {
                    phase: 'exporting_data',
                    models_total: modelsToExport.length,
                    models_completed: modelsExported,
                    current_model: modelName,
                    records_exported: totalRecords
                });
            }
        }

        // Create manifest
        const manifestArtifact = await createManifest(
            system,
            runId,
            extract.id,
            runDir,
            artifacts,
            config
        );
        artifacts.push(manifestArtifact);

        // Calculate totals (ensure numeric addition, not string concatenation)
        const totalSize = artifacts.reduce((sum, a) => sum + Number(a.size_bytes || 0), 0);
        const duration = Math.floor((Date.now() - startTime) / 1000);

        // Mark complete
        await system.database.updateOne('extract_runs', runId, {
            status: 'completed',
            progress: 100,
            completed_at: new Date(),
            duration_seconds: duration,
            records_exported: totalRecords,
            models_exported: modelsExported,
            artifacts_created: artifacts.length,
            total_size_bytes: totalSize
        });

        await system.database.updateOne('extracts', extract.id, {
            last_run_status: 'completed',
            successful_runs: (extract.successful_runs || 0) + 1
        });

        console.info('Extract job completed', {
            runId,
            duration,
            artifacts: artifacts.length,
            records: totalRecords,
            size: totalSize
        });

        setRouteResult(context, {
            run_id: runId,
            status: 'completed',
            duration_seconds: duration,
            records_exported: totalRecords,
            models_exported: modelsExported,
            artifacts_created: artifacts.length,
            total_size_bytes: totalSize
        });

    } catch (error) {
        const duration = Math.floor((Date.now() - startTime) / 1000);
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.error('Extract job failed', { runId, error: errorMessage });

        await system.database.updateOne('extract_runs', runId, {
            status: 'failed',
            completed_at: new Date(),
            duration_seconds: duration,
            error: errorMessage,
            error_detail: error instanceof Error ? {
                name: error.name,
                stack: error.stack
            } : {}
        });

        await system.database.updateOne('extracts', extract.id, {
            last_run_status: 'failed',
            failed_runs: (extract.failed_runs || 0) + 1
        });

        throw error;
    }
});

/**
 * Export describe metadata (models + fields)
 */
async function exportDescribeMetadata(
    system: any,
    runId: string,
    extractId: string,
    runDir: string,
    modelsToExport: string[],
    config: any
): Promise<any> {
    // Fetch models and fields (exclude external models and models/fields metadata)
    const allModels = await system.describe.models.selectAny({
        where: config.models ? { model_name: { $in: config.models } } : {}
    });
    const models = allModels.filter((m: any) =>
        !m.external && !['models', 'fields'].includes(m.model_name)
    );
    const modelNames = models.map((m: any) => m.model_name);

    const allFields = await system.describe.fields.selectAny({
        where: config.models ? { model_name: { $in: config.models } } : {}
    });
    const fields = allFields.filter((f: any) => modelNames.includes(f.model_name));

    // Build hierarchical structure
    const result: any = {};

    for (const model of models) {
        const modelFields = fields.filter((col: any) => col.model_name === model.model_name);
        const fieldsObj: any = {};

        for (const col of modelFields) {
            const { model_name, field_name, ...fieldDef } = stripSystemFields(col);
            fieldsObj[field_name] = fieldDef;
        }

        const { model_name, ...modelDef } = stripSystemFields(model);
        result[model_name] = {
            ...modelDef,
            fields: fieldsObj
        };
    }

    // Write to file
    const filename = 'describe.yaml';
    const filepath = join(runDir, filename);
    const content = YamlFormatter.encode(result);

    const writeStream = createWriteStream(filepath);
    writeStream.write(content);
    writeStream.end();

    await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
    });

    const stats = await stat(filepath);
    const checksum = await calculateChecksum(filepath);

    // Create artifact record
    const artifact = await system.database.createOne('extract_artifacts', {
        run_id: runId,
        extract_id: extractId,
        artifact_type: 'describe',
        artifact_name: filename,
        storage_path: filepath,
        storage_backend: 'local',
        format: 'yaml',
        size_bytes: stats.size,
        checksum,
        content_type: 'application/yaml',
        is_primary: true,
        expires_at: calculateExpiration(config.retention_days || 7)
    });

    return { ...artifact, recordCount: 0 };
}

/**
 * Export data for a single model
 */
async function exportModelData(
    system: any,
    runId: string,
    extractId: string,
    runDir: string,
    modelName: string,
    config: any
): Promise<any> {
    const filename = `${modelName}.jsonl`;
    const filepath = join(runDir, filename);

    const writeStream = createWriteStream(filepath);

    let recordCount = 0;
    let offset = 0;
    const batchSize = 1000;

    // Stream records in batches
    while (true) {
        const records = await system.database.selectAny(modelName, {
            limit: batchSize,
            offset
        });

        if (records.length === 0) break;

        for (const record of records) {
            writeStream.write(JSON.stringify(record) + '\n');
            recordCount++;
        }

        offset += batchSize;
        if (records.length < batchSize) break;
    }

    writeStream.end();

    await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
    });

    const stats = await stat(filepath);
    const checksum = await calculateChecksum(filepath);

    // Create artifact record
    const artifact = await system.database.createOne('extract_artifacts', {
        run_id: runId,
        extract_id: extractId,
        artifact_type: `data-${modelName}`,
        artifact_name: filename,
        storage_path: filepath,
        storage_backend: 'local',
        format: 'jsonl',
        size_bytes: stats.size,
        checksum,
        content_type: 'application/x-ndjson',
        is_primary: true,
        expires_at: calculateExpiration(config.retention_days || 7)
    });

    return { ...artifact, recordCount };
}

/**
 * Create manifest file
 */
async function createManifest(
    system: any,
    runId: string,
    extractId: string,
    runDir: string,
    artifacts: any[],
    config: any
): Promise<any> {
    const manifest = {
        version: '1.0',
        generated_at: new Date().toISOString(),
        run_id: runId,
        extract_id: extractId,
        format: config.format,
        include: config.include,
        artifacts: artifacts.map(a => ({
            type: a.artifact_type,
            name: a.artifact_name,
            size: a.size_bytes,
            checksum: a.checksum,
            records: a.recordCount || 0
        }))
    };

    const filename = 'manifest.json';
    const filepath = join(runDir, filename);
    const content = JSON.stringify(manifest, null, 2);

    const writeStream = createWriteStream(filepath);
    writeStream.write(content);
    writeStream.end();

    await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
    });

    const stats = await stat(filepath);
    const checksum = await calculateChecksum(filepath);

    return await system.database.createOne('extract_artifacts', {
        run_id: runId,
        extract_id: extractId,
        artifact_type: 'manifest',
        artifact_name: filename,
        storage_path: filepath,
        storage_backend: 'local',
        format: 'json',
        size_bytes: stats.size,
        checksum,
        content_type: 'application/json',
        is_primary: false,
        expires_at: calculateExpiration(config.retention_days || 7)
    });
}

/**
 * Update run progress
 */
async function updateProgress(system: any, runId: string, progress: number, detail: any): Promise<void> {
    await system.database.updateOne('extract_runs', runId, {
        progress: Math.min(progress, 100),
        progress_detail: detail
    });
}

/**
 * Calculate SHA256 checksum of a file
 */
async function calculateChecksum(filepath: string): Promise<string> {
    const content = await readFile(filepath);
    return createHash('sha256').update(content).digest('hex');
}

/**
 * Calculate expiration date
 */
function calculateExpiration(retentionDays: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + retentionDays);
    return date;
}
