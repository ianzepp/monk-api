/**
 * DataMount - CRUD operations as virtual filesystem
 *
 * Matches HTTP API structure:
 * - /api/data/                    → GET /api/data (list models)
 * - /api/data/users/              → GET /api/data/:model (list records)
 * - /api/data/users/:id           → GET /api/data/:model/:id (record as JSON)
 *
 * Supports write operations:
 * - write() → POST (create) or PUT (update)
 * - unlink() → DELETE
 */

import type { System } from '@src/lib/system.js';
import type { Mount, VFSEntry } from '../types.js';
import { VFSError } from '../types.js';

type ParsedPath =
    | { type: 'root' }
    | { type: 'model'; modelName: string }
    | { type: 'record'; modelName: string; recordId: string };

export class DataMount implements Mount {
    constructor(private readonly system: System) {}

    async stat(path: string): Promise<VFSEntry> {
        const parsed = this.parsePath(path);

        if (parsed.type === 'root') {
            return {
                name: 'data',
                type: 'directory',
                size: 0,
                mode: 0o755,
            };
        }

        if (parsed.type === 'model') {
            const model = await this.system.describe.models.selectOne({
                where: { model_name: parsed.modelName },
            });
            if (!model) {
                throw new VFSError('ENOENT', path);
            }
            return {
                name: parsed.modelName,
                type: 'directory',
                size: 0,
                mode: 0o755,
                mtime: model.updated_at ? new Date(model.updated_at) : undefined,
            };
        }

        if (parsed.type === 'record') {
            const record = await this.system.database.selectOne(parsed.modelName, {
                where: { id: parsed.recordId },
            });
            if (!record) {
                throw new VFSError('ENOENT', path);
            }
            const content = JSON.stringify(record, null, 2);
            return {
                name: parsed.recordId,
                type: 'file',
                size: Buffer.byteLength(content, 'utf8'),
                mode: 0o644,
                mtime: record.updated_at ? new Date(record.updated_at) : undefined,
                ctime: record.created_at ? new Date(record.created_at) : undefined,
            };
        }

        throw new VFSError('ENOENT', path);
    }

    async readdir(path: string): Promise<VFSEntry[]> {
        const parsed = this.parsePath(path);

        if (parsed.type === 'root') {
            const models = await this.system.describe.models.selectAny();
            return models.map(m => ({
                name: m.model_name,
                type: 'directory' as const,
                size: 0,
                mode: 0o755,
                mtime: m.updated_at ? new Date(m.updated_at) : undefined,
            }));
        }

        if (parsed.type === 'model') {
            const model = await this.system.describe.models.selectOne({
                where: { model_name: parsed.modelName },
            });
            if (!model) {
                throw new VFSError('ENOENT', path);
            }

            const records = await this.system.database.selectAny(parsed.modelName, {
                limit: 10000,
            });

            return records.map(r => ({
                name: r.id,
                type: 'file' as const,
                size: 0,
                mode: 0o644,
                mtime: r.updated_at ? new Date(r.updated_at) : undefined,
                ctime: r.created_at ? new Date(r.created_at) : undefined,
            }));
        }

        throw new VFSError('ENOTDIR', path);
    }

    async read(path: string): Promise<string> {
        const parsed = this.parsePath(path);

        if (parsed.type === 'root' || parsed.type === 'model') {
            throw new VFSError('EISDIR', path);
        }

        if (parsed.type === 'record') {
            const record = await this.system.database.selectOne(parsed.modelName, {
                where: { id: parsed.recordId },
            });
            if (!record) {
                throw new VFSError('ENOENT', path);
            }
            return JSON.stringify(record, null, 2);
        }

        throw new VFSError('ENOENT', path);
    }

    async write(path: string, content: string | Buffer): Promise<void> {
        const parsed = this.parsePath(path);

        if (parsed.type === 'root' || parsed.type === 'model') {
            throw new VFSError('EISDIR', path);
        }

        if (parsed.type === 'record') {
            const data = JSON.parse(content.toString());

            const existing = await this.system.database.selectOne(parsed.modelName, {
                where: { id: parsed.recordId },
            });

            if (existing) {
                await this.system.database.updateOne(parsed.modelName, parsed.recordId, data);
            } else {
                await this.system.database.createOne(parsed.modelName, {
                    ...data,
                    id: parsed.recordId,
                });
            }
            return;
        }

        throw new VFSError('ENOENT', path);
    }

    async unlink(path: string): Promise<void> {
        const parsed = this.parsePath(path);

        if (parsed.type === 'root' || parsed.type === 'model') {
            throw new VFSError('EISDIR', path);
        }

        if (parsed.type === 'record') {
            const existing = await this.system.database.selectOne(parsed.modelName, {
                where: { id: parsed.recordId },
            });
            if (!existing) {
                throw new VFSError('ENOENT', path);
            }
            await this.system.database.deleteOne(parsed.modelName, parsed.recordId);
            return;
        }

        throw new VFSError('ENOENT', path);
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

        throw new VFSError('ENOENT', path);
    }
}
