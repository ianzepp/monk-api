import type { System } from '@src/lib/system.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { stripSystemFields } from '@src/lib/describe.js';
import { YamlFormatter } from '@src/lib/formatters/yaml.js';
import { createWriteStream, mkdirSync } from 'fs';
import { stat, readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

/**
 * ExtractProcessor - Handles data extraction jobs
 *
 * Executes extract configurations by:
 * 1. Creating extract_run record
 * 2. Exporting describe metadata (if requested)
 * 3. Exporting data (if requested)
 * 4. Creating artifact records
 * 5. Updating run status and progress
 */
export class ExtractProcessor {
    private extractsDir = '/tmp/extracts';

    constructor(private system: System) {
        // Ensure extracts directory exists
        try {
            mkdirSync(this.extractsDir, { recursive: true });
        } catch (err) {
            console.error('Failed to create extracts directory', { err });
        }
    }

    /**
     * Execute an extract job
     */
    async execute(extractId: string): Promise<string> {
        // Get extract configuration
        const extract = await this.system.database.select404(
            'extracts',
            { where: { id: extractId } },
            'Extract not found'
        );

        // Validate extract is enabled
        if (!extract.enabled) {
            throw HttpErrors.conflict('Extract is disabled');
        }

        // Check if already running
        const runningRuns = await this.system.database.selectAny('extract_runs', {
            where: {
                extract_id: extractId,
                status: { $in: ['pending', 'queued', 'running'] }
            }
        });

        if (runningRuns.length > 0) {
            throw HttpErrors.conflict('Extract is already running');
        }

        // Create extract_run record
        const run = await this.system.database.createOne('extract_runs', {
            extract_id: extractId,
            extract_name: extract.name,
            status: 'queued',
            progress: 0,
            triggered_by: 'manual',
            executed_by: this.system.userId,
            config_snapshot: {
                format: extract.format,
                include: extract.include,
                models: extract.models,
                compress: extract.compress,
                split_files: extract.split_files
            }
        });

        // Update extract stats
        await this.system.database.updateOne('extracts', extractId, {
            last_run_id: run.id,
            last_run_status: 'queued',
            last_run_at: new Date(),
            total_runs: (extract.total_runs || 0) + 1
        });

        // Execute in background (don't await)
        this.executeExtractJob(run.id, extract).catch(err => {
            console.error('Extract job failed', { runId: run.id, err });
        });

        return run.id;
    }

    /**
     * Execute the actual extraction job
     */
    private async executeExtractJob(runId: string, extractConfig: any): Promise<void> {
        const startTime = Date.now();

        try {
            // Update to running
            await this.system.database.updateOne('extract_runs', runId, {
                status: 'running',
                started_at: new Date(),
                progress: 0
            });

            await this.system.database.updateOne('extracts', extractConfig.id, {
                last_run_status: 'running'
            });

            // Create run directory
            const runDir = join(this.extractsDir, runId);
            mkdirSync(runDir, { recursive: true });

            const artifacts: any[] = [];
            const config = extractConfig;
            const include = config.include || ['describe', 'data'];

            // Determine models to export
            const modelsToExport = config.models ||
                (await this.system.describe.models.selectAny({}))
                    .map((s: any) => s.model_name)
                    .filter((name: string) => !['models', 'fields'].includes(name)); // Skip meta models

            let totalRecords = 0;
            let modelsExported = 0;

            // Export describe metadata
            if (include.includes('describe')) {
                console.info('Exporting describe metadata', { runId });

                const artifact = await this.exportDescribeMetadata(
                    runId,
                    extractConfig.id,
                    runDir,
                    modelsToExport,
                    config
                );

                artifacts.push(artifact);

                await this.updateProgress(runId, 25, {
                    phase: 'exported_describe',
                    models_total: modelsToExport.length,
                    models_completed: 0
                });
            }

            // Export data
            if (include.includes('data')) {
                console.info('Exporting data', { runId, models: modelsToExport.length });

                for (const modelName of modelsToExport) {
                    const artifact = await this.exportModelData(
                        runId,
                        extractConfig.id,
                        runDir,
                        modelName,
                        config
                    );

                    artifacts.push(artifact);
                    totalRecords += artifact.recordCount || 0;
                    modelsExported++;

                    // Update progress (25% for describe, 75% for data)
                    const dataProgress = 25 + Math.floor((modelsExported / modelsToExport.length) * 75);
                    await this.updateProgress(runId, Math.min(dataProgress, 99), {
                        phase: 'exporting_data',
                        models_total: modelsToExport.length,
                        models_completed: modelsExported,
                        current_model: modelName,
                        records_exported: totalRecords
                    });
                }
            }

            // Create manifest
            const manifestArtifact = await this.createManifest(
                runId,
                extractConfig.id,
                runDir,
                artifacts,
                config
            );
            artifacts.push(manifestArtifact);

            // Calculate totals
            const totalSize = artifacts.reduce((sum, a) => sum + (a.size_bytes || 0), 0);
            const duration = Math.floor((Date.now() - startTime) / 1000);

            // Mark complete
            await this.system.database.updateOne('extract_runs', runId, {
                status: 'completed',
                progress: 100,
                completed_at: new Date(),
                duration_seconds: duration,
                records_exported: totalRecords,
                models_exported: modelsExported,
                artifacts_created: artifacts.length,
                total_size_bytes: totalSize
            });

            await this.system.database.updateOne('extracts', extractConfig.id, {
                last_run_status: 'completed',
                successful_runs: (extractConfig.successful_runs || 0) + 1
            });

            console.info('Extract job completed', {
                runId,
                duration,
                artifacts: artifacts.length,
                records: totalRecords,
                size: totalSize
            });

        } catch (error) {
            const duration = Math.floor((Date.now() - startTime) / 1000);
            const errorMessage = error instanceof Error ? error.message : String(error);

            console.error('Extract job failed', { runId, error: errorMessage });

            await this.system.database.updateOne('extract_runs', runId, {
                status: 'failed',
                completed_at: new Date(),
                duration_seconds: duration,
                error: errorMessage,
                error_detail: error instanceof Error ? {
                    name: error.name,
                    stack: error.stack
                } : {}
            });

            await this.system.database.updateOne('extracts', extractConfig.id, {
                last_run_status: 'failed',
                failed_runs: (extractConfig.failed_runs || 0) + 1
            });
        }
    }

    /**
     * Export describe metadata (models + fields)
     */
    private async exportDescribeMetadata(
        runId: string,
        extractId: string,
        runDir: string,
        modelsToExport: string[],
        config: any
    ): Promise<any> {
        // Fetch models and fields
        const models = await this.system.describe.models.selectAny({
            where: config.models ? { model_name: { $in: config.models } } : {}
        });

        const fields = await this.system.describe.fields.selectAny({
            where: config.models ? { model_name: { $in: config.models } } : {}
        });

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
        const checksum = await this.calculateChecksum(filepath);

        // Create artifact record
        const artifact = await this.system.database.createOne('extract_artifacts', {
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
            expires_at: this.calculateExpiration(config.retention_days || 7)
        });

        return { ...artifact, recordCount: 0 };
    }

    /**
     * Export data for a single model
     */
    private async exportModelData(
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
            const records = await this.system.database.selectAny(modelName, {
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
        const checksum = await this.calculateChecksum(filepath);

        // Create artifact record
        const artifact = await this.system.database.createOne('extract_artifacts', {
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
            expires_at: this.calculateExpiration(config.retention_days || 7)
        });

        return { ...artifact, recordCount };
    }

    /**
     * Create manifest file
     */
    private async createManifest(
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
        const checksum = await this.calculateChecksum(filepath);

        return await this.system.database.createOne('extract_artifacts', {
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
            expires_at: this.calculateExpiration(config.retention_days || 7)
        });
    }

    /**
     * Update run progress
     */
    private async updateProgress(runId: string, progress: number, detail: any): Promise<void> {
        await this.system.database.updateOne('extract_runs', runId, {
            progress: Math.min(progress, 100),
            progress_detail: detail
        });
    }

    /**
     * Calculate SHA256 checksum of a file
     */
    private async calculateChecksum(filepath: string): Promise<string> {
        const content = await readFile(filepath);
        return createHash('sha256').update(content).digest('hex');
    }

    /**
     * Calculate expiration date
     */
    private calculateExpiration(retentionDays: number): Date {
        const date = new Date();
        date.setDate(date.getDate() + retentionDays);
        return date;
    }
}
