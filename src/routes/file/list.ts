import type { Context } from 'hono';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { WildcardTranslator, type WildcardTranslation } from '@src/ftp/wildcard-translator.js';
import { PatternCache } from '@src/ftp/pattern-cache.js';

// Enhanced FTP List Transport Types (Phase 2)
export interface FtpListRequest {
    path: string; // Complex wildcard path: "/data/users/*admin*/department/eng*/"
    ftp_options: {
        show_hidden: boolean; // Include trashed records
        long_format: boolean; // Detailed file info
        recursive: boolean; // Recursive listing
        max_depth?: number; // Maximum recursion depth
        sort_by?: 'name' | 'date' | 'size';
        sort_order?: 'asc' | 'desc';
        pattern_optimization?: boolean; // Enable query optimization (default: true)
        cross_schema_limit?: number; // Limit cross-schema results (default: 100)
        use_pattern_cache?: boolean; // Use pattern caching (default: true)
    };
    performance_hints?: {
        expected_result_count?: number; // Expected number of results
        cache_duration?: number; // Cache duration in minutes
        priority?: 'speed' | 'accuracy'; // Query optimization priority
        timeout_ms?: number; // Operation timeout (default: 30000)
    };
}

// Enhanced FTP List Response (Phase 2)
export interface FtpListResponse {
    success: true;
    entries: FtpEntry[];
    total: number;
    has_more: boolean;
    pattern_info?: {
        // Pattern analysis metadata
        complexity: 'simple' | 'complex' | 'cross';
        schemas_queried: string[]; // Schemas that were queried
        query_time_ms: number; // Total query execution time
        cache_hit: boolean; // Whether pattern cache was used
        optimization_applied: string[]; // Applied optimization techniques
        cross_schema_count?: number; // Number of schemas queried for cross-schema ops
        estimated_cost: number; // Query complexity estimate (1-100)
        pattern_breakdown?: PatternAnalysis; // Detailed pattern analysis
    };
    performance_metrics?: {
        translation_time_ms: number; // Pattern translation time
        database_time_ms: number; // Database operation time
        total_records_scanned: number; // Records examined during query
        filter_efficiency: number; // Filter selectivity (0-1)
    };
}

export interface FtpEntry {
    name: string; // Entry name for FTP display
    ftp_type: 'd' | 'f' | 'l'; // Directory, File, Link
    ftp_size: number; // Size for FTP SIZE command
    ftp_permissions: string; // User permissions: "rwx", "r--", etc
    ftp_modified: string; // FTP timestamp: "20240115103000"
    path: string; // Full FTP path
    api_context: {
        // Context for subsequent operations
        schema: string;
        record_id?: string;
        field_name?: string;
        access_level: 'read' | 'edit' | 'full';
    };
}

// Enhanced FTP Path Analysis (Phase 2)
export interface FtpPath {
    type: 'root' | 'data' | 'meta' | 'schema' | 'record' | 'field';
    schema?: string;
    record_id?: string;
    field_name?: string;
    wildcards: string[]; // Basic wildcard components
    pattern_components?: PatternComponent[]; // Detailed pattern analysis
    complexity: 'simple' | 'complex' | 'cross';
    estimated_matches?: number; // Estimated number of matches
}

// Pattern Analysis for Advanced Wildcard Support
export interface PatternAnalysis {
    original_pattern: string; // Original FTP path pattern
    normalized_pattern: string; // Normalized pattern
    component_count: number; // Number of pattern components
    wildcard_count: number; // Number of wildcard elements
    alternative_count: number; // Number of alternative patterns
    range_count: number; // Number of range patterns
    cross_schema: boolean; // Whether pattern spans multiple schemas
    supported_features: string[]; // Supported pattern features detected
    unsupported_features: string[]; // Unsupported pattern features
    optimization_potential: string[]; // Possible optimizations
}

// Pattern Component Types (from WildcardTranslator)
export interface PatternComponent {
    type: 'literal' | 'wildcard' | 'alternative' | 'range';
    value: string;
    original: string; // Original pattern component
    sql_pattern?: string; // Generated SQL LIKE pattern
    alternatives?: string[]; // For alternative patterns like (admin|mod)
    range_start?: string; // For range patterns like [01-12]
    range_end?: string;
}

/**
 * FTP Path Parser - Convert FTP filesystem paths to API context
 */
class FtpPathParser {
    static parse(path: string): FtpPath {
        const cleanPath = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        const parts = cleanPath.split('/').filter(p => p.length > 0);

        if (parts.length === 0) {
            return {
                type: 'root',
                wildcards: [],
                complexity: 'simple',
            };
        }

        // Get advanced pattern analysis using WildcardTranslator
        const wildcardTranslation = WildcardTranslator.translatePath(path);
        const wildcards = this.extractWildcards(parts);

        // /data or /meta
        if (parts[0] === 'data' || parts[0] === 'meta') {
            if (parts.length === 1) {
                return {
                    type: parts[0] as 'data' | 'meta',
                    wildcards: [],
                    complexity: 'simple',
                };
            }

            // /data/schema or /meta
            if (parts.length === 2) {
                return {
                    type: 'schema',
                    schema: parts[1],
                    wildcards: wildcards,
                    complexity: wildcardTranslation.complexity,
                    estimated_matches: this.estimateMatches(wildcardTranslation),
                };
            }

            // /data/schema/record-id
            if (parts.length === 3) {
                return {
                    type: 'record',
                    schema: parts[1],
                    record_id: parts[2],
                    wildcards: wildcards,
                    complexity: wildcardTranslation.complexity,
                    estimated_matches: this.estimateMatches(wildcardTranslation),
                };
            }

            // /data/schema/record-id/field
            if (parts.length === 4) {
                return {
                    type: 'field',
                    schema: parts[1],
                    record_id: parts[2],
                    field_name: parts[3],
                    wildcards: wildcards,
                    complexity: wildcardTranslation.complexity,
                    estimated_matches: this.estimateMatches(wildcardTranslation),
                };
            }
        }

        throw new Error(`Invalid FTP path format: ${path}`);
    }

    static validate(path: string): boolean {
        try {
            this.parse(path);
            return true;
        } catch {
            return false;
        }
    }

    static normalize(path: string): string {
        return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    }

    private static extractWildcards(parts: string[]): string[] {
        return parts.filter(part => part.includes('*') || part.includes('?') || part.includes('(') || part.includes('['));
    }

    private static estimateMatches(translation: WildcardTranslation): number {
        // Rough estimation based on complexity and cost
        switch (translation.complexity) {
            case 'simple':
                return Math.max(1, 100 - translation.estimated_cost);
            case 'complex':
                return Math.max(1, 50 - Math.floor(translation.estimated_cost / 2));
            case 'cross':
                return Math.max(1, 200 - translation.estimated_cost);
            default:
                return 10;
        }
    }
}

/**
 * FTP Permission Calculator - Convert user ACL to FTP permissions
 */
class FtpPermissionCalculator {
    static calculatePermissions(userContext: any, recordAccess: any): string {
        const user = userContext.getUser();
        const userId = user.id;
        const userGroups = user.accessRead || [];
        const userContext_array = [userId, ...userGroups];

        // Check if user has access through any context
        const hasRead = recordAccess.access_read?.some((id: string) => userContext_array.includes(id)) || false;
        const hasEdit = recordAccess.access_edit?.some((id: string) => userContext_array.includes(id)) || false;
        const hasFull = recordAccess.access_full?.some((id: string) => userContext_array.includes(id)) || false;

        // Check for explicit denial
        const isDenied = recordAccess.access_deny?.some((id: string) => userContext_array.includes(id)) || false;

        if (isDenied) {
            return '---'; // No access
        }

        if (hasFull) {
            return 'rwx'; // Full access
        }

        if (hasEdit) {
            return 'rw-'; // Read + write
        }

        if (hasRead) {
            return 'r--'; // Read only
        }

        return '---'; // No access
    }

    static formatFtpTimestamp(date: Date | string): string {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const hour = d.getHours().toString().padStart(2, '0');
        const minute = d.getMinutes().toString().padStart(2, '0');
        const second = d.getSeconds().toString().padStart(2, '0');

        return `${year}${month}${day}${hour}${minute}${second}`;
    }
}

/**
 * POST /ftp/list - Enhanced Directory Listing Middleware (Phase 2)
 *
 * Advanced directory listing with complex wildcard pattern support.
 * Integrates WildcardTranslator and PatternCache for high-performance
 * pattern-based queries using enhanced Filter operators.
 */
export default async function ftpListHandler(context: Context): Promise<any> {
    const system = context.get('system');
    const requestBody: FtpListRequest = await context.req.json();

    if (!system) {
        throw new Error('System context not available - ensure systemContextMiddleware is applied');
    }

    // Start timing for performance metrics
    const startTime = process.hrtime.bigint();
    const translationStartTime = process.hrtime.bigint();

    logger.info('FTP list operation (Phase 2)', {
        path: requestBody.path,
        options: requestBody.ftp_options,
        performance_hints: requestBody.performance_hints,
    });

    try {
        // Default options with Phase 2 enhancements
        const options = {
            pattern_optimization: true,
            cross_schema_limit: 100,
            use_pattern_cache: true,
            ...requestBody.ftp_options,
        };

        // Parse FTP path to understand what's being requested
        const ftpPath = FtpPathParser.parse(requestBody.path);
        const entries: FtpEntry[] = [];
        let totalRecordsScanned = 0;

        // Get or create wildcard translation with caching
        let wildcardTranslation: WildcardTranslation;
        let cacheHit = false;

        if (options.use_pattern_cache && ftpPath.wildcards.length > 0) {
            const cachedTranslation = PatternCache.get(requestBody.path);
            if (cachedTranslation) {
                wildcardTranslation = cachedTranslation;
                cacheHit = true;
            } else {
                wildcardTranslation = WildcardTranslator.translatePath(requestBody.path);
                PatternCache.cachePattern(requestBody.path, wildcardTranslation);
            }
        } else {
            wildcardTranslation = WildcardTranslator.translatePath(requestBody.path);
        }

        const translationTime = Number(process.hrtime.bigint() - translationStartTime) / 1_000_000;
        const databaseStartTime = process.hrtime.bigint();

        switch (ftpPath.type) {
            case 'root':
                // List root directories: /data, /meta
                entries.push(
                    {
                        name: 'data',
                        ftp_type: 'd',
                        ftp_size: 0,
                        ftp_permissions: 'r-x',
                        ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(new Date()),
                        path: '/data/',
                        api_context: {
                            schema: '',
                            access_level: 'read',
                        },
                    },
                    {
                        name: 'meta',
                        ftp_type: 'd',
                        ftp_size: 0,
                        ftp_permissions: 'r-x',
                        ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(new Date()),
                        path: '/meta/',
                        api_context: {
                            schema: '',
                            access_level: 'read',
                        },
                    }
                );
                break;

            case 'data':
                // List available schemas
                const schemas = await system.database.selectAny('schemas');

                for (const schemaRecord of schemas) {
                    // Skip system schemas unless user is root
                    if (schemaRecord.name === 'schema' && !system.isRoot()) {
                        continue;
                    }

                    entries.push({
                        name: schemaRecord.name,
                        ftp_type: 'd',
                        ftp_size: 0,
                        ftp_permissions: 'rwx', // TODO: Calculate from ACL
                        ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(schemaRecord.updated_at || schemaRecord.created_at),
                        path: `/data/${schemaRecord.name}/`,
                        api_context: {
                            schema: schemaRecord.name,
                            access_level: 'read', // TODO: Calculate from user permissions
                        },
                    });
                }
                break;

            case 'schema':
                // Enhanced schema listing with advanced wildcard support
                if (!ftpPath.schema) {
                    throw new Error('Schema name required');
                }

                // Use advanced wildcard translation for complex patterns
                let filterData: any = {};

                if (ftpPath.wildcards.length > 0 && wildcardTranslation.filter && Object.keys(wildcardTranslation.filter).length > 0) {
                    // Use enhanced Filter system from WildcardTranslator
                    filterData = { ...wildcardTranslation.filter };

                    // Apply optimization if enabled
                    if (options.pattern_optimization) {
                        filterData = WildcardTranslator.optimizeFilter(filterData);
                    }
                } else if (ftpPath.wildcards.length > 0) {
                    // Fallback to simple wildcard conversion for compatibility
                    const wildcardConditions = ftpPath.wildcards.map(wildcard => {
                        const sqlPattern = wildcard.replace(/\*/g, '%').replace(/\?/g, '_');
                        return { id: { $like: sqlPattern } };
                    });

                    if (wildcardConditions.length === 1) {
                        filterData.where = wildcardConditions[0];
                    } else {
                        filterData.where = { $and: wildcardConditions };
                    }
                }

                // Add ACL filtering for user context
                const user = system.getUser();
                if (!system.isRoot()) {
                    const userContext = [user.id, ...user.accessRead];
                    const aclFilter = {
                        $or: [{ access_read: { $any: userContext } }, { access_edit: { $any: userContext } }, { access_full: { $any: userContext } }],
                    };

                    if (filterData.where) {
                        filterData.where = { $and: [filterData.where, aclFilter] };
                    } else {
                        filterData.where = aclFilter;
                    }
                }

                // Add sorting
                filterData.order = options.sort_by === 'date' ? `updated_at ${options.sort_order || 'desc'}` : `id ${options.sort_order || 'asc'}`;

                // Add limit for cross-schema operations
                if (wildcardTranslation.cross_schema && options.cross_schema_limit) {
                    filterData.limit = options.cross_schema_limit;
                }

                const records = await system.database.selectAny(ftpPath.schema, filterData);
                totalRecordsScanned = records.length;

                for (const record of records) {
                    const permissions = FtpPermissionCalculator.calculatePermissions(system, record);

                    entries.push({
                        name: record.id,
                        ftp_type: 'd',
                        ftp_size: 0,
                        ftp_permissions: permissions,
                        ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(record.updated_at || record.created_at),
                        path: `/data/${ftpPath.schema}/${record.id}/`,
                        api_context: {
                            schema: ftpPath.schema,
                            record_id: record.id,
                            access_level: permissions.includes('w') ? 'edit' : 'read',
                        },
                    });
                }
                break;

            case 'record':
                // List fields in record
                if (!ftpPath.schema || !ftpPath.record_id) {
                    throw new Error('Schema and record ID required');
                }

                const record = await system.database.selectOne(ftpPath.schema, {
                    where: { id: ftpPath.record_id },
                });

                if (!record) {
                    throw new Error(`Record not found: ${ftpPath.record_id}`);
                }

                const recordPermissions = FtpPermissionCalculator.calculatePermissions(system, record);

                // Add JSON file entry for the complete record
                entries.push({
                    name: `${ftpPath.record_id}.json`,
                    ftp_type: 'f',
                    ftp_size: JSON.stringify(record).length,
                    ftp_permissions: recordPermissions,
                    ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(record.updated_at || record.created_at),
                    path: `/data/${ftpPath.schema}/${ftpPath.record_id}.json`,
                    api_context: {
                        schema: ftpPath.schema,
                        record_id: ftpPath.record_id,
                        access_level: recordPermissions.includes('w') ? 'edit' : 'read',
                    },
                });

                // Add individual field entries (for field-level access)
                for (const [fieldName, fieldValue] of Object.entries(record)) {
                    // Skip system fields in field listing
                    if (['id', 'created_at', 'updated_at', 'trashed_at', 'deleted_at'].includes(fieldName)) {
                        continue;
                    }

                    const fieldSize = fieldValue ? JSON.stringify(fieldValue).length : 0;

                    entries.push({
                        name: fieldName,
                        ftp_type: 'f',
                        ftp_size: fieldSize,
                        ftp_permissions: recordPermissions,
                        ftp_modified: FtpPermissionCalculator.formatFtpTimestamp(record.updated_at || record.created_at),
                        path: `/data/${ftpPath.schema}/${ftpPath.record_id}/${fieldName}`,
                        api_context: {
                            schema: ftpPath.schema,
                            record_id: ftpPath.record_id,
                            field_name: fieldName,
                            access_level: recordPermissions.includes('w') ? 'edit' : 'read',
                        },
                    });
                }
                break;

            default:
                throw new Error(`Unsupported path type: ${ftpPath.type}`);
        }

        // Calculate performance metrics
        const databaseTime = Number(process.hrtime.bigint() - databaseStartTime) / 1_000_000;
        const totalTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;

        // Build enhanced response with pattern metadata
        const response: FtpListResponse = {
            success: true,
            entries,
            total: entries.length,
            has_more: false, // TODO: Implement pagination
            pattern_info: {
                complexity: wildcardTranslation.complexity,
                schemas_queried: wildcardTranslation.schemas,
                query_time_ms: Math.round(totalTime * 100) / 100,
                cache_hit: cacheHit,
                optimization_applied: wildcardTranslation.optimization_applied,
                cross_schema_count: wildcardTranslation.cross_schema ? wildcardTranslation.schemas.length : undefined,
                estimated_cost: wildcardTranslation.estimated_cost,
                pattern_breakdown:
                    ftpPath.wildcards.length > 0
                        ? {
                              original_pattern: requestBody.path,
                              normalized_pattern: FtpPathParser.normalize(requestBody.path),
                              component_count: ftpPath.wildcards.length,
                              wildcard_count: ftpPath.wildcards.filter(w => w.includes('*') || w.includes('?')).length,
                              alternative_count: ftpPath.wildcards.filter(w => w.includes('(')).length,
                              range_count: ftpPath.wildcards.filter(w => w.includes('[')).length,
                              cross_schema: wildcardTranslation.cross_schema,
                              supported_features: ['wildcards', 'alternatives', 'ranges', 'acl_filtering'],
                              unsupported_features: [],
                              optimization_potential: wildcardTranslation.optimization_applied,
                          }
                        : undefined,
            },
            performance_metrics: {
                translation_time_ms: Math.round(translationTime * 100) / 100,
                database_time_ms: Math.round(databaseTime * 100) / 100,
                total_records_scanned: totalRecordsScanned || entries.length,
                filter_efficiency: totalRecordsScanned > 0 ? entries.length / totalRecordsScanned : 1.0,
            },
        };

        logger.info('FTP list completed (Phase 2)', {
            path: requestBody.path,
            entryCount: entries.length,
            pathType: ftpPath.type,
            complexity: wildcardTranslation.complexity,
            cacheHit: cacheHit,
            totalTimeMs: Math.round(totalTime * 100) / 100,
        });

        setRouteResult(context, response);
    } catch (error) {
        logger.warn('FTP list failed', {
            path: requestBody.path,
            error: error instanceof Error ? error.message : String(error),
        });

        throw error;
    }
}
