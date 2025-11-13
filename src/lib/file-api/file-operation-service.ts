import { FileTimestampFormatter } from '@src/lib/file-api/file-timestamp-formatter.js';
import { FileContentCalculator } from '@src/lib/file-api/file-content-calculator.js';
import { filterRecordFields } from '@src/lib/file-api/file-record-filter.js';
import { sortFileEntries } from '@src/lib/file-api/file-entry-sorter.js';
import type {
    FileEntry,
    FileListRequest,
    FileMetadata,
    FilePath,
    FilePermissions,
    FileRetrieveRequest,
    FileStoreRequest,
    FileDeleteRequest,
    FileStatRequest,
    FileSizeRequest,
    FileModifyTimeRequest,
    AccessLevel,
} from '@src/lib/file-api/file-types.js';
import { FilePathParser } from '@src/lib/file-api/file-path-parser.js';
import type { SystemContextWithInfrastructure } from '@src/lib/system-context-types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { isSystemField } from '@src/lib/describe.js';
import type { FilterData } from '@src/lib/filter-types.js';


interface ListResult {
    entries: FileEntry[];
    metadata: FileMetadata;
}

interface RetrieveResult {
    content: any;
    metadata: FileMetadata;
}

interface StoreResult {
    operation: 'create' | 'update' | 'field_update';
    recordId: string;
    fieldName?: string;
    created: boolean;
    updated: boolean;
    validationPassed: boolean;
    metadata: FileMetadata;
}

interface DeleteResult {
    operation: 'soft_delete' | 'field_delete';
    deletedCount: number;
    affectedRecords: string[];
    clearedFields?: string[];
    canRestore: boolean;
    restoreDeadline?: string;
}

interface StatResult {
    metadata: FileMetadata;
    recordInfo: {
        schema: string;
        record_id?: string;
        field_name?: string;
        field_count?: number;
        soft_deleted: boolean;
        access_permissions: string[];
    };
    childrenCount?: number;
    schemaInfo?: {
        description?: string;
        record_count: number;
        field_definitions: Array<{
            name: string;
            type: string;
            required: boolean;
            description?: string;
        }>;
    };
}

interface SizeResult {
    size: number;
    metadata: FileMetadata;
}

interface ModifyTimeResult {
    modifiedTime: string;
    metadata: FileMetadata;
    timestampInfo: {
        source: 'updated_at' | 'created_at' | 'current_time';
        iso_timestamp: string;
        timezone: 'UTC';
    };
}

export class FileOperationService {
    constructor(private readonly system: SystemContextWithInfrastructure) {}

    async list(path: string, options: FileListRequest['file_options'] = {}): Promise<ListResult> {
        const filePath = FilePathParser.parse(path, {
            operation: 'list',
            allowWildcards: true,
            allowCrossSchema: true,
        });

        switch (filePath.type) {
            case 'root':
                return this.listRoot(options);
            case 'data':
            case 'describe':
                return this.listSchemas(filePath.type, options);
            case 'schema':
                if (filePath.has_wildcards) {
                    if (filePath.schema === '*') {
                        const namespace = filePath.raw_path.startsWith('/describe') ? 'describe' : 'data';
                        return this.listSchemas(namespace as 'data' | 'describe', options);
                    }
                    throw HttpErrors.badRequest('Schema wildcards must use "*" to match all schemas', 'SCHEMA_WILDCARD_NOT_SUPPORTED');
                }
                return this.listSchemaRecords(filePath, options);
            case 'record':
                if (filePath.has_wildcards) {
                    if (filePath.record_id === '*') {
                        return this.listSchemaRecords({
                            ...filePath,
                            type: 'schema',
                            record_id: undefined,
                            raw_path: `/data/${filePath.schema}`,
                            normalized_path: `/data/${filePath.schema}`,
                            has_wildcards: false,
                        } as FilePath, options);
                    }
                    throw HttpErrors.badRequest(
                        'Wildcard patterns on record identifiers are not supported (use "*" to select all records)',
                        'UUID_WILDCARD_NOT_SUPPORTED'
                    );
                }
                return this.listRecordFields(filePath, options);
            default:
                throw HttpErrors.badRequest(`Unsupported list path type: ${filePath.type}`, 'UNSUPPORTED_LIST_PATH');
        }
    }

    async retrieve(path: string, options: FileRetrieveRequest['file_options'] = {}): Promise<RetrieveResult> {
        const filePath = FilePathParser.parse(path, {
            operation: 'retrieve',
            allowWildcards: false,
            requireFile: false,
        });

        if (filePath.type !== 'record' && filePath.type !== 'field') {
            throw HttpErrors.badRequest('Retrieve only supports record and field paths', 'INVALID_RETRIEVE_PATH');
        }

        const record = await this.requireRecord(filePath.schema!, filePath.record_id!);
        const timestampInfo = FileTimestampFormatter.getBestTimestamp(record);
        const perms = this.derivePermissions(record);
        const showHidden = options.show_hidden ?? false;

        if (filePath.type === 'field') {
            if (!(filePath.field_name! in record)) {
                throw HttpErrors.notFound(`Field not found: ${filePath.field_name}`, 'FIELD_NOT_FOUND');
            }

            const value = record[filePath.field_name!];
            const canonicalString = typeof value === 'string' ? value : JSON.stringify(value);
            const size = FileContentCalculator.calculateSize(canonicalString);

            if (options.format === 'raw') {
                const raw = this.sliceRawContent(canonicalString, options.start_offset, options.max_bytes);
                return {
                    content: raw.content,
                    metadata: this.buildFileMetadata(path, 'file', perms.permissions, size, timestampInfo.formatted, {
                        content_type: FileContentCalculator.detectContentType(value, filePath.field_name!),
                        etag: FileContentCalculator.generateETag(canonicalString),
                        can_resume: raw.canResume,
                    }),
                };
            }

            if ((options.start_offset ?? 0) > 0 || options.max_bytes !== undefined) {
                throw HttpErrors.badRequest('start_offset and max_bytes are only supported with format "raw"', 'PARTIAL_READ_UNSUPPORTED');
            }

            return {
                content: value,
                metadata: this.buildFileMetadata(path, 'file', perms.permissions, size, timestampInfo.formatted, {
                    content_type: FileContentCalculator.detectContentType(value, filePath.field_name!),
                    etag: FileContentCalculator.generateETag(canonicalString),
                    can_resume: false,
                }),
            };
        }

        // Filter record based on show_hidden option
        const filteredRecord = filterRecordFields(record, showHidden);
        const canonicalString = JSON.stringify(filteredRecord);
        const size = FileContentCalculator.calculateSize(canonicalString);

        if (options.format === 'raw') {
            const raw = this.sliceRawContent(canonicalString, options.start_offset, options.max_bytes);
            return {
                content: raw.content,
                metadata: this.buildFileMetadata(path, 'file', perms.permissions, size, timestampInfo.formatted, {
                    content_type: 'application/json',
                    etag: FileContentCalculator.generateETag(canonicalString),
                    can_resume: raw.canResume,
                }),
            };
        }

        if ((options.start_offset ?? 0) > 0 || options.max_bytes !== undefined) {
            throw HttpErrors.badRequest('start_offset and max_bytes are only supported with format "raw"', 'PARTIAL_READ_UNSUPPORTED');
        }

        return {
            content: filteredRecord,
            metadata: this.buildFileMetadata(path, 'file', perms.permissions, size, timestampInfo.formatted, {
                content_type: 'application/json',
                etag: FileContentCalculator.generateETag(canonicalString),
                can_resume: false,
            }),
        };
    }

    async store(path: string, content: any, options: FileStoreRequest['file_options'] = {}): Promise<StoreResult> {
        const filePath = FilePathParser.parse(path, {
            operation: 'store',
            allowWildcards: false,
        });

        if (filePath.type !== 'record' && filePath.type !== 'field') {
            throw HttpErrors.badRequest('Store only supports record and field paths', 'INVALID_STORE_PATH');
        }

        const normalizedOptions = {
            overwrite: true,
            append_mode: false,
            validate_schema: true,
            ...options,
        };

        if (filePath.type === 'field') {
            const record = await this.requireRecord(filePath.schema!, filePath.record_id!);
            const fieldName = filePath.field_name!;
            const newValue = normalizedOptions.append_mode && typeof record[fieldName] === 'string' && typeof content === 'string'
                ? record[fieldName] + content
                : content;

            await this.system.database.updateOne(filePath.schema!, filePath.record_id!, { [fieldName]: newValue });
            const updatedRecord = await this.requireRecord(filePath.schema!, filePath.record_id!);
            const timestampInfo = FileTimestampFormatter.getBestTimestamp(updatedRecord);
            const canonicalString = typeof newValue === 'string' ? newValue : JSON.stringify(newValue);
            const perms = this.derivePermissions(updatedRecord);

            return {
                operation: 'field_update',
                recordId: filePath.record_id!,
                fieldName,
                created: false,
                updated: true,
                validationPassed: true,
                metadata: this.buildFileMetadata(path, 'file', perms.permissions, FileContentCalculator.calculateSize(canonicalString), timestampInfo.formatted, {
                    content_type: FileContentCalculator.detectContentType(newValue, fieldName),
                    etag: FileContentCalculator.generateETag(canonicalString),
                }),
            };
        }

        if (typeof content !== 'object' || content === null) {
            throw HttpErrors.badRequest('Record writes require JSON object content', 'REQUEST_INVALID_FORMAT');
        }

        const existing = await this.system.database.selectOne(filePath.schema!, { where: { id: filePath.record_id! } });
        if (existing && !normalizedOptions.overwrite) {
            throw HttpErrors.conflict(`Record ${filePath.record_id} already exists and overwrite is disabled`, 'RECORD_EXISTS');
        }

        let operation: 'create' | 'update';
        if (existing) {
            const payload = normalizedOptions.append_mode ? { ...existing, ...content } : content;
            await this.system.database.updateOne(filePath.schema!, filePath.record_id!, payload);
            operation = 'update';
        } else {
            const payload = { id: filePath.record_id!, ...content };
            await this.system.database.createOne(filePath.schema!, payload);
            operation = 'create';
        }

        const record = await this.requireRecord(filePath.schema!, filePath.record_id!);
        const timestampInfo = FileTimestampFormatter.getBestTimestamp(record);
        const canonicalString = JSON.stringify(record);
        const perms = this.derivePermissions(record);

        const created = operation === 'create';
        return {
            operation,
            recordId: filePath.record_id!,
            created,
            updated: !created,
            validationPassed: true,
            metadata: this.buildFileMetadata(path, 'file', perms.permissions, FileContentCalculator.calculateSize(canonicalString), timestampInfo.formatted, {
                content_type: 'application/json',
                etag: FileContentCalculator.generateETag(canonicalString),
            }),
        };
    }

    async delete(path: string, _request: FileDeleteRequest): Promise<DeleteResult> {
        const filePath = FilePathParser.parse(path, {
            operation: 'delete',
            allowWildcards: false,
        });

        if (filePath.type !== 'record' && filePath.type !== 'field') {
            throw HttpErrors.badRequest('Delete only supports record and field paths', 'UNSUPPORTED_DELETE_TYPE');
        }

        if (filePath.type === 'field') {
            const record = await this.requireRecord(filePath.schema!, filePath.record_id!);
            const fieldName = filePath.field_name!;

            if (!(fieldName in record)) {
                throw HttpErrors.notFound(`Field not found: ${fieldName}`, 'FIELD_NOT_FOUND');
            }

            await this.system.database.updateOne(filePath.schema!, filePath.record_id!, { [fieldName]: null });
            return {
                operation: 'field_delete',
                deletedCount: 1,
                affectedRecords: [filePath.record_id!],
                clearedFields: [fieldName],
                canRestore: false,
            };
        }

        await this.system.database.deleteOne(filePath.schema!, filePath.record_id!);
        return {
            operation: 'soft_delete',
            deletedCount: 1,
            affectedRecords: [filePath.record_id!],
            canRestore: true,
        };
    }

    async stat(path: string, _request: FileStatRequest): Promise<StatResult> {
        const filePath = FilePathParser.parse(path, {
            operation: 'stat',
            allowWildcards: false,
        });

        switch (filePath.type) {
            case 'root':
                return {
                    metadata: this.buildFileMetadata('/', 'directory', this.directoryPermissions(), 0, FileTimestampFormatter.current(), {
                        created_time: FileTimestampFormatter.current(),
                        access_time: FileTimestampFormatter.current(),
                    }),
                    recordInfo: {
                        schema: '',
                        soft_deleted: false,
                        access_permissions: ['read'],
                    },
                    childrenCount: 2,
                };
            case 'data':
            case 'describe':
                return this.statNamespace(filePath);
            case 'schema':
                return this.statSchema(filePath);
            case 'record':
                return this.statRecord(filePath);
            case 'field':
                return this.statField(filePath);
            default:
                throw HttpErrors.badRequest(`Unsupported stat path type: ${filePath.type}`, 'UNSUPPORTED_PATH_TYPE');
        }
    }

    async size(path: string, _request: FileSizeRequest): Promise<SizeResult> {
        const filePath = FilePathParser.parse(path, {
            operation: 'size',
            allowWildcards: false,
            requireFile: true,
        });

        if (filePath.type === 'record' && !filePath.is_json_file) {
            throw HttpErrors.badRequest('SIZE command only works on files, not directories', 'NOT_A_FILE');
        }

        if (filePath.type !== 'record' && filePath.type !== 'field') {
            throw HttpErrors.badRequest('SIZE command only supports record and field files', 'INVALID_SIZE_PATH');
        }

        // Always use show_hidden=false for consistent file size reporting
        // File size should represent user data, not infrastructure metadata
        const retrieve = await this.retrieve(path, { format: 'raw', show_hidden: false });
        const size = FileContentCalculator.calculateSize(retrieve.content);
        return {
            size,
            metadata: {
                ...retrieve.metadata,
                size,
            },
        };
    }

    async modifyTime(path: string, _request: FileModifyTimeRequest): Promise<ModifyTimeResult> {
        const filePath = FilePathParser.parse(path, {
            operation: 'modify-time',
            allowWildcards: false,
        });

        const timestampInfo = await this.resolveTimestampInfo(filePath);

        return {
            modifiedTime: timestampInfo.formatted,
            metadata: this.buildFileMetadata(path, filePath.is_directory ? 'directory' : 'file', this.directoryPermissions(), 0, timestampInfo.formatted),
            timestampInfo: {
                source: timestampInfo.source,
                iso_timestamp: timestampInfo.timestamp.toISOString(),
                timezone: 'UTC',
            },
        };
    }

    private listRoot(options: FileListRequest['file_options'] = {}): ListResult {
        const timestamp = FileTimestampFormatter.current();
        const entries = [
            this.buildDirectoryEntry('data', '/data/', timestamp),
            this.buildDirectoryEntry('describe', '/describe/', timestamp),
        ];
        
        // Apply sorting
        const sortBy = options?.sort_by ?? 'name';
        const sortOrder = options?.sort_order ?? 'asc';
        sortFileEntries(entries, sortBy, sortOrder);
        
        return {
            entries,
            metadata: this.buildFileMetadata('/', 'directory', this.directoryPermissions(), 0, timestamp),
        };
    }

    private async listSchemas(namespace: 'data' | 'describe', options: FileListRequest['file_options'] = {}): Promise<ListResult> {
        const schemas = await this.system.database.selectAny('schemas', { order: 'name asc' });
        const timestamp = FileTimestampFormatter.current();
        const entries = schemas.map((schema: any) => ({
            name: schema.name,
            file_type: 'd' as const,
            file_size: 0,
            file_permissions: this.directoryPermissions(),
            file_modified: FileTimestampFormatter.format(schema.updated_at || schema.created_at || timestamp),
            path: `/${namespace}/${schema.name}/`,
            api_context: {
                schema: schema.name,
                access_level: this.system.isRoot() ? 'full' : 'read',
            },
        }));

        // Apply sorting
        const sortBy = options?.sort_by ?? 'name';
        const sortOrder = options?.sort_order ?? 'asc';
        sortFileEntries(entries, sortBy, sortOrder);

        return {
            entries,
            metadata: this.buildFileMetadata(`/${namespace}`, 'directory', this.directoryPermissions(), 0, timestamp),
        };
    }

    private async listSchemaRecords(filePath: FilePath, options: FileListRequest['file_options'] = {}): Promise<ListResult> {
        // For database query, use time-based sorting if requested, otherwise sort by ID
        // Final sorting will be applied to file entries after mapping
        const dbSortBy = (options?.sort_by === 'time') ? 'updated_at' : 'id';
        const dbSortOrder = options?.sort_order === 'desc' ? 'desc' : 'asc';
        const filter: FilterData = { order: `${dbSortBy} ${dbSortOrder}` };
        if (options?.cross_schema_limit) {
            filter.limit = options.cross_schema_limit;
        }
        if (options?.where !== undefined) {
            filter.where = options.where;
        }

        const records = await this.system.database.selectAny(filePath.schema!, filter);
        const entries = records.map((record: any) => {
            const timestampInfo = FileTimestampFormatter.getBestTimestamp(record);
            const path = `/data/${filePath.schema}/${record.id}/`;
            const perms = this.derivePermissions(record);
            return {
                name: record.id,
                file_type: 'd' as const,
                file_size: 0,
                file_permissions: perms.permissions,
                file_modified: timestampInfo.formatted,
                path,
                api_context: {
                    schema: filePath.schema!,
                    record_id: record.id,
                    access_level: perms.access_level,
                },
            };
        });

        // Apply client-side sorting for name/size/type (database sorting only handles time)
        const sortBy = options?.sort_by ?? 'name';
        const sortOrder = options?.sort_order ?? 'asc';
        sortFileEntries(entries, sortBy, sortOrder);

        return {
            entries,
            metadata: this.buildFileMetadata(`/data/${filePath.schema}`, 'directory', this.directoryPermissions(), 0, FileTimestampFormatter.current()),
        };
    }

    private async listRecordFields(filePath: FilePath, options: FileListRequest['file_options'] = {}): Promise<ListResult> {
        const recordWhere = this.composeRecordWhere(filePath.record_id!, options?.where);
        const record = await this.system.database.selectOne(filePath.schema!, { where: recordWhere });

        if (!record) {
            if (options?.where) {
                const existingRecord = await this.system.database.selectOne(filePath.schema!, { where: { id: filePath.record_id! } });
                if (!existingRecord) {
                    throw HttpErrors.notFound(`Record not found: ${filePath.record_id}`, 'RECORD_NOT_FOUND');
                }

                const fallbackTimestamp = FileTimestampFormatter.getBestTimestamp(existingRecord);
                const fallbackPermissions = this.derivePermissions(existingRecord);
                return {
                    entries: [],
                    metadata: this.buildFileMetadata(
                        `/data/${filePath.schema}/${filePath.record_id}`,
                        'directory',
                        fallbackPermissions.permissions,
                        0,
                        fallbackTimestamp.formatted
                    ),
                };
            }

            throw HttpErrors.notFound(`Record not found: ${filePath.record_id}`, 'RECORD_NOT_FOUND');
        }

        const timestampInfo = FileTimestampFormatter.getBestTimestamp(record);
        const perms = this.derivePermissions(record);
        const showHidden = options?.show_hidden ?? false;

        // Filter record for .json file size calculation
        const filteredRecord = filterRecordFields(record, showHidden);

        const entries: FileEntry[] = [
            {
                name: `${filePath.record_id}.json`,
                file_type: 'f',
                file_size: FileContentCalculator.calculateRecordSize(filteredRecord),
                file_permissions: perms.permissions,
                file_modified: timestampInfo.formatted,
                path: `/data/${filePath.schema}/${filePath.record_id}.json`,
                api_context: {
                    schema: filePath.schema!,
                    record_id: filePath.record_id!,
                    access_level: perms.access_level,
                },
            },
        ];

        for (const [fieldName, value] of Object.entries(record)) {
            if (isSystemField(fieldName)) {
                continue;
            }

            const canonicalString = typeof value === 'string' ? value : JSON.stringify(value);
            entries.push({
                name: fieldName,
                file_type: 'f',
                file_size: FileContentCalculator.calculateSize(canonicalString),
                file_permissions: perms.permissions,
                file_modified: timestampInfo.formatted,
                path: `/data/${filePath.schema}/${filePath.record_id}/${fieldName}`,
                api_context: {
                    schema: filePath.schema!,
                    record_id: filePath.record_id!,
                    field_name: fieldName,
                    access_level: perms.access_level,
                },
            });
        }

        // Apply sorting
        const sortBy = options?.sort_by ?? 'name';
        const sortOrder = options?.sort_order ?? 'asc';
        sortFileEntries(entries, sortBy, sortOrder);

        return {
            entries,
            metadata: this.buildFileMetadata(`/data/${filePath.schema}/${filePath.record_id}`, 'directory', perms.permissions, 0, timestampInfo.formatted),
        };
    }

    private async statNamespace(filePath: FilePath): Promise<StatResult> {
        const timestamp = FileTimestampFormatter.current();
        const schemas = await this.system.database.selectAny('schemas');
        return {
            metadata: this.buildFileMetadata(filePath.normalized_path, 'directory', this.directoryPermissions(), 0, timestamp, {
                created_time: timestamp,
                access_time: timestamp,
            }),
            recordInfo: {
                schema: '',
                soft_deleted: false,
                access_permissions: [this.system.isRoot() ? 'full' : 'read'],
            },
            childrenCount: schemas.length,
        };
    }

    private async statSchema(filePath: FilePath): Promise<StatResult> {
        const schema = await this.system.database.toSchema(filePath.schema!);
        const recordCount = await this.system.database.count(filePath.schema!);
        const timestamp = FileTimestampFormatter.current();

        const fieldDefinitions = Object.entries(schema.definition?.properties || {}).map(([name, def]: [string, any]) => ({
            name,
            type: def.type || 'unknown',
            required: Array.isArray(schema.definition?.required) ? schema.definition.required.includes(name) : false,
            description: def.description,
        }));

        return {
            metadata: this.buildFileMetadata(filePath.normalized_path, 'directory', this.directoryPermissions(), 0, timestamp, {
                created_time: timestamp,
                access_time: timestamp,
            }),
            recordInfo: {
                schema: filePath.schema!,
                soft_deleted: false,
                access_permissions: [this.system.isRoot() ? 'full' : 'read'],
            },
            childrenCount: recordCount,
            schemaInfo: {
                description: schema.definition?.description,
                record_count: recordCount,
                field_definitions: fieldDefinitions,
            },
        };
    }

    private async statRecord(filePath: FilePath): Promise<StatResult> {
        const record = await this.requireRecord(filePath.schema!, filePath.record_id!);
        const timestampInfo = FileTimestampFormatter.getBestTimestamp(record);
        const perms = this.derivePermissions(record);

        if (filePath.is_json_file) {
            // Always filter system fields for consistent file size reporting
            // The "file" is the user data, not the infrastructure metadata
            const filteredRecord = filterRecordFields(record, false);
            const canonicalString = JSON.stringify(filteredRecord);
            return {
                metadata: this.buildFileMetadata(filePath.normalized_path, 'file', perms.permissions, FileContentCalculator.calculateSize(canonicalString), timestampInfo.formatted, {
                    created_time: FileTimestampFormatter.format(record.created_at),
                    access_time: FileTimestampFormatter.current(),
                    content_type: 'application/json',
                    etag: FileContentCalculator.generateETag(canonicalString),
                }),
                recordInfo: {
                    schema: filePath.schema!,
                    record_id: filePath.record_id!,
                    field_count: Object.keys(record).length,
                    soft_deleted: Boolean(record.trashed_at),
                    access_permissions: [perms.access_level],
                },
            };
        }

        const fieldCount = Object.keys(record).filter(field => !isSystemField(field)).length + 1; // +1 for json file
        return {
            metadata: this.buildFileMetadata(filePath.normalized_path, 'directory', perms.permissions, 0, timestampInfo.formatted, {
                created_time: FileTimestampFormatter.format(record.created_at),
                access_time: FileTimestampFormatter.current(),
            }),
            recordInfo: {
                schema: filePath.schema!,
                record_id: filePath.record_id!,
                field_count: fieldCount,
                soft_deleted: Boolean(record.trashed_at),
                access_permissions: [perms.access_level],
            },
            childrenCount: fieldCount,
        };
    }

    private async statField(filePath: FilePath): Promise<StatResult> {
        const record = await this.requireRecord(filePath.schema!, filePath.record_id!);
        const perms = this.derivePermissions(record);

        if (!(filePath.field_name! in record)) {
            throw HttpErrors.notFound(`Field not found: ${filePath.field_name}`, 'FIELD_NOT_FOUND');
        }

        const value = record[filePath.field_name!];
        const timestampInfo = FileTimestampFormatter.getBestTimestamp(record);
        const canonicalString = typeof value === 'string' ? value : JSON.stringify(value);

        return {
            metadata: this.buildFileMetadata(filePath.normalized_path, 'file', perms.permissions, FileContentCalculator.calculateSize(canonicalString), timestampInfo.formatted, {
                created_time: FileTimestampFormatter.format(record.created_at),
                access_time: FileTimestampFormatter.current(),
                content_type: FileContentCalculator.detectContentType(value, filePath.field_name!),
                etag: FileContentCalculator.generateETag(canonicalString),
            }),
            recordInfo: {
                schema: filePath.schema!,
                record_id: filePath.record_id!,
                field_name: filePath.field_name!,
                soft_deleted: Boolean(record.trashed_at),
                access_permissions: [perms.access_level],
            },
        };
    }

    private async resolveTimestampInfo(filePath: FilePath): Promise<{
        timestamp: Date;
        source: 'updated_at' | 'created_at' | 'current_time';
        formatted: string;
    }> {
        switch (filePath.type) {
            case 'root':
            case 'data':
            case 'describe':
                return {
                    timestamp: new Date(),
                    source: 'current_time',
                    formatted: FileTimestampFormatter.current(),
                };
            case 'schema': {
                const records = await this.system.database.selectAny(filePath.schema!, { order: 'updated_at desc', limit: 1 });
                if (records.length === 0) {
                    const now = new Date();
                    return {
                        timestamp: now,
                        source: 'current_time',
                        formatted: FileTimestampFormatter.format(now),
                    };
                }
                return FileTimestampFormatter.getBestTimestamp(records[0]);
            }
            case 'record':
            case 'field': {
                const record = await this.requireRecord(filePath.schema!, filePath.record_id!);
                return FileTimestampFormatter.getBestTimestamp(record);
            }
            default:
                return {
                    timestamp: new Date(),
                    source: 'current_time',
                    formatted: FileTimestampFormatter.current(),
                };
        }
    }

    private composeRecordWhere(recordId: string, whereClause?: FilterData['where']): any {
        if (!whereClause) {
            return { id: recordId };
        }

        if (typeof whereClause === 'object' && whereClause !== null && Object.keys(whereClause).length === 0) {
            return { id: recordId };
        }

        return {
            $and: [
                { id: recordId },
                whereClause,
            ],
        };
    }

    private buildDirectoryEntry(name: string, path: string, timestamp: string): FileEntry {
        return {
            name,
            file_type: 'd',
            file_size: 0,
            file_permissions: this.directoryPermissions(),
            file_modified: timestamp,
            path,
            api_context: {
                schema: '',
                access_level: this.system.isRoot() ? 'full' : 'read',
            },
        };
    }

    private derivePermissions(record: any): { permissions: FilePermissions; access_level: AccessLevel } {
        if (this.system.isRoot()) {
            return { permissions: 'rwx', access_level: 'full' };
        }

        const user = this.system.getUser();
        const subjectIds = new Set<string>([user.id, ...(user.accessFull || []), ...(user.accessEdit || []), ...(user.accessRead || [])]);

        if (Array.isArray(record?.access_deny) && record.access_deny.some((id: string) => subjectIds.has(id))) {
            return { permissions: '---', access_level: 'none' };
        }

        if (Array.isArray(record?.access_full) && record.access_full.some((id: string) => subjectIds.has(id))) {
            return { permissions: 'rwx', access_level: 'full' };
        }

        if (Array.isArray(record?.access_edit) && record.access_edit.some((id: string) => subjectIds.has(id))) {
            return { permissions: 'rw-', access_level: 'edit' };
        }

        if (Array.isArray(record?.access_read) && record.access_read.some((id: string) => subjectIds.has(id))) {
            return { permissions: 'r--', access_level: 'read' };
        }

        return { permissions: 'r--', access_level: 'read' };
    }

    private directoryPermissions(): FilePermissions {
        return this.system.isRoot() ? 'rwx' : 'r-x';
    }

    private buildFileMetadata(
        path: string,
        type: FileMetadata['type'],
        permissions: FilePermissions,
        size: number,
        modified: string,
        extras: Partial<FileMetadata> = {}
    ): FileMetadata {
        return {
            path,
            type,
            permissions,
            size,
            modified_time: modified,
            ...extras,
        } as FileMetadata;
    }

    private sliceRawContent(content: string, start = 0, maxBytes?: number): { content: string; canResume: boolean } {
        const safeStart = Math.max(0, start);
        let sliced = content.substring(safeStart);

        if (maxBytes !== undefined && maxBytes >= 0) {
            sliced = sliced.substring(0, maxBytes);
        }

        return {
            content: sliced,
            canResume: sliced.length < content.length,
        };
    }

    private async requireRecord(schema: string, recordId: string): Promise<any> {
        const record = await this.system.database.selectOne(schema, { where: { id: recordId } });
        if (!record) {
            throw HttpErrors.notFound(`Record not found: ${recordId}`, 'RECORD_NOT_FOUND');
        }
        return record;
    }
}
