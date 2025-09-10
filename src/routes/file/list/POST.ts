import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { WildcardTranslator, type WildcardTranslation } from '@src/lib/file-wildcard-translator.js';
import { PatternCache } from '@src/lib/file-pattern-cache.js';
import { FilePathParser } from '@src/lib/file-api/file-path-parser.js';
import { FilePermissionValidator } from '@src/lib/file-api/file-permission-validator.js';
import { FileTimestampFormatter } from '@src/lib/file-api/file-timestamp-formatter.js';
import type { FileListRequest, FileListResponse, FileEntry } from '@src/lib/file-api/file-types.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/file/list - Directory Listing with Wildcard Support
 *
 * Advanced directory listing with complex wildcard pattern support.
 * Integrates WildcardTranslator and PatternCache for high-performance
 * pattern-based queries using enhanced Filter operators.
 */
export default withParams(async (context, { system, body }) => {
    const request: FileListRequest = body;

    logger.info('File list operation', {
        path: request.path,
        options: request.file_options,
    });

    // Default options
    const options = {
        show_hidden: false,
        long_format: true,
        recursive: false,
        sort_by: 'name',
        sort_order: 'asc',
        pattern_optimization: true,
        cross_schema_limit: 100,
        use_pattern_cache: true,
        ...request.file_options,
    };

    // Parse File path with wildcard support
    const filePath = FilePathParser.parse(request.path, {
        operation: 'list',
        allowWildcards: true,
        allowCrossSchema: true,
    });

    // Build permission context
    const permissionContext = FilePermissionValidator.buildContext(system, 'list');
    permissionContext.path = filePath;

    // Validate permissions
    const permissionResult = await FilePermissionValidator.validate(system, filePath, permissionContext);
    if (!permissionResult.allowed) {
        throw new Error(`Permission denied: ${permissionResult.reason}${permissionResult.details ? ' - ' + permissionResult.details : ''}`);
    }

    const entries: FileEntry[] = [];

    // Handle different path types
    switch (filePath.type) {
        case 'root':
            entries.push(
                createRootEntry('data'),
                createRootEntry('describe')
            );
            break;

        case 'data':
            const schemas = await system.database.selectAny('schemas');
            for (const schemaRecord of schemas) {
                // Skip system schemas unless user is root
                if (schemaRecord.name === 'schema' && !system.isRoot()) {
                    continue;
                }

                entries.push(createSchemaEntry(schemaRecord));
            }
            break;

        case 'schema':
            await handleSchemaListing(system, filePath, options, entries);
            break;

        case 'record':
            await handleRecordListing(system, filePath, entries);
            break;

        default:
            throw new Error(`Unsupported path type for listing: ${filePath.type}`);
    }

    // Build standardized response
    const response: FileListResponse = {
        success: true,
        entries,
        total: entries.length,
        has_more: false,
        file_metadata: {
            path: request.path,
            type: 'directory',
            permissions: permissionResult.permissions,
            size: 0,
            modified_time: FileTimestampFormatter.current(),
        },
    };

    logger.info('File list completed', {
        path: request.path,
        entryCount: entries.length,
        pathType: filePath.type,
    });

    setRouteResult(context, response);
});

// Helper functions for clean code organization

function createRootEntry(name: 'data' | 'describe'): FileEntry {
    return {
        name,
        file_type: 'd',
        file_size: 0,
        file_permissions: 'r-x',
        file_modified: FileTimestampFormatter.current(),
        path: `/${name}/`,
        api_context: {
            schema: '',
            access_level: 'read',
        },
    };
}

function createSchemaEntry(schemaRecord: any): FileEntry {
    return {
        name: schemaRecord.name,
        file_type: 'd',
        file_size: 0,
        file_permissions: 'rwx', // TODO: Calculate from ACL
        file_modified: FileTimestampFormatter.format(schemaRecord.updated_at || schemaRecord.created_at),
        path: `/data/${schemaRecord.name}/`,
        api_context: {
            schema: schemaRecord.name,
            access_level: 'read', // TODO: Calculate from user permissions
        },
    };
}

async function handleSchemaListing(system: any, filePath: any, options: any, entries: FileEntry[]): Promise<void> {
    // Get wildcard translation with caching
    let wildcardTranslation: WildcardTranslation;
    if (options.use_pattern_cache && filePath.has_wildcards) {
        const cachedTranslation = PatternCache.get(filePath.raw_path);
        if (cachedTranslation) {
            wildcardTranslation = cachedTranslation;
        } else {
            wildcardTranslation = WildcardTranslator.translatePath(filePath.raw_path);
            PatternCache.cachePattern(filePath.raw_path, wildcardTranslation);
        }
    } else {
        wildcardTranslation = WildcardTranslator.translatePath(filePath.raw_path);
    }

    // Build filter data
    let filterData: any = {};

    if (filePath.has_wildcards && wildcardTranslation.filter && Object.keys(wildcardTranslation.filter).length > 0) {
        filterData = { ...wildcardTranslation.filter };
        if (options.pattern_optimization) {
            filterData = WildcardTranslator.optimizeFilter(filterData);
        }
    }

    // Add ACL filtering for non-root users
    if (!system.isRoot()) {
        const user = system.getUser();
        const userContext = [user.id, ...user.accessRead];
        const aclFilter = {
            $or: [
                { access_read: { $any: userContext } },
                { access_edit: { $any: userContext } },
                { access_full: { $any: userContext } }
            ],
        };

        if (filterData.where) {
            filterData.where = { $and: [filterData.where, aclFilter] };
        } else {
            filterData.where = aclFilter;
        }
    }

    // Add sorting
    filterData.order = options.sort_by === 'date' ? `updated_at ${options.sort_order}` : `id ${options.sort_order}`;

    // Add limit for cross-schema operations
    if (wildcardTranslation.cross_schema && options.cross_schema_limit) {
        filterData.limit = options.cross_schema_limit;
    }

    const records = await system.database.selectAny(filePath.schema, filterData);

    for (const record of records) {
        const permissionResult = await FilePermissionValidator.validate(system, {
            ...filePath,
            type: 'record',
            record_id: record.id,
        }, FilePermissionValidator.buildContext(system, 'list'));

        entries.push({
            name: record.id,
            file_type: 'd',
            file_size: 0,
            file_permissions: permissionResult.permissions,
            file_modified: FileTimestampFormatter.getBestTimestamp(record).formatted,
            path: `/data/${filePath.schema}/${record.id}/`,
            api_context: {
                schema: filePath.schema,
                record_id: record.id,
                access_level: permissionResult.access_level,
            },
        });
    }
}

async function handleRecordListing(system: any, filePath: any, entries: FileEntry[]): Promise<void> {
    const record = await system.database.selectOne(filePath.schema, {
        where: { id: filePath.record_id },
    });

    if (!record) {
        throw new Error(`Record not found: ${filePath.record_id}`);
    }

    const permissionResult = await FilePermissionValidator.validate(system, filePath,
        FilePermissionValidator.buildContext(system, 'list'));

    // Add JSON file entry for the complete record
    entries.push({
        name: `${filePath.record_id}.json`,
        file_type: 'f',
        file_size: JSON.stringify(record).length,
        file_permissions: permissionResult.permissions,
        file_modified: FileTimestampFormatter.getBestTimestamp(record).formatted,
        path: `/data/${filePath.schema}/${filePath.record_id}.json`,
        api_context: {
            schema: filePath.schema,
            record_id: filePath.record_id,
            access_level: permissionResult.access_level,
        },
    });

    // Add individual field entries
    for (const [fieldName, fieldValue] of Object.entries(record)) {
        // Skip system fields in field listing
        if (['id', 'created_at', 'updated_at', 'trashed_at', 'deleted_at'].includes(fieldName)) {
            continue;
        }

        const fieldSize = fieldValue ? JSON.stringify(fieldValue).length : 0;

        entries.push({
            name: fieldName,
            file_type: 'f',
            file_size: fieldSize,
            file_permissions: permissionResult.permissions,
            file_modified: FileTimestampFormatter.getBestTimestamp(record).formatted,
            path: `/data/${filePath.schema}/${filePath.record_id}/${fieldName}`,
            api_context: {
                schema: filePath.schema,
                record_id: filePath.record_id,
                field_name: fieldName,
                access_level: permissionResult.access_level,
            },
        });
    }
}
