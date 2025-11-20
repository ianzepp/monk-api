import type { System } from '@src/lib/system.js';
import { logger } from '@src/lib/logger.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { YamlFormatter } from '@src/lib/formatters/yaml.js';
import { createReadStream, createWriteStream, mkdirSync } from 'fs';
import { stat, readFile, readdir, unlink, rm } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { createGunzip } from 'zlib';
import { Extract } from 'unzipper';

/**
 * RestoreProcessor - Handles data restoration jobs
 *
 * Executes restore configurations by:
 * 1. Creating restore_run record
 * 2. Extracting uploaded files
 * 3. Validating file structure
 * 4. Importing describe metadata (if present)
 * 5. Importing data (if present)
 * 6. Logging all operations
 * 7. Updating run status and progress
 */
export class RestoreProcessor {
    private restoresDir = '/tmp/restores';

    constructor(private system: System) {
        // Ensure restores directory exists
        try {
            mkdirSync(this.restoresDir, { recursive: true });
        } catch (err) {
            logger.error('Failed to create restores directory', { err });
        }
    }

    /**
     * Execute a restore job
     */
    async execute(restoreId: string): Promise<string> {
        // Get restore configuration
        const restore = await this.system.database.select404(
            'restores',
            { where: { id: restoreId } },
            'Restore not found'
        );

        // Validate restore is enabled
        if (!restore.enabled) {
            throw HttpErrors.conflict('Restore is disabled');
        }

        // Validate source exists
        if (!restore.source_ref) {
            throw HttpErrors.badRequest('No source file specified');
        }

        // Check if already running
        const runningRuns = await this.system.database.selectAny('restore_runs', {
            where: {
                restore_id: restoreId,
                status: { $in: ['pending', 'queued', 'running'] }
            }
        });

        if (runningRuns.length > 0) {
            throw HttpErrors.conflict('Restore is already running');
        }

        // Create restore_run record
        const run = await this.system.database.createOne('restore_runs', {
            restore_id: restoreId,
            restore_name: restore.name,
            source_filename: restore.source_ref,
            status: 'queued',
            progress: 0,
            config_snapshot: {
                source_type: restore.source_type,
                conflict_strategy: restore.conflict_strategy,
                include: restore.include,
                schemas: restore.schemas,
                create_schemas: restore.create_schemas
            }
        });

        // Update restore stats
        await this.system.database.updateOne('restores', restoreId, {
            last_run_id: run.id,
            last_run_at: new Date(),
            total_runs: (restore.total_runs || 0) + 1
        });

        // Execute in background (don't await)
        this.executeRestoreJob(run.id, restore).catch(err => {
            logger.error('Restore job failed', { runId: run.id, err });
        });

        return run.id;
    }

    /**
     * Execute restore from uploaded file (convenience method)
     */
    async executeFromFile(filepath: string, filename: string, config?: Partial<any>): Promise<string> {
        // Create a temporary restore configuration
        const restore = await this.system.database.createOne('restores', {
            name: config?.name || `Import ${filename}`,
            description: config?.description || 'Direct file import',
            source_type: 'upload',
            source_ref: filepath,
            conflict_strategy: config?.conflict_strategy || 'upsert',
            include: config?.include || ['describe', 'data'],
            schemas: config?.schemas || null,
            create_schemas: config?.create_schemas !== false,
            enabled: true
        });

        return this.execute(restore.id);
    }

    /**
     * Execute the actual restoration job
     */
    private async executeRestoreJob(runId: string, restoreConfig: any): Promise<void> {
        const startTime = Date.now();

        try {
            // Update to running
            await this.system.database.updateOne('restore_runs', runId, {
                status: 'running',
                started_at: new Date(),
                progress: 0
            });

            // Create run directory
            const runDir = join(this.restoresDir, runId);
            mkdirSync(runDir, { recursive: true });

            const config = restoreConfig;
            const include = config.include || ['describe', 'data'];
            const conflictStrategy = config.conflict_strategy || 'upsert';

            // Extract uploaded file
            await this.log(runId, 'info', 'upload', null, null, 'Extracting uploaded file');
            await this.extractUploadedFile(runId, config.source_ref, runDir);

            // Validate extracted files
            await this.log(runId, 'info', 'validation', null, null, 'Validating file structure');
            const files = await readdir(runDir);

            // Statistics
            let schemasCreated = 0;
            let columnsCreated = 0;
            let recordsImported = 0;
            let recordsSkipped = 0;
            let recordsUpdated = 0;

            // Import describe metadata (schemas + columns)
            if (include.includes('describe') && files.includes('describe.yaml')) {
                await this.log(runId, 'info', 'describe_import', null, null, 'Importing schema definitions');

                const describeResult = await this.importDescribeMetadata(
                    runId,
                    runDir,
                    config
                );

                schemasCreated = describeResult.schemasCreated;
                columnsCreated = describeResult.columnsCreated;

                await this.updateProgress(runId, 25, {
                    phase: 'imported_describe',
                    schemas_created: schemasCreated,
                    columns_created: columnsCreated
                });
            }

            // Import data
            if (include.includes('data')) {
                await this.log(runId, 'info', 'data_import', null, null, 'Importing data records');

                const dataFiles = files.filter(f => f.endsWith('.jsonl'));
                let processedFiles = 0;

                for (const dataFile of dataFiles) {
                    const schemaName = dataFile.replace('.jsonl', '');

                    // Skip if schemas filter specified and this schema not included
                    if (config.schemas && !config.schemas.includes(schemaName)) {
                        await this.log(runId, 'info', 'data_import', schemaName, null,
                            `Skipping schema (not in filter)`);
                        continue;
                    }

                    const dataResult = await this.importSchemaData(
                        runId,
                        runDir,
                        schemaName,
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
                    await this.updateProgress(runId, Math.min(dataProgress, 99), {
                        phase: 'importing_data',
                        files_total: dataFiles.length,
                        files_completed: processedFiles,
                        current_schema: schemaName,
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
            await this.system.database.updateOne('restore_runs', runId, {
                status: 'completed',
                progress: 100,
                completed_at: new Date(),
                duration_seconds: duration,
                schemas_created: schemasCreated,
                columns_created: columnsCreated,
                records_imported: recordsImported,
                records_skipped: recordsSkipped,
                records_updated: recordsUpdated
            });

            await this.system.database.updateOne('restores', restoreConfig.id, {
                successful_runs: (restoreConfig.successful_runs || 0) + 1
            });

            await this.log(runId, 'info', null, null, null, 'Restore completed successfully', {
                duration,
                schemas_created: schemasCreated,
                columns_created: columnsCreated,
                records_imported: recordsImported,
                records_skipped: recordsSkipped,
                records_updated: recordsUpdated
            });

            logger.info('Restore job completed', {
                runId,
                duration,
                schemasCreated,
                columnsCreated,
                recordsImported,
                recordsSkipped,
                recordsUpdated
            });

        } catch (error) {
            const duration = Math.floor((Date.now() - startTime) / 1000);
            const errorMessage = error instanceof Error ? error.message : String(error);

            logger.error('Restore job failed', { runId, error: errorMessage });

            await this.log(runId, 'error', null, null, null, `Restore failed: ${errorMessage}`, {
                stack: error instanceof Error ? error.stack : undefined
            });

            await this.system.database.updateOne('restore_runs', runId, {
                status: 'failed',
                completed_at: new Date(),
                duration_seconds: duration,
                error: errorMessage,
                error_detail: error instanceof Error ? error.stack : undefined
            });

            await this.system.database.updateOne('restores', restoreConfig.id, {
                failed_runs: (restoreConfig.failed_runs || 0) + 1
            });
        }
    }

    /**
     * Extract uploaded ZIP file
     */
    private async extractUploadedFile(runId: string, filepath: string, destDir: string): Promise<void> {
        return new Promise((resolve, reject) => {
            createReadStream(filepath)
                .pipe(Extract({ path: destDir }))
                .on('close', resolve)
                .on('error', reject);
        });
    }

    /**
     * Import describe metadata (schemas + columns)
     */
    private async importDescribeMetadata(
        runId: string,
        runDir: string,
        config: any
    ): Promise<{ schemasCreated: number; columnsCreated: number }> {
        const describeFilepath = join(runDir, 'describe.yaml');
        const content = await readFile(describeFilepath, 'utf8');
        const describe = YamlFormatter.decode(content);

        let schemasCreated = 0;
        let columnsCreated = 0;

        for (const [schemaName, schemaDef] of Object.entries(describe as any)) {
            // Skip if schemas filter specified and this schema not included
            if (config.schemas && !config.schemas.includes(schemaName)) {
                await this.log(runId, 'info', 'describe_import', schemaName, null,
                    'Skipping schema (not in filter)');
                continue;
            }

            // Check if schema exists
            const existingSchema = await this.system.database.selectOne('schemas', {
                where: { schema_name: schemaName }
            });

            if (!existingSchema) {
                if (!config.create_schemas) {
                    await this.log(runId, 'error', 'describe_import', schemaName, null,
                        'Schema does not exist and create_schemas is false');
                    throw HttpErrors.conflict(`Schema ${schemaName} does not exist`);
                }

                // Create new schema
                const { columns, ...schemaFields } = schemaDef as any;
                await this.system.database.createOne('schemas', {
                    schema_name: schemaName,
                    ...schemaFields
                });

                schemasCreated++;
                await this.log(runId, 'info', 'describe_import', schemaName, null,
                    'Created schema');
            }

            // Process columns
            const columns = (schemaDef as any).columns || {};
            for (const [columnName, columnDef] of Object.entries(columns)) {
                // Check if column exists
                const existingColumn = await this.system.database.selectOne('columns', {
                    where: {
                        schema_name: schemaName,
                        column_name: columnName
                    }
                });

                if (!existingColumn) {
                    // Create new column
                    await this.system.database.createOne('columns', {
                        schema_name: schemaName,
                        column_name: columnName,
                        ...(columnDef as any)
                    });

                    columnsCreated++;
                    await this.log(runId, 'info', 'describe_import', schemaName, null,
                        `Created column: ${columnName}`);
                }
            }
        }

        return { schemasCreated, columnsCreated };
    }

    /**
     * Import data for a single schema
     */
    private async importSchemaData(
        runId: string,
        runDir: string,
        schemaName: string,
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
            const existingRecords = await this.system.database.selectAny(schemaName, {});
            existingIds = new Set(existingRecords.map((r: any) => r.id));
        }

        // Apply strategy
        switch (conflictStrategy) {
            case 'replace':
                // Delete all existing records
                await this.system.database.deleteMany(schemaName, {});
                await this.log(runId, 'info', 'data_import', schemaName, null,
                    'Deleted all existing records (replace strategy)');

                // Import all records
                for (const line of lines) {
                    const record = JSON.parse(line);
                    await this.system.database.createOne(schemaName, record);
                    imported++;
                }
                break;

            case 'upsert':
                // Update existing or insert new
                for (const line of lines) {
                    const record = JSON.parse(line);
                    const existing = await this.system.database.selectOne(schemaName, {
                        where: { id: record.id }
                    });

                    if (existing) {
                        await this.system.database.updateOne(schemaName, record.id, record);
                        updated++;
                    } else {
                        await this.system.database.createOne(schemaName, record);
                        imported++;
                    }
                }
                break;

            case 'merge':
                // Only import if schema is new (was created in this restore)
                const schemaWasCreated = await this.wasSchemaCreatedInThisRun(runId, schemaName);
                if (schemaWasCreated) {
                    for (const line of lines) {
                        const record = JSON.parse(line);
                        await this.system.database.createOne(schemaName, record);
                        imported++;
                    }
                } else {
                    skipped = lines.length;
                    await this.log(runId, 'info', 'data_import', schemaName, null,
                        `Skipped ${skipped} records (schema exists, merge strategy)`);
                }
                break;

            case 'sync':
                // Import only records with IDs that don't exist in parent
                for (const line of lines) {
                    const record = JSON.parse(line);
                    if (existingIds!.has(record.id)) {
                        skipped++;
                        await this.log(runId, 'info', 'data_import', schemaName, record.id,
                            'Skipped existing record (sync strategy)');
                    } else {
                        await this.system.database.createOne(schemaName, record);
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
                        await this.system.database.createOne(schemaName, record);
                        imported++;
                    }
                }
                break;

            case 'error':
                // Error on any conflict
                for (const line of lines) {
                    const record = JSON.parse(line);
                    const existing = await this.system.database.selectOne(schemaName, {
                        where: { id: record.id }
                    });

                    if (existing) {
                        await this.log(runId, 'error', 'data_import', schemaName, record.id,
                            'Record already exists (error strategy)');
                        throw HttpErrors.conflict(
                            `Record ${record.id} already exists in ${schemaName}`
                        );
                    }

                    await this.system.database.createOne(schemaName, record);
                    imported++;
                }
                break;

            default:
                throw HttpErrors.badRequest(`Unknown conflict strategy: ${conflictStrategy}`);
        }

        await this.log(runId, 'info', 'data_import', schemaName, null,
            `Imported ${imported} records, skipped ${skipped}, updated ${updated}`);

        return { imported, skipped, updated };
    }

    /**
     * Check if schema was created in this restore run
     */
    private async wasSchemaCreatedInThisRun(runId: string, schemaName: string): Promise<boolean> {
        const logs = await this.system.database.selectAny('restore_logs', {
            where: {
                run_id: runId,
                phase: 'describe_import',
                schema_name: schemaName,
                message: 'Created schema'
            }
        });

        return logs.length > 0;
    }

    /**
     * Write a log entry
     */
    private async log(
        runId: string,
        level: 'info' | 'warn' | 'error',
        phase: string | null,
        schemaName: string | null,
        recordId: string | null,
        message: string,
        detail?: any
    ): Promise<void> {
        await this.system.database.createOne('restore_logs', {
            run_id: runId,
            level,
            phase,
            schema_name: schemaName,
            record_id: recordId,
            message,
            detail: detail || null
        });
    }

    /**
     * Update run progress
     */
    private async updateProgress(runId: string, progress: number, detail: any): Promise<void> {
        await this.system.database.updateOne('restore_runs', runId, {
            progress: Math.min(progress, 100),
            progress_detail: detail
        });
    }
}
