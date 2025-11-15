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
import { isSystemField, Describe } from '@src/lib/describe.js';
import { SchemaCache } from '@src/lib/schema-cache.js';
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

        // Handle flat recursive listing
        if (options.recursive && options.flat) {
            return this.listRecursiveFlat(path, options);
        }

        const isDescribe = filePath.raw_path.startsWith('/describe');

        switch (filePath.type) {
            case 'root':
                return this.listRoot(options);
            case 'data':
            case 'describe':
                return this.listSchemas(filePath.type, options);
            case 'schema':
                if (filePath.has_wildcards) {
                    if (filePath.schema === '*') {
                        const namespace = isDescribe ? 'describe' : 'data';
                        return this.listSchemas(namespace as 'data' | 'describe', options);
                    }
                    throw HttpErrors.badRequest('Schema wildcards must use "*" to match all schemas', 'SCHEMA_WILDCARD_NOT_SUPPORTED');
                }
                if (isDescribe) {
                    // /describe/accounts - list field definitions
                    return this.listSchemaFields(filePath, options);
                }
                // /data/accounts - list record directories
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
                if (isDescribe) {
                    // /describe/accounts/email - list field properties
                    return this.listFieldProperties(filePath, options);
                }
                // /data/accounts/123 - list record fields
                return this.listRecordFields(filePath, options);
            case 'field':
                if (isDescribe) {
                    // /describe/accounts/email/maximum - field properties are files, not directories
                    throw HttpErrors.badRequest('Column property paths are files, not directories. Cannot list.', 'INVALID_LIST_PATH');
                }
                // /data paths don't support listing at field level (fields are files)
                throw HttpErrors.badRequest('Field paths cannot be listed for /data namespace', 'INVALID_LIST_PATH');
            case 'property':
                // Property paths are always files, not listable directories
                throw HttpErrors.badRequest('Property paths cannot be listed (they are files)', 'INVALID_LIST_PATH');
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

        const isDescribe = filePath.raw_path.startsWith('/describe');

        // Handle /describe column property paths (only 'field' type - no nested properties)
        if (isDescribe && filePath.type === 'field') {
            return this.retrieveProperty(filePath, options);
        }

        // Nested properties not supported in new architecture
        if (isDescribe && filePath.type === 'property') {
            throw HttpErrors.badRequest(
                'Nested column properties are not supported in Monk-native format',
                'NESTED_PROPERTIES_NOT_SUPPORTED'
            );
        }

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

        if (filePath.type !== 'record' && filePath.type !== 'field' && filePath.type !== 'property') {
            throw HttpErrors.badRequest('Store only supports record, field, and property paths', 'INVALID_STORE_PATH');
        }

        const normalizedOptions = {
            overwrite: true,
            append_mode: false,
            validate_schema: true,
            ...options,
        };

        // Route /describe namespace to schema definition handlers
        if (path.startsWith('/describe/')) {
            return this.storeDescribe(filePath, content, normalizedOptions);
        }

        // Handle /data namespace paths
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

    /**
     * Handle store operations for /describe namespace (column properties)
     *
     * Uses Monk-native columns table format. Only supports individual column property updates.
     * Paths like /describe/accounts/email are directories, not files.
     * Only /describe/accounts/email/maximum (property) is a storable file.
     */
    private async storeDescribe(filePath: FilePath, content: any, options: any): Promise<StoreResult> {
        // Ensure user has permission to modify schemas
        if (!this.system.isRoot()) {
            throw HttpErrors.forbidden('Only root users can modify schema definitions', 'PERMISSION_DENIED');
        }

        // Only 'field' type is valid - individual column properties
        // /describe/accounts/email/maximum -> type === 'field'
        if (filePath.type !== 'field') {
            throw HttpErrors.badRequest(
                'Only individual column properties can be stored. Path must be /describe/:schema/:column/:property',
                'INVALID_DESCRIBE_PATH'
            );
        }

        const columnName = filePath.record_id!;
        const propertyName = filePath.field_name!;

        // Get current column definition from columns table
        const describe = new Describe(this.system as any);
        const column = await describe.getColumn(filePath.schema!, columnName);

        // Build update object with single property change
        const updates = { [propertyName]: content };

        // Update column through describe API (triggers auto-regeneration of JSON Schema)
        await describe.updateColumn(filePath.schema!, columnName, updates);

        // Get updated column for metadata
        const updatedColumn = await describe.getColumn(filePath.schema!, columnName);
        const timestamp = FileTimestampFormatter.format(updatedColumn.updated_at || new Date().toISOString());
        const canonicalContent = typeof content === 'string' ? content : JSON.stringify(content);
        const size = FileContentCalculator.calculateSize(canonicalContent);

        return {
            operation: 'update',
            recordId: columnName,
            fieldName: propertyName,
            created: false,
            updated: true,
            validationPassed: true,
            metadata: this.buildFileMetadata(
                filePath.normalized_path,
                'file',
                'rwx',
                size,
                timestamp,
                {
                    content_type: FileContentCalculator.detectContentType(content, propertyName),
                    etag: FileContentCalculator.generateETag(canonicalContent),
                }
            ),
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

        // SIZE only works on field and property paths, not directories
        if (filePath.type === 'record' || filePath.type === 'schema' || filePath.type === 'root' || filePath.type === 'data' || filePath.type === 'describe') {
            throw HttpErrors.badRequest('SIZE command only works on files, not directories', 'NOT_A_FILE');
        }

        // At this point, type must be 'field' or 'property'
        if (filePath.type !== 'field' && filePath.type !== 'property') {
            throw HttpErrors.badRequest('SIZE command only supports field and property files', 'INVALID_SIZE_PATH');
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

    private async listRecursiveFlat(path: string, options: FileListRequest['file_options'] = {}): Promise<ListResult> {
        const maxDepth = options.max_depth ?? -1; // -1 = unlimited
        const allFiles: FileEntry[] = [];

        const collectFiles = async (currentPath: string, currentDepth: number): Promise<void> => {
            // Check depth limit
            if (maxDepth !== -1 && currentDepth > maxDepth) {
                return;
            }

            // List current directory (non-recursive, non-flat)
            const nonRecursiveOptions = { ...options, recursive: false, flat: false };
            let result: ListResult;

            try {
                // Temporarily clear recursive/flat to get one level
                result = await this.list(currentPath, nonRecursiveOptions);
            } catch (error) {
                // If listing fails, skip this directory
                logger.debug(`Skipping directory ${currentPath}: ${error}`);
                return;
            }

            for (const entry of result.entries) {
                if (entry.file_type === 'f') {
                    // It's a file, add it to results
                    allFiles.push(entry);
                } else if (entry.file_type === 'd') {
                    // It's a directory, recurse into it
                    await collectFiles(entry.path, currentDepth + 1);
                }
            }
        };

        await collectFiles(path, 0);

        // Apply sorting to final flat list
        const sortBy = options.sort_by ?? 'name';
        const sortOrder = options.sort_order ?? 'asc';
        sortFileEntries(allFiles, sortBy, sortOrder);

        const timestamp = FileTimestampFormatter.current();
        return {
            entries: allFiles,
            metadata: this.buildFileMetadata(path, 'directory', this.directoryPermissions(), 0, timestamp),
        };
    }

    private async listSchemas(namespace: 'data' | 'describe', options: FileListRequest['file_options'] = {}): Promise<ListResult> {
        const schemas = await this.system.database.selectAny('schemas', { order: 'name asc' });
        const timestamp = FileTimestampFormatter.current();
        const entries = schemas.map((schema: any) => ({
            name: schema.schema_name,
            file_type: 'd' as const,
            file_size: 0,
            file_permissions: this.directoryPermissions(),
            file_modified: FileTimestampFormatter.format(schema.updated_at || schema.created_at || timestamp),
            path: `/${namespace}/${schema.schema_name}/`,
            api_context: {
                schema: schema.schema_name,
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

            const entry: any = {
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

            // Populate extended metadata when long_format requested
            if (options?.long_format) {
                entry.created_time = FileTimestampFormatter.format(record.created_at || timestampInfo.source);
                entry.content_type = 'application/json';
                entry.etag = FileContentCalculator.generateETag(JSON.stringify(record));
                entry.soft_deleted = record.soft_deleted === true;
                entry.field_count = Object.keys(record).filter(k => !isSystemField(k)).length;
            }

            return entry;
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

        // List all field files (no .json snapshot file)
        const entries: FileEntry[] = [];

        for (const [fieldName, value] of Object.entries(record)) {
            if (isSystemField(fieldName)) {
                continue;
            }

            const canonicalString = typeof value === 'string' ? value : JSON.stringify(value);
            const entry: any = {
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
            };

            // Populate extended metadata when long_format requested
            if (options?.long_format) {
                entry.created_time = FileTimestampFormatter.format(record.created_at || timestampInfo.source);
                entry.content_type = FileContentCalculator.detectContentType(value, fieldName);
                entry.etag = FileContentCalculator.generateETag(canonicalString);
                entry.soft_deleted = record.soft_deleted === true;
            }

            entries.push(entry);
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

    /**
     * List columns in a schema (/describe/accounts)
     *
     * Uses columns table instead of JSON Schema definitions
     */
    private async listSchemaFields(filePath: FilePath, options: FileListRequest['file_options'] = {}): Promise<ListResult> {
        const dtx = this.system.tx || this.system.db;

        // Query columns table for this schema
        const result = await dtx.query(
            `SELECT * FROM columns WHERE schema_name = $1 ORDER BY column_name`,
            [filePath.schema!]
        );

        if (result.rows.length === 0) {
            return {
                entries: [],
                metadata: this.buildFileMetadata(`/describe/${filePath.schema}`, 'directory', this.directoryPermissions(), 0, FileTimestampFormatter.current()),
            };
        }

        const timestamp = FileTimestampFormatter.format(result.rows[0].updated_at || result.rows[0].created_at);
        const entries: FileEntry[] = result.rows.map((column: any) => {
            const entry: any = {
                name: column.column_name,
                file_type: 'd' as const,
                file_size: 0,
                file_permissions: this.directoryPermissions(),
                file_modified: FileTimestampFormatter.format(column.updated_at || column.created_at),
                path: `/describe/${filePath.schema}/${column.column_name}/`,
                api_context: {
                    schema: filePath.schema!,
                    record_id: column.column_name,
                    access_level: this.system.isRoot() ? 'full' : 'read',
                },
            };

            // Populate extended metadata when long_format requested
            if (options?.long_format) {
                entry.created_time = FileTimestampFormatter.format(column.created_at || column.updated_at);
                entry.content_type = 'application/json';
                entry.etag = FileContentCalculator.generateETag(JSON.stringify(column));
                entry.type = column.type;
                entry.required = column.required;
            }

            return entry;
        });

        // Apply sorting
        const sortBy = options?.sort_by ?? 'name';
        const sortOrder = options?.sort_order ?? 'asc';
        sortFileEntries(entries, sortBy, sortOrder);

        return {
            entries,
            metadata: this.buildFileMetadata(`/describe/${filePath.schema}`, 'directory', this.directoryPermissions(), 0, timestamp),
        };
    }

    /**
     * List properties of a column (/describe/accounts/email)
     *
     * Uses columns table, exposes Monk-native field names (not JSON Schema names)
     */
    private async listFieldProperties(filePath: FilePath, options: FileListRequest['file_options'] = {}): Promise<ListResult> {
        const describe = new Describe(this.system as any);
        const column = await describe.getColumn(filePath.schema!, filePath.record_id!);

        const timestamp = FileTimestampFormatter.format(column.updated_at || column.created_at);

        // List all column table fields as files (no nested structures)
        const entries: FileEntry[] = Object.entries(column)
            .filter(([propName]) => propName !== 'id') // Exclude internal id field
            .map(([propName, propValue]: [string, any]) => {
                const valueStr = propValue === null ? '' : (Array.isArray(propValue) ? propValue.join('\n') : String(propValue));

                return {
                    name: propName,
                    file_type: 'f' as const,
                    file_size: FileContentCalculator.calculateSize(valueStr),
                    file_permissions: this.system.isRoot() ? 'rwx' : 'r--' as FilePermissions,
                    file_modified: timestamp,
                    path: `/describe/${filePath.schema}/${filePath.record_id}/${propName}`,
                    api_context: {
                        schema: filePath.schema!,
                        record_id: filePath.record_id!,
                        field_name: propName,
                        access_level: this.system.isRoot() ? 'full' : 'read',
                    },
                };
            });

        // Apply sorting
        const sortBy = options?.sort_by ?? 'name';
        const sortOrder = options?.sort_order ?? 'asc';
        sortFileEntries(entries, sortBy, sortOrder);

        return {
            entries,
            metadata: this.buildFileMetadata(`/describe/${filePath.schema}/${filePath.record_id}`, 'directory', this.directoryPermissions(), 0, timestamp),
        };
    }

    /**
     * List nested properties (/describe/accounts/email/validation)
     *
     * @deprecated No longer used - Monk-native format has no nested properties
     */
    private async listNestedProperties(filePath: FilePath, options: FileListRequest['file_options'] = {}): Promise<ListResult> {
        const cache = SchemaCache.getInstance();
        const schema = await cache.getSchema(this.system, filePath.schema!);

        const fieldDef = schema.definition?.properties?.[filePath.record_id!];
        if (!fieldDef) {
            throw HttpErrors.notFound(`Field definition not found: ${filePath.record_id}`, 'FIELD_NOT_FOUND');
        }

        // Navigate to nested property
        const nestedValue = fieldDef[filePath.field_name!];
        if (typeof nestedValue !== 'object' || nestedValue === null || Array.isArray(nestedValue)) {
            throw HttpErrors.badRequest(`Property ${filePath.field_name} is not a nested object`, 'NOT_A_DIRECTORY');
        }

        const timestamp = FileTimestampFormatter.format(schema.updated_at || schema.created_at);
        const entries: FileEntry[] = Object.entries(nestedValue).map(([propName, propValue]: [string, any]) => {
            const isNested = typeof propValue === 'object' && propValue !== null && !Array.isArray(propValue);
            const valueStr = Array.isArray(propValue) ? propValue.join('\n') : String(propValue);

            return {
                name: propName,
                file_type: isNested ? 'd' : 'f',
                file_size: isNested ? 0 : FileContentCalculator.calculateSize(valueStr),
                file_permissions: isNested ? this.directoryPermissions() : 'r--' as FilePermissions,
                file_modified: timestamp,
                path: `/describe/${filePath.schema}/${filePath.record_id}/${filePath.field_name}/${propName}${isNested ? '/' : ''}`,
                api_context: {
                    schema: filePath.schema!,
                    record_id: filePath.record_id!,
                    field_name: `${filePath.field_name}/${propName}`,
                    access_level: this.system.isRoot() ? 'full' : 'read',
                },
            };
        });

        // Apply sorting
        const sortBy = options?.sort_by ?? 'name';
        const sortOrder = options?.sort_order ?? 'asc';
        sortFileEntries(entries, sortBy, sortOrder);

        return {
            entries,
            metadata: this.buildFileMetadata(`/describe/${filePath.schema}/${filePath.record_id}/${filePath.field_name}`, 'directory', this.directoryPermissions(), 0, timestamp),
        };
    }

    /**
     * Retrieve a column property value (/describe/accounts/email/maximum)
     *
     * Uses columns table, exposes Monk-native field names
     */
    private async retrieveProperty(filePath: FilePath, options: FileRetrieveRequest['file_options'] = {}): Promise<RetrieveResult> {
        // Only 'field' type is valid (no nested properties)
        if (filePath.type !== 'field') {
            throw HttpErrors.badRequest(
                'Only direct column properties can be retrieved. Nested properties not supported.',
                'INVALID_DESCRIBE_PATH'
            );
        }

        const describe = new Describe(this.system as any);
        const column = await describe.getColumn(filePath.schema!, filePath.record_id!);

        // Get the property value from column record
        const propertyName = filePath.field_name!;
        const value = column[propertyName];

        if (value === undefined) {
            throw HttpErrors.notFound(`Property '${propertyName}' not found in column '${filePath.record_id}'`, 'PROPERTY_NOT_FOUND');
        }

        // Convert value to string format (arrays as one-per-line, null as empty string)
        const content = value === null ? '' : (Array.isArray(value) ? value.join('\n') : String(value));
        const timestamp = FileTimestampFormatter.format(column.updated_at || column.created_at);

        return {
            content,
            metadata: this.buildFileMetadata(
                filePath.normalized_path,
                'file',
                this.system.isRoot() ? 'rwx' : 'r--' as FilePermissions,
                FileContentCalculator.calculateSize(content),
                timestamp,
                {
                    content_type: 'text/plain',
                    etag: FileContentCalculator.generateETag(content),
                }
            ),
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

        // Record paths are always directories containing field files
        const fieldCount = Object.keys(record).filter(field => !isSystemField(field)).length;

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
