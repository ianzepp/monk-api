import { FilterWhere } from '@src/lib/filter-where.js';
import { FilterOrder } from '@src/lib/filter-order.js';
import { FilterOp, type FilterWhereInfo, type FilterWhereOptions, type FilterData, type ConditionNode, type FilterOrderInfo, type AggregateSpec, type AggregateFunction } from '@src/lib/filter-types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import type { SystemContext } from '@src/lib/system-context-types.js';

// Re-export types for convenience
export type { FilterData, FilterOp, FilterWhereInfo, FilterWhereOptions, FilterOrderInfo, ConditionNode, AggregateSpec, AggregateFunction } from '@src/lib/filter-types.js';

/**
 * Filter - Enterprise-Grade Database Query Builder
 *
 * Comprehensive query builder with 25+ operators including PostgreSQL arrays, logical operations,
 * full-text search, and advanced filtering patterns. Integrates with observer pipeline and ACL systems.
 *
 * Provides clean separation of concerns:
 * - Filter data validation and normalization
 * - SQL generation with proper parameterization
 * - Query execution via consistent API patterns
 *
 * Quick Examples:
 * - Basic: `{ name: { $ilike: "john%" }, status: "active" }`
 * - ACL: `{ access_read: { $any: ["user-123", "group-456"] } }`
 * - Logic: `{ $and: [{ $or: [{ access: "root" }, { verified: true }] }] }`
 *
 * Architecture: Filter → FilterWhere → FilterOrder → SQL generation
 * Integration: Observer pipeline, soft delete filtering, model validation
 *
 * See docs/FILTER.md for complete operator reference and examples.
 */

// All types and enums are now imported from filter-types.js for consistency

/**
 * Filter - Handles database query building with proper validation and execution
 *
 * Provides clean separation of concerns:
 * - Filter data validation and normalization
 * - SQL generation with proper parameterization
 * - Query execution via consistent API patterns
 *
 * Designed for integration with observer pipeline and ACL systems.
 */
export class Filter {
    private _tableName: string;
    private _query: any;
    private _select: string[] = [];
    private _whereData: any = {}; // Store raw WHERE data for FilterWhere
    private _order: FilterOrderInfo[] = [];
    private _limit?: number;
    private _offset?: number;
    private _lookups: any[] = [];
    private _related: any[] = [];
    private _softDeleteOptions: FilterWhereOptions = {};

    // System context for automatic soft delete handling
    private readonly system?: SystemContext;

    constructor(tableName: string, system?: SystemContext) {
        this._tableName = tableName;
        this.system = system;
        this.validateTableName(tableName);

        // For dynamic models, we'll build queries using raw SQL
        // since Drizzle's type system doesn't know about runtime tables
        this._query = null; // Will build SQL manually
    }

    // Parameter management is now handled by FilterWhere

    /**
     * Process filter data with comprehensive validation and normalization
     */
    assign(source?: FilterData | string | string[]): Filter {
        if (source === undefined) {
            return this;
        }

        try {
            // Validate and normalize input
            const normalizedSource = this.validateAndNormalizeInput(source);

            // Process the normalized data
            this.processFilterData(normalizedSource);

            console.debug('Filter assignment completed', {
                tableName: this._tableName,
                sourceType: Array.isArray(source) ? 'array' : typeof source
            });

        } catch (error) {
            console.warn('Filter assignment failed', {
                tableName: this._tableName,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error; // Re-throw to maintain error handling
        }

        return this;
    }

    /**
     * Validate table name to prevent SQL injection
     */
    private validateTableName(tableName: string): void {
        if (!tableName || typeof tableName !== 'string') {
            throw HttpErrors.badRequest('Table name must be a non-empty string', 'FILTER_INVALID_TABLE');
        }

        // Basic SQL injection protection for table names
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
            throw HttpErrors.badRequest('Invalid table name format', 'FILTER_INVALID_TABLE_FORMAT');
        }
    }

    /**
     * Validate and normalize filter input data
     */
    private validateAndNormalizeInput(source: FilterData | string | string[]): FilterData {
        // Array of IDs → convert to $in (skip empty arrays)
        if (Array.isArray(source)) {
            if (source.length === 0) {
                return {}; // Empty array = no conditions
            }
            return { where: { id: { $in: source } } };
        }

        // Single UUID → convert to $eq
        if (typeof source === 'string' && this.isUUID(source)) {
            return { where: { id: source } };
        }

        // Plain string → assume name field
        if (typeof source === 'string') {
            return { where: { name: source } };
        }

        // Process FilterData object
        if (typeof source === 'object' && source !== null) {
            return this.validateFilterData(source);
        }

        throw HttpErrors.badRequest('Invalid filter source type', 'FILTER_INVALID_SOURCE_TYPE');
    }

    /**
     * Validate FilterData object structure
     */
    private validateFilterData(source: FilterData): FilterData {
        // Validate select array if provided
        if (source.select && (!Array.isArray(source.select) || source.select.some(col => typeof col !== 'string'))) {
            throw HttpErrors.badRequest('Select must be an array of field names', 'FILTER_INVALID_SELECT');
        }

        // Validate limit/offset if provided
        if (source.limit !== undefined && (!Number.isInteger(source.limit) || source.limit < 0)) {
            throw HttpErrors.badRequest('Limit must be a non-negative integer', 'FILTER_INVALID_LIMIT');
        }

        if (source.offset !== undefined && (!Number.isInteger(source.offset) || source.offset < 0)) {
            throw HttpErrors.badRequest('Offset must be a non-negative integer', 'FILTER_INVALID_OFFSET');
        }

        return source;
    }

    /**
     * Process validated FilterData with proper error handling
     */
    private processFilterData(source: FilterData): void {
        try {
            // SELECT
            if (source.select) {
                this.processSelectClause(source.select);
            }

            // WHERE
            if (source.where) {
                this.processWhereClause(source.where);
            }

            // ORDER
            if (source.order) {
                this.processOrderClause(source.order);
            }

            // LIMIT/OFFSET
            if (source.limit !== undefined) {
                this.processLimitClause(source.limit, source.offset);
            }

            // TODO: LOOKUPS and RELATED
            // if (source.lookups) this.processLookups(source.lookups);
            // if (source.related) this.processRelated(source.related);

        } catch (error) {
            throw error; // Re-throw validation errors
        }
    }

    /**
     * Process SELECT clause with validation
     */
    private processSelectClause(fields: string[]): void {
        this.validateSelectFields(fields);
        this.$select(...fields);
    }

    /**
     * Validate SELECT fields
     */
    private validateSelectFields(fields: string[]): void {
        if (!Array.isArray(fields)) {
            throw HttpErrors.badRequest('Select fields must be an array', 'FILTER_INVALID_SELECT_TYPE');
        }

        for (const field of fields) {
            if (typeof field !== 'string' || !field.trim()) {
                throw HttpErrors.badRequest('All select fields must be non-empty strings', 'FILTER_INVALID_FIELD_NAME');
            }

            // Basic SQL injection protection for field names
            if (field !== '*' && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
                throw HttpErrors.badRequest(`Invalid field name format: ${field}`, 'FILTER_INVALID_FIELD_FORMAT');
            }
        }
    }

    /**
     * SELECT field specification
     */
    $select(...fields: string[]): Filter {
        // If '*' is included, select all (for now, just track the request)
        if (fields.includes('*')) {
            this._select = ['*'];
        } else {
            this._select.push(...fields);
        }
        return this;
    }

    /**
     * Process WHERE clause with validation - delegates to FilterWhere
     */
    private processWhereClause(conditions: any): void {
        // Let FilterWhere handle all validation
        FilterWhere.validate(conditions);
        this.$where(conditions);
    }

    /**
     * WHERE clause processing - simplified to delegate to FilterWhere
     */
    $where(conditions: any): Filter {
        if (!conditions) return this;

        // Store raw WHERE data for FilterWhere to process
        if (this._whereData && Object.keys(this._whereData).length > 0) {
            // Merge with existing conditions using $and
            this._whereData = {
                $and: [this._whereData, conditions]
            };
        } else {
            this._whereData = conditions;
        }

        return this;
    }

    /**
     * Process ORDER clause with validation - delegates to FilterOrder
     */
    private processOrderClause(orderSpec: any): void {
        // Let FilterOrder handle all validation
        FilterOrder.validate(orderSpec);
        this.$order(orderSpec);
    }

    /**
     * ORDER BY processing - simplified to store raw data for FilterOrder
     */
    $order(orderSpec: any): Filter {
        if (!orderSpec) return this;

        // Store raw ORDER data for FilterOrder to process
        // Convert to array format for consistent handling
        if (Array.isArray(orderSpec)) {
            this._order.push(...this.normalizeOrderSpecToArray(orderSpec));
        } else {
            this._order.push(...this.normalizeOrderSpecToArray([orderSpec]));
        }

        return this;
    }

    /**
     * Normalize order specification to FilterOrderInfo array
     */
    private normalizeOrderSpecToArray(orderSpecs: any[]): FilterOrderInfo[] {
        const result: FilterOrderInfo[] = [];

        for (const spec of orderSpecs) {
            if (typeof spec === 'string') {
                const parts = spec.split(' ');
                const field = parts[0];
                const sort = (parts[1] || 'asc').toLowerCase() as 'asc' | 'desc';
                result.push({ field, sort: sort === 'desc' ? 'desc' : 'asc' });
            } else if (typeof spec === 'object' && spec !== null) {
                if (spec.field && spec.sort) {
                    const sort = spec.sort.toLowerCase();
                    result.push({
                        field: spec.field,
                        sort: (sort === 'desc' || sort === 'descending') ? 'desc' : 'asc'
                    });
                } else {
                    // Process all entries in the object: { name: 'asc', created_at: 'desc' }
                    for (const [field, sort] of Object.entries(spec)) {
                        const normalizedSort = (sort as string).toLowerCase();
                        result.push({
                            field,
                            sort: (normalizedSort === 'desc' || normalizedSort === 'descending') ? 'desc' : 'asc'
                        });
                    }
                }
            }
        }

        return result;
    }

    /**
     * Process LIMIT clause with validation
     */
    private processLimitClause(limit: number, offset?: number): void {
        this.validateLimitClause(limit, offset);
        this.$limit(limit, offset);
    }

    /**
     * Validate LIMIT/OFFSET clause
     */
    private validateLimitClause(limit: number, offset?: number): void {
        if (!Number.isInteger(limit) || limit < 0) {
            throw HttpErrors.badRequest('Limit must be a non-negative integer', 'FILTER_INVALID_LIMIT_VALUE');
        }

        if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
            throw HttpErrors.badRequest('Offset must be a non-negative integer', 'FILTER_INVALID_OFFSET_VALUE');
        }
    }

    /**
     * LIMIT/OFFSET processing
     */
    $limit(limit?: number, offset?: number): Filter {
        this._limit = limit;
        this._offset = offset;
        return this;
    }

    // Soft delete options
    withSoftDeleteOptions(options: FilterWhereOptions): Filter {
        this._softDeleteOptions = options;
        return this;
    }

    // Execute the query
    //
    // 🚨 TODO: ARCHITECTURAL ISSUE - Filter should NOT execute database operations
    // This method bypasses the observer pipeline and violates separation of concerns.
    // Should be replaced with toSQL() method that returns query + parameters.
    /**
     * Generate SQL query and parameters with comprehensive validation (Issue #102 - toSQL pattern)
     *
     * Returns SQL query and parameters for execution by Database methods.
     * Uses FilterWhere and FilterOrder for consistent SQL generation with soft delete support.
     */
    toSQL(): { query: string; params: any[] } {
        try {
            // Build SELECT clause (no parameters)
            const selectClause = this.buildSelectClause();

            // Use system context for automatic soft delete handling if available
            const options = this.system ? {
                includeTrashed: this.system.options.trashed || false,
                includeDeleted: this.system.options.deleted || false,
                ...this._softDeleteOptions
            } : this._softDeleteOptions;

            // Use FilterWhere for WHERE clause with soft delete options
            const { whereClause, params: whereParams } = FilterWhere.generate(
                this._whereData,
                0,
                options
            );

            // Use FilterOrder for ORDER BY clause
            const orderData = this.extractOrderData();
            const orderClause = FilterOrder.generate(orderData);

            // Build LIMIT/OFFSET clause
            const limitClause = this.getLimitClause();

            // Combine all clauses
            const query = [
                `SELECT ${selectClause}`,
                `FROM "${this._tableName}"`,
                whereClause ? `WHERE ${whereClause}` : '',
                orderClause, // FilterOrder already includes "ORDER BY" prefix
                limitClause
            ].filter(Boolean).join(' ');

            console.debug('SQL query generated successfully', {
                tableName: this._tableName,
                paramCount: whereParams.length
            });

            return { query, params: whereParams };
        } catch (error) {
            console.warn('SQL query generation failed', {
                tableName: this._tableName,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Build SELECT clause with proper escaping
     */
    private buildSelectClause(): string {
        if (this._select.length === 0 || this._select.includes('*')) {
            return '*';
        }

        return this._select.map(col => `"${col}"`).join(', ');
    }

    /**
     * Generate WHERE clause with parameters for use in custom queries
     *
     * Returns WHERE clause conditions and parameters that can be used
     * to build COUNT queries or other custom SQL statements.
     */
    toWhereSQL(): { whereClause: string; params: any[] } {
        try {
            // Use system context for automatic soft delete handling if available
            const options = this.system ? {
                includeTrashed: this.system.options.trashed || false,
                includeDeleted: this.system.options.deleted || false,
                ...this._softDeleteOptions
            } : this._softDeleteOptions;

            // Use FilterWhere for consistent WHERE clause generation
            const result = FilterWhere.generate(this._whereData, 0, options);

            console.debug('WHERE clause generated successfully', {
                tableName: this._tableName,
                paramCount: result.params.length
            });

            return result;
        } catch (error) {
            console.warn('WHERE clause generation failed', {
                tableName: this._tableName,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    // extractWhereData() method removed - now using _whereData directly

    /**
     * Generate COUNT query with parameters
     *
     * Returns a COUNT(*) query using the current filter conditions.
     * Useful for pagination and result count operations.
     */
    toCountSQL(): { query: string; params: any[] } {
        try {
            const { whereClause, params } = this.toWhereSQL();

            let query = `SELECT COUNT(*) as count FROM "${this._tableName}"`;
            if (whereClause) {
                query += ` WHERE ${whereClause}`;
            }

            console.debug('COUNT query generated successfully', {
                tableName: this._tableName,
                paramCount: params.length
            });

            return { query, params };
        } catch (error) {
            console.warn('COUNT query generation failed', {
                tableName: this._tableName,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Generate aggregation query with parameters
     *
     * Returns an aggregation query (SUM, AVG, MIN, MAX, COUNT) with optional GROUP BY.
     * Useful for analytics, dashboards, and statistical queries.
     */
    toAggregateSQL(aggregations: AggregateSpec, groupBy?: string[]): { query: string; params: any[] } {
        try {
            // Build aggregation SELECT clause
            const aggregateClause = this.buildAggregateClause(aggregations);

            // Build GROUP BY clause if provided
            const groupByClause = this.buildGroupByClause(groupBy);

            // Get WHERE clause with parameters
            const { whereClause, params } = this.toWhereSQL();

            // Build complete query
            const selectParts: string[] = [];

            // Add GROUP BY fields to SELECT
            if (groupBy && groupBy.length > 0) {
                selectParts.push(...groupBy.map(col => `"${this.sanitizeFieldName(col)}"`));
            }

            // Add aggregations to SELECT
            selectParts.push(aggregateClause);

            const query = [
                `SELECT ${selectParts.join(', ')}`,
                `FROM "${this._tableName}"`,
                whereClause ? `WHERE ${whereClause}` : '',
                groupByClause
            ].filter(Boolean).join(' ');

            console.debug('Aggregation query generated successfully', {
                tableName: this._tableName,
                aggregationCount: Object.keys(aggregations).length,
                groupByFields: groupBy?.length || 0,
                paramCount: params.length
            });

            return { query, params };
        } catch (error) {
            console.warn('Aggregation query generation failed', {
                tableName: this._tableName,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Build aggregation SELECT clause from AggregateSpec
     */
    private buildAggregateClause(aggregations: AggregateSpec): string {
        const aggregateParts: string[] = [];

        for (const [alias, aggFunc] of Object.entries(aggregations)) {
            // Validate alias
            const sanitizedAlias = this.sanitizeFieldName(alias);

            // Extract function and field
            if ('$count' in aggFunc) {
                const field = aggFunc.$count;
                if (field === '*') {
                    aggregateParts.push(`COUNT(*) as "${sanitizedAlias}"`);
                } else {
                    const sanitizedField = this.sanitizeFieldName(field);
                    aggregateParts.push(`COUNT("${sanitizedField}") as "${sanitizedAlias}"`);
                }
            } else if ('$sum' in aggFunc) {
                const sanitizedField = this.sanitizeFieldName(aggFunc.$sum);
                aggregateParts.push(`SUM("${sanitizedField}") as "${sanitizedAlias}"`);
            } else if ('$avg' in aggFunc) {
                const sanitizedField = this.sanitizeFieldName(aggFunc.$avg);
                aggregateParts.push(`AVG("${sanitizedField}") as "${sanitizedAlias}"`);
            } else if ('$min' in aggFunc) {
                const sanitizedField = this.sanitizeFieldName(aggFunc.$min);
                aggregateParts.push(`MIN("${sanitizedField}") as "${sanitizedAlias}"`);
            } else if ('$max' in aggFunc) {
                const sanitizedField = this.sanitizeFieldName(aggFunc.$max);
                aggregateParts.push(`MAX("${sanitizedField}") as "${sanitizedAlias}"`);
            } else if ('$distinct' in aggFunc) {
                const sanitizedField = this.sanitizeFieldName(aggFunc.$distinct);
                aggregateParts.push(`COUNT(DISTINCT "${sanitizedField}") as "${sanitizedAlias}"`);
            } else {
                throw HttpErrors.badRequest(`Unknown aggregation function for alias '${alias}'`, 'FILTER_INVALID_AGGREGATION');
            }
        }

        if (aggregateParts.length === 0) {
            throw HttpErrors.badRequest('At least one aggregation function required', 'FILTER_NO_AGGREGATIONS');
        }

        return aggregateParts.join(', ');
    }

    /**
     * Build GROUP BY clause with proper escaping
     */
    private buildGroupByClause(groupBy?: string[]): string {
        if (!groupBy || groupBy.length === 0) {
            return '';
        }

        // Validate and sanitize field names
        const sanitizedFields = groupBy.map(col => {
            const sanitized = this.sanitizeFieldName(col);
            return `"${sanitized}"`;
        });

        return `GROUP BY ${sanitizedFields.join(', ')}`;
    }

    /**
     * Sanitize field name to prevent SQL injection
     */
    private sanitizeFieldName(field: string): string {
        if (!field || typeof field !== 'string') {
            throw HttpErrors.badRequest('Field name must be a non-empty string', 'FILTER_INVALID_FIELD');
        }

        // Allow alphanumeric and underscore only
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
            throw HttpErrors.badRequest(`Invalid field name format: ${field}`, 'FILTER_INVALID_FIELD_FORMAT');
        }

        return field;
    }

    /**
     * Get just the WHERE clause conditions for use in other queries
     */
    getWhereClause(): string {
        try {
            // Use system context for automatic soft delete handling if available
            const options = this.system ? {
                includeTrashed: this.system.options.trashed || false,
                includeDeleted: this.system.options.deleted || false,
                ...this._softDeleteOptions
            } : this._softDeleteOptions;

            // Use FilterWhere for consistent WHERE clause generation
            const { whereClause } = FilterWhere.generate(this._whereData, 0, options);
            return whereClause || '1=1';
        } catch (error) {
            console.warn('WHERE clause extraction failed', {
                tableName: this._tableName,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Get just the ORDER BY clause for use in other queries
     */
    getOrderClause(): string {
        try {
            // Use FilterOrder for consistent ORDER BY generation
            const orderData = this.extractOrderData();
            const orderClause = FilterOrder.generate(orderData);

            // Remove "ORDER BY" prefix since getOrderClause() returns just the clause part
            return orderClause.replace(/^ORDER BY\s+/, '');
        } catch (error) {
            console.warn('ORDER clause extraction failed', {
                tableName: this._tableName,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Extract ORDER data from Filter's internal state for FilterOrder
     */
    private extractOrderData(): any {
        // Convert Filter's internal _order to FilterOrder format
        return this._order.map(orderInfo => ({
            field: orderInfo.field,
            sort: orderInfo.sort,
        }));
    }

    /**
     * Get just the LIMIT/OFFSET clause for use in other queries
     */
    getLimitClause(): string {
        try {
            if (this._limit !== undefined) {
                let limitClause = `LIMIT ${this._limit}`;
                if (this._offset !== undefined) {
                    limitClause += ` OFFSET ${this._offset}`;
                }
                return limitClause;
            }
            return '';
        } catch (error) {
            console.warn('LIMIT clause generation failed', {
                tableName: this._tableName,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }



    /**
     * Utility method to check if string is a valid UUID
     */
    private isUUID(str: string): boolean {
        if (typeof str !== 'string') {
            return false;
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
    }

    // TODO: Implement advanced features
    // $lookups(config: any): Filter { }
    // $related(config: any): Filter { }
    // $join(config: any): Filter { }
}
