import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { YamlFormatter } from '@src/lib/formatters/yaml.js';
import { createReadStream, mkdirSync } from 'fs';
import { readFile, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { Extract } from 'unzipper';

const RESTORES_DIR = '/tmp/restores';

/**
 * POST /api/restores/:record/execute
 *
 * Execute a restore job synchronously.
 * This is the internal endpoint called by the fire-and-forget mechanism.
 * The HTTP connection stays open until the restore completes.
 *
 * Expects :record to be a restore_runs.id (not restores.id)
 */
export default withTransactionParams(async (context, { system, record: runId }) => {
    if (!runId) {
        throw HttpErrors.badRequest('Run ID required');
    }

    // Get the restore run record
    const run = await system.database.select404(
        'restore_runs',
        { where: { id: runId } },
        'Restore run not found'
    );

    // Validate run is in queued state
    if (run.status !== 'queued') {
        throw HttpErrors.conflict(`Restore run is not queued (status: ${run.status})`);
    }

    // Get the restore configuration
    const restore = await system.database.select404(
        'restores',
        { where: { id: run.restore_id } },
        'Restore configuration not found'
    );

    const startTime = Date.now();

    try {
        // Update to running
        await system.database.updateOne('restore_runs', runId, {
            status: 'running',
            started_at: new Date(),
            progress: 0
        });

        // Create run directory
        mkdirSync(RESTORES_DIR, { recursive: true });
        const runDir = join(RESTORES_DIR, runId);
        mkdirSync(runDir, { recursive: true });

        const config = restore;
        const include = config.include || ['describe', 'data'];
        const conflictStrategy = config.conflict_strategy || 'upsert';

        // Extract uploaded file
        await log(system, runId, 'info', 'upload', null, null, 'Extracting uploaded file');
        await extractUploadedFile(config.source_ref, runDir);

        // Validate extracted files
        await log(system, runId, 'info', 'validation', null, null, 'Validating file structure');
        const files = await readdir(runDir);

        // Statistics
        let modelsCreated = 0;
        let fieldsCreated = 0;
        let recordsImported = 0;
        let recordsSkipped = 0;
        let recordsUpdated = 0;

        // Import describe metadata (models + fields)
        if (include.includes('describe') && files.includes('describe.yaml')) {
            await log(system, runId, 'info', 'describe_import', null, null, 'Importing model definitions');

            const describeResult = await importDescribeMetadata(
                system,
                runId,
                runDir,
                config
            );

            modelsCreated = describeResult.modelsCreated;
            fieldsCreated = describeResult.fieldsCreated;

            await updateProgress(system, runId, 25, {
                phase: 'imported_describe',
                models_created: modelsCreated,
                fields_created: fieldsCreated
            });
        }

        // Import data
        if (include.includes('data')) {
            await log(system, runId, 'info', 'data_import', null, null, 'Importing data records');

            const dataFiles = files.filter(f => f.endsWith('.jsonl'));
            let processedFiles = 0;

            for (const dataFile of dataFiles) {
                const modelName = dataFile.replace('.jsonl', '');

                // Skip if models filter specified and this model not included
                if (config.models && !config.models.includes(modelName)) {
                    await log(system, runId, 'info', 'data_import', modelName, null,
                        `Skipping model (not in filter)`);
                    continue;
                }

                const dataResult = await importModelData(
                    system,
                    runId,
                    runDir,
                    modelName,
                    dataFile,
                    conflictStrategy,
                    config
                );

                recordsImported += dataResult.imported;
                recordsSkipped += dataResult.skipped;
                recordsUpdated += dataResult.updated;
                processedFiles++;

                // Update progress (25% for describe, 75% for data)
                const dataProgress = 25 + Math.floor((processedFiles / dataFiles.length) * 75);
                await updateProgress(system, runId, Math.min(dataProgress, 99), {
                    phase: 'importing_data',
                    files_total: dataFiles.length,
                    files_completed: processedFiles,
                    current_model: modelName,
                    records_imported: recordsImported,
                    records_skipped: recordsSkipped
                });
            }
        }

        // Clean up extracted files
        await rm(runDir, { recursive: true, force: true });

        // Calculate duration
        const duration = Math.floor((Date.now() - startTime) / 1000);

        // Mark complete
        await system.database.updateOne('restore_runs', runId, {
            status: 'completed',
            progress: 100,
            completed_at: new Date(),
            duration_seconds: duration,
            models_created: modelsCreated,
            fields_created: fieldsCreated,
            records_imported: recordsImported,
            records_skipped: recordsSkipped,
            records_updated: recordsUpdated
        });

        await system.database.updateOne('restores', restore.id, {
            successful_runs: (restore.successful_runs || 0) + 1
        });

        await log(system, runId, 'info', null, null, null, 'Restore completed successfully', {
            duration,
            models_created: modelsCreated,
            fields_created: fieldsCreated,
            records_imported: recordsImported,
            records_skipped: recordsSkipped,
            records_updated: recordsUpdated
        });

        console.info('Restore job completed', {
            runId,
            duration,
            modelsCreated,
            fieldsCreated,
            recordsImported,
            recordsSkipped,
            recordsUpdated
        });

        setRouteResult(context, {
            run_id: runId,
            status: 'completed',
            duration_seconds: duration,
            models_created: modelsCreated,
            fields_created: fieldsCreated,
            records_imported: recordsImported,
            records_skipped: recordsSkipped,
            records_updated: recordsUpdated
        });

    } catch (error) {
        const duration = Math.floor((Date.now() - startTime) / 1000);
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.error('Restore job failed', { runId, error: errorMessage });

        await log(system, runId, 'error', null, null, null, `Restore failed: ${errorMessage}`, {
            stack: error instanceof Error ? error.stack : undefined
        });

        await system.database.updateOne('restore_runs', runId, {
            status: 'failed',
            completed_at: new Date(),
            duration_seconds: duration,
            error: errorMessage,
            error_detail: error instanceof Error ? error.stack : undefined
        });

        await system.database.updateOne('restores', restore.id, {
            failed_runs: (restore.failed_runs || 0) + 1
        });

        throw error;
    }
});

/**
 * Extract uploaded ZIP file
 */
async function extractUploadedFile(filepath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        createReadStream(filepath)
            .pipe(Extract({ path: destDir }))
            .on('close', resolve)
            .on('error', reject);
    });
}

/**
 * Import describe metadata (models + fields)
 */
async function importDescribeMetadata(
    system: any,
    runId: string,
    runDir: string,
    config: any
): Promise<{ modelsCreated: number; fieldsCreated: number }> {
    const describeFilepath = join(runDir, 'describe.yaml');
    const content = await readFile(describeFilepath, 'utf8');
    const describe = YamlFormatter.decode(content);

    let modelsCreated = 0;
    let fieldsCreated = 0;

    for (const [modelName, modelDef] of Object.entries(describe as any)) {
        // Skip if models filter specified and this model not included
        if (config.models && !config.models.includes(modelName)) {
            await log(system, runId, 'info', 'describe_import', modelName, null,
                'Skipping model (not in filter)');
            continue;
        }

        // Check if model exists
        const existingModel = await system.describe.models.selectOne({
            where: { model_name: modelName }
        });

        if (!existingModel) {
            if (!config.create_models) {
                await log(system, runId, 'error', 'describe_import', modelName, null,
                    'Model does not exist and create_models is false');
                throw HttpErrors.conflict(`Model ${modelName} does not exist`);
            }

            // Create new model
            const { fields, ...modelFields } = modelDef as any;
            await system.describe.models.createOne({
                model_name: modelName,
                ...modelFields
            });

            modelsCreated++;
            await log(system, runId, 'info', 'describe_import', modelName, null,
                'Created model');
        }

        // Process fields
        const fields = (modelDef as any).fields || {};
        for (const [fieldName, fieldDef] of Object.entries(fields)) {
            // Check if field exists
            const existingField = await system.describe.fields.selectOne({
                where: {
                    model_name: modelName,
                    field_name: fieldName
                }
            });

            if (!existingField) {
                // Create new field
                await system.describe.fields.createOne({
                    model_name: modelName,
                    field_name: fieldName,
                    ...(fieldDef as any)
                });

                fieldsCreated++;
                await log(system, runId, 'info', 'describe_import', modelName, null,
                    `Created field: ${fieldName}`);
            }
        }
    }

    return { modelsCreated, fieldsCreated };
}

/**
 * Import data for a single model
 */
async function importModelData(
    system: any,
    runId: string,
    runDir: string,
    modelName: string,
    dataFile: string,
    conflictStrategy: string,
    config: any
): Promise<{ imported: number; skipped: number; updated: number }> {
    const filepath = join(runDir, dataFile);
    const content = await readFile(filepath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    let imported = 0;
    let skipped = 0;
    let updated = 0;

    // Get existing record IDs for sync/skip strategies
    let existingIds: Set<string> | null = null;
    if (['sync', 'skip'].includes(conflictStrategy)) {
        const existingRecords = await system.database.selectAny(modelName, {});
        existingIds = new Set(existingRecords.map((r: any) => r.id));
    }

    // Apply strategy
    switch (conflictStrategy) {
        case 'replace':
            // Delete all existing records
            await system.database.deleteAny(modelName, {});
            await log(system, runId, 'info', 'data_import', modelName, null,
                'Deleted all existing records (replace strategy)');

            // Import all records
            for (const line of lines) {
                const record = JSON.parse(line);
                await system.database.createOne(modelName, record);
                imported++;
            }
            break;

        case 'upsert':
            // Update existing or insert new
            for (const line of lines) {
                const record = JSON.parse(line);
                const existing = await system.database.selectOne(modelName, {
                    where: { id: record.id }
                });

                if (existing) {
                    await system.database.updateOne(modelName, record.id, record);
                    updated++;
                } else {
                    await system.database.createOne(modelName, record);
                    imported++;
                }
            }
            break;

        case 'merge':
            // Only import if model is new (was created in this restore)
            const modelWasCreated = await wasModelCreatedInThisRun(system, runId, modelName);
            if (modelWasCreated) {
                for (const line of lines) {
                    const record = JSON.parse(line);
                    await system.database.createOne(modelName, record);
                    imported++;
                }
            } else {
                skipped = lines.length;
                await log(system, runId, 'info', 'data_import', modelName, null,
                    `Skipped ${skipped} records (model exists, merge strategy)`);
            }
            break;

        case 'sync':
            // Import only records with IDs that don't exist in parent
            for (const line of lines) {
                const record = JSON.parse(line);
                if (existingIds!.has(record.id)) {
                    skipped++;
                    await log(system, runId, 'info', 'data_import', modelName, record.id,
                        'Skipped existing record (sync strategy)');
                } else {
                    await system.database.createOne(modelName, record);
                    imported++;
                }
            }
            break;

        case 'skip':
            // Skip any record that exists
            for (const line of lines) {
                const record = JSON.parse(line);
                if (existingIds!.has(record.id)) {
                    skipped++;
                } else {
                    await system.database.createOne(modelName, record);
                    imported++;
                }
            }
            break;

        case 'error':
            // Error on any conflict
            for (const line of lines) {
                const record = JSON.parse(line);
                const existing = await system.database.selectOne(modelName, {
                    where: { id: record.id }
                });

                if (existing) {
                    await log(system, runId, 'error', 'data_import', modelName, record.id,
                        'Record already exists (error strategy)');
                    throw HttpErrors.conflict(
                        `Record ${record.id} already exists in ${modelName}`
                    );
                }

                await system.database.createOne(modelName, record);
                imported++;
            }
            break;

        default:
            throw HttpErrors.badRequest(`Unknown conflict strategy: ${conflictStrategy}`);
    }

    await log(system, runId, 'info', 'data_import', modelName, null,
        `Imported ${imported} records, skipped ${skipped}, updated ${updated}`);

    return { imported, skipped, updated };
}

/**
 * Check if model was created in this restore run
 */
async function wasModelCreatedInThisRun(system: any, runId: string, modelName: string): Promise<boolean> {
    const logs = await system.database.selectAny('restore_logs', {
        where: {
            run_id: runId,
            phase: 'describe_import',
            model_name: modelName,
            message: 'Created model'
        }
    });

    return logs.length > 0;
}

/**
 * Write a log entry
 */
async function log(
    system: any,
    runId: string,
    level: 'info' | 'warn' | 'error',
    phase: string | null,
    modelName: string | null,
    recordId: string | null,
    message: string,
    detail?: any
): Promise<void> {
    await system.database.createOne('restore_logs', {
        run_id: runId,
        level,
        phase,
        model_name: modelName,
        record_id: recordId,
        message,
        detail: detail || null
    });
}

/**
 * Update run progress
 */
async function updateProgress(system: any, runId: string, progress: number, detail: any): Promise<void> {
    await system.database.updateOne('restore_runs', runId, {
        progress: Math.min(progress, 100),
        progress_detail: detail
    });
}
