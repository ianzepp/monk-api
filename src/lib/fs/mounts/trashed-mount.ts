/**
 * TrashedMount - Soft-deleted records as filesystem
 *
 * Like DataMount but only shows trashed records:
 * - /api/trashed/                 → List models with trashed records
 * - /api/trashed/orders/          → List trashed records for model
 * - /api/trashed/orders/:id       → View trashed record (JSON)
 *
 * Read-only mount. Restore/permanent delete via /api/data.
 */

import type { System } from '@src/lib/system.js';
import type { Mount, FSEntry } from '../types.js';
import { FSError } from '../types.js';

type ParsedPath =
    | { type: 'root' }
    | { type: 'model'; modelName: string }
    | { type: 'record'; modelName: string; recordId: string };

export class TrashedMount implements Mount {
    constructor(private readonly system: System) {}

    async stat(path: string): Promise<FSEntry> {
        const parsed = this.parsePath(path);

        if (parsed.type === 'root') {
            return {
                name: 'trashed',
                type: 'directory',
                size: 0,
                mode: 0o755,
            };
        }

        if (parsed.type === 'model') {
            // Check model exists
            const model = await this.system.describe.models.selectOne({
                where: { model_name: parsed.modelName },
            });
            if (!model) {
                throw new FSError('ENOENT', path);
            }

            // Check if any trashed records exist
            const trashed = await this.system.database.selectAny(parsed.modelName, {
                limit: 1,
            }, { context: 'api', trashed: 'only' });

            if (trashed.length === 0) {
                throw new FSError('ENOENT', path);
            }

            return {
                name: parsed.modelName,
                type: 'directory',
                size: 0,
                mode: 0o755,
            };
        }

        if (parsed.type === 'record') {
            const record = await this.system.database.selectOne(parsed.modelName, {
                where: { id: parsed.recordId },
            }, { context: 'api', trashed: 'only' });

            if (!record) {
                throw new FSError('ENOENT', path);
            }

            const content = JSON.stringify(record, null, 2);
            return {
                name: parsed.recordId,
                type: 'file',
                size: Buffer.byteLength(content, 'utf8'),
                mode: 0o444,
                mtime: record.trashed_at ? new Date(record.trashed_at) : undefined,
                ctime: record.created_at ? new Date(record.created_at) : undefined,
            };
        }

        throw new FSError('ENOENT', path);
    }

    async readdir(path: string): Promise<FSEntry[]> {
        const parsed = this.parsePath(path);

        if (parsed.type === 'root') {
            // Get all models and check which have trashed records
            const models = await this.system.describe.models.selectAny();
            const entries: FSEntry[] = [];

            for (const model of models) {
                const trashed = await this.system.database.selectAny(model.model_name, {
                    limit: 1,
                }, { context: 'api', trashed: 'only' });

                if (trashed.length > 0) {
                    entries.push({
                        name: model.model_name,
                        type: 'directory',
                        size: 0,
                        mode: 0o755,
                    });
                }
            }

            return entries;
        }

        if (parsed.type === 'model') {
            const records = await this.system.database.selectAny(parsed.modelName, {
                limit: 10000,
            }, { context: 'api', trashed: 'only' });

            if (records.length === 0) {
                throw new FSError('ENOENT', path);
            }

            return records.map(r => ({
                name: r.id,
                type: 'file' as const,
                size: 0,
                mode: 0o444,
                mtime: r.trashed_at ? new Date(r.trashed_at) : undefined,
                ctime: r.created_at ? new Date(r.created_at) : undefined,
            }));
        }

        throw new FSError('ENOTDIR', path);
    }

    async read(path: string): Promise<string> {
        const parsed = this.parsePath(path);

        if (parsed.type === 'root' || parsed.type === 'model') {
            throw new FSError('EISDIR', path);
        }

        if (parsed.type === 'record') {
            const record = await this.system.database.selectOne(parsed.modelName, {
                where: { id: parsed.recordId },
            }, { context: 'api', trashed: 'only' });

            if (!record) {
                throw new FSError('ENOENT', path);
            }

            return JSON.stringify(record, null, 2);
        }

        throw new FSError('ENOENT', path);
    }

    private parsePath(path: string): ParsedPath {
        const segments = path.split('/').filter(Boolean);

        if (segments.length === 0) {
            return { type: 'root' };
        }

        if (segments.length === 1) {
            return { type: 'model', modelName: segments[0] };
        }

        if (segments.length === 2) {
            return { type: 'record', modelName: segments[0], recordId: segments[1] };
        }

        throw new FSError('ENOENT', path);
    }
}
