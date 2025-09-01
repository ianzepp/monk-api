import { FilterWhere, FilterOp, type FilterWhereInfo } from '@src/lib/filter-where.js';
import { FilterOrder, type FilterOrderInfo } from '@src/lib/filter-order.js';
import type { FilterWhereOptions } from '@src/lib/filter-where.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';

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
 * - Logic: `{ $and: [{ $or: [{ role: "admin" }, { verified: true }] }] }`
 *
 * Architecture: Filter → FilterWhere → FilterOrder → SQL generation
 * Integration: Observer pipeline, soft delete filtering, schema validation
 *
 * See docs/FILTER.md for complete operator reference and examples.
 */

// FilterOp enum is now imported from FilterWhere where the implementation logic lives

// FilterWhereInfo is now imported from FilterWhere where the implementation logic lives

// New tree structure for complex logical operators
export interface ConditionNode {
    type: 'condition' | 'logical';

    // For condition nodes
    column?: string;
    operator?: FilterOp;
    data?: any;

    // For logical nodes
    logicalOp?: '$and' | '$or' | '$not';
    children?: ConditionNode[];
}

// FilterOrderInfo is now imported from FilterOrder where the implementation logic lives

export interface FilterData {
    schema?: string;
    select?: string[];
    where?: any;
    order?: any;
    limit?: number;
    offset?: number;
    lookups?: any;
    related?: any;
    options?: any;
}

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
    private _where: FilterWhereInfo[] = []; // Legacy - keep for backward compatibility
    private _conditions: ConditionNode[] = []; // New tree structure
    private _order: FilterOrderInfo[] = [];
    private _limit?: number;
    private _offset?: number;
    private _lookups: any[] = [];
    private _related: any[] = [];
    private _softDeleteOptions: FilterWhereOptions = {};

    // Parameter collection for SQL parameterization (Issue #105)
    private _paramValues: any[] = [];
    private _paramIndex: number = 0;

    constructor(tableName: string) {
        this._tableName = tableName;
        this.validateTableName(tableName);

        // For dynamic schemas, we'll build queries using raw SQL
        // since Drizzle's type system doesn't know about runtime tables
        this._query = null; // Will build SQL manually
    }

    /**
     * Add parameter to collection and return PostgreSQL placeholder
     * Creates parameterized queries for security and performance
     */
    private PARAM(value: any): string {
        this._paramValues.push(value);
        return `$${++this._paramIndex}`;
    }

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
            
            logger.debug('Filter assignment completed', {
                tableName: this._tableName,
                sourceType: Array.isArray(source) ? 'array' : typeof source
            });
            
        } catch (error) {
            logger.warn('Filter assignment failed', {
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
            throw HttpErrors.badRequest('Select must be an array of column names', 'FILTER_INVALID_SELECT');
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
    private processSelectClause(columns: string[]): void {
        this.validateSelectColumns(columns);
        this.$select(...columns);
    }

    /**
     * Validate SELECT columns
     */
    private validateSelectColumns(columns: string[]): void {
        if (!Array.isArray(columns)) {
            throw HttpErrors.badRequest('Select columns must be an array', 'FILTER_INVALID_SELECT_TYPE');
        }
        
        for (const column of columns) {
            if (typeof column !== 'string' || !column.trim()) {
                throw HttpErrors.badRequest('All select columns must be non-empty strings', 'FILTER_INVALID_COLUMN_NAME');
            }
            
            // Basic SQL injection protection for column names
            if (column !== '*' && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
                throw HttpErrors.badRequest(`Invalid column name format: ${column}`, 'FILTER_INVALID_COLUMN_FORMAT');
            }
        }
    }

    /**
     * SELECT field specification
     */
    $select(...columns: string[]): Filter {
        // If '*' is included, select all (for now, just track the request)
        if (columns.includes('*')) {
            this._select = ['*'];
        } else {
            this._select.push(...columns);
        }
        return this;
    }

    /**
     * Process WHERE clause with validation
     */
    private processWhereClause(conditions: any): void {
        this.validateWhereConditions(conditions);
        this.$where(conditions);
    }

    /**
     * Validate WHERE conditions structure
     */
    private validateWhereConditions(conditions: any): void {
        if (!conditions) {
            return; // Empty conditions are valid
        }

        if (typeof conditions === 'string') {
            if (!conditions.trim()) {
                throw HttpErrors.badRequest('WHERE condition string cannot be empty', 'FILTER_EMPTY_WHERE_STRING');
            }
            return; // String conditions are valid
        }

        if (typeof conditions !== 'object' || conditions === null) {
            throw HttpErrors.badRequest('WHERE conditions must be object or string', 'FILTER_INVALID_WHERE_TYPE');
        }

        // Validate object structure
        this.validateWhereObject(conditions);
    }

    /**
     * Validate WHERE object structure recursively
     */
    private validateWhereObject(conditions: any): void {
        for (const [key, value] of Object.entries(conditions)) {
            if (key.startsWith('$')) {
                // Validate logical operators
                this.validateLogicalOperator(key as FilterOp, value);
            } else {
                // Validate field conditions
                this.validateFieldCondition(key, value);
            }
        }
    }

    /**
     * Validate logical operator structure
     */
    private validateLogicalOperator(operator: FilterOp, value: any): void {
        if (operator === FilterOp.AND || operator === FilterOp.OR) {
            if (!Array.isArray(value)) {
                throw HttpErrors.badRequest(`${operator} operator requires an array of conditions`, 'FILTER_INVALID_LOGICAL_OPERATOR');
            }
            
            if (value.length === 0) {
                throw HttpErrors.badRequest(`${operator} operator cannot have empty conditions array`, 'FILTER_EMPTY_LOGICAL_ARRAY');
            }
            
            // Recursively validate each condition
            value.forEach((condition: any, index: number) => {
                if (typeof condition !== 'object' || condition === null) {
                    throw HttpErrors.badRequest(`${operator} condition at index ${index} must be an object`, 'FILTER_INVALID_LOGICAL_CONDITION');
                }
                this.validateWhereObject(condition);
            });
        } else if (operator === FilterOp.NOT) {
            if (typeof value !== 'object' || value === null) {
                throw HttpErrors.badRequest('$not operator requires an object condition', 'FILTER_INVALID_NOT_CONDITION');
            }
            this.validateWhereObject(value);
        } else {
            throw HttpErrors.badRequest(`Unsupported logical operator: ${operator}`, 'FILTER_UNSUPPORTED_LOGICAL_OPERATOR');
        }
    }

    /**
     * Validate field condition structure
     */
    private validateFieldCondition(fieldName: string, fieldValue: any): void {
        // Validate field name
        if (!fieldName || typeof fieldName !== 'string') {
            throw HttpErrors.badRequest('Field name must be a non-empty string', 'FILTER_INVALID_FIELD_NAME');
        }

        // Basic SQL injection protection for field names
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldName)) {
            throw HttpErrors.badRequest(`Invalid field name format: ${fieldName}`, 'FILTER_INVALID_FIELD_FORMAT');
        }

        // Validate field value structure
        if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
            // Complex condition validation: { "age": { "$gte": 18, "$lt": 65 } }
            for (const [op, data] of Object.entries(fieldValue)) {
                if (!Object.values(FilterOp).includes(op as FilterOp)) {
                    throw HttpErrors.badRequest(`Unsupported filter operator: ${op}`, 'FILTER_UNSUPPORTED_OPERATOR');
                }
                this.validateOperatorData(op as FilterOp, data);
            }
        }
        // Array and simple values are handled in processing
    }

    /**
     * Validate operator-specific data requirements
     */
    private validateOperatorData(operator: FilterOp, data: any): void {
        // Array operators require array data
        const arrayOperators = [FilterOp.IN, FilterOp.NIN, FilterOp.ANY, FilterOp.ALL, FilterOp.NANY, FilterOp.NALL];
        if (arrayOperators.includes(operator) && !Array.isArray(data)) {
            throw HttpErrors.badRequest(`Operator ${operator} requires array data`, 'FILTER_OPERATOR_REQUIRES_ARRAY');
        }

        // Null/exists operators have specific requirements
        if (operator === FilterOp.NULL && typeof data !== 'boolean') {
            throw HttpErrors.badRequest('$null operator requires boolean value', 'FILTER_NULL_REQUIRES_BOOLEAN');
        }
        
        if (operator === FilterOp.EXISTS && typeof data !== 'boolean') {
            throw HttpErrors.badRequest('$exists operator requires boolean value', 'FILTER_EXISTS_REQUIRES_BOOLEAN');
        }

        // Between operator requires array with exactly 2 elements
        if (operator === FilterOp.BETWEEN && (!Array.isArray(data) || data.length !== 2)) {
            throw HttpErrors.badRequest('$between operator requires array with exactly 2 elements [min, max]', 'FILTER_BETWEEN_REQUIRES_ARRAY');
        }
    }

    /**
     * WHERE clause processing
     */
    $where(conditions: any): Filter {
        if (!conditions) return this;

        // String → convert to ID lookup
        if (typeof conditions === 'string') {
            this._where.push({ column: 'id', operator: FilterOp.EQ, data: conditions });
            return this;
        }

        // Object → process each key-value pair
        if (typeof conditions === 'object') {
            const nodes = this._processWhereObject(conditions);
            this._conditions.push(...nodes);
        }

        this._applyWhereConditions();
        return this;
    }

    private _processWhereObject(conditions: any): ConditionNode[] {
        const nodes: ConditionNode[] = [];

        for (const [key, value] of Object.entries(conditions)) {
            if (key.startsWith('$')) {
                // Logical operators
                nodes.push(this._processLogicalOperator(key as FilterOp, value));
            } else {
                // Field conditions
                nodes.push(...this._processFieldCondition(key, value));
            }
        }

        return nodes;
    }

    private _processLogicalOperator(operator: FilterOp, value: any): ConditionNode {
        try {
            if (operator === FilterOp.AND && Array.isArray(value)) {
                const children: ConditionNode[] = [];
                value.forEach((condition: any) => {
                    children.push(...this._processWhereObject(condition));
                });

                return {
                    type: 'logical',
                    logicalOp: '$and',
                    children,
                };
            } else if (operator === FilterOp.OR && Array.isArray(value)) {
                const children: ConditionNode[] = [];
                value.forEach((condition: any) => {
                    children.push(...this._processWhereObject(condition));
                });

                return {
                    type: 'logical',
                    logicalOp: '$or',
                    children,
                };
            } else if (operator === FilterOp.NOT && typeof value === 'object') {
                const children = this._processWhereObject(value);

                return {
                    type: 'logical',
                    logicalOp: '$not',
                    children,
                };
            }

            throw HttpErrors.badRequest(`Unsupported logical operator: ${operator}`, 'FILTER_UNSUPPORTED_LOGICAL_OPERATOR');
        } catch (error) {
            logger.warn('Logical operator processing failed', {
                operator,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private _processFieldCondition(fieldName: string, fieldValue: any): ConditionNode[] {
        const nodes: ConditionNode[] = [];

        if (Array.isArray(fieldValue)) {
            // Auto-convert array to $in: { "id": ["uuid1", "uuid2"] } → { "id": { "$in": ["uuid1", "uuid2"] } }
            const node = {
                type: 'condition' as const,
                column: fieldName,
                operator: FilterOp.IN,
                data: fieldValue,
            };

            nodes.push(node);

            // Also add to legacy array for backward compatibility
            this._where.push({
                column: fieldName,
                operator: FilterOp.IN,
                data: fieldValue,
            });
        } else if (typeof fieldValue === 'object' && fieldValue !== null) {
            // Complex condition: { "age": { "$gte": 18, "$lt": 65 } }
            for (const [op, data] of Object.entries(fieldValue)) {
                nodes.push({
                    type: 'condition',
                    column: fieldName,
                    operator: op as FilterOp,
                    data: data,
                });

                // Also add to legacy array for backward compatibility
                this._where.push({
                    column: fieldName,
                    operator: op as FilterOp,
                    data: data,
                });
            }
        } else {
            // Simple equality: { "status": "active" }
            const node = {
                type: 'condition' as const,
                column: fieldName,
                operator: FilterOp.EQ,
                data: fieldValue,
            };

            nodes.push(node);

            // Also add to legacy array for backward compatibility
            this._where.push({
                column: fieldName,
                operator: FilterOp.EQ,
                data: fieldValue,
            });
        }

        return nodes;
    }

    private _applyWhereConditions(): void {
        // WHERE conditions will be applied during SQL building
        // since we're using raw SQL for dynamic schemas
    }

    /**
     * Process ORDER clause with validation
     */
    private processOrderClause(orderSpec: any): void {
        this.validateOrderClause(orderSpec);
        this.$order(orderSpec);
    }

    /**
     * Validate ORDER clause structure
     */
    private validateOrderClause(orderSpec: any): void {
        if (!orderSpec) return;

        if (Array.isArray(orderSpec)) {
            orderSpec.forEach((spec: any, index: number) => {
                try {
                    this.validateOrderSpec(spec);
                } catch (error) {
                    throw HttpErrors.badRequest(`Invalid order specification at index ${index}: ${error instanceof Error ? error.message : String(error)}`, 'FILTER_INVALID_ORDER_SPEC');
                }
            });
        } else {
            this.validateOrderSpec(orderSpec);
        }
    }

    /**
     * Validate individual order specification
     */
    private validateOrderSpec(spec: any): void {
        if (typeof spec === 'string') {
            const parts = spec.split(' ');
            const column = parts[0];
            const sort = parts[1] || 'asc';
            
            if (!column || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
                throw HttpErrors.badRequest(`Invalid column name in order spec: ${column}`, 'FILTER_INVALID_ORDER_COLUMN');
            }
            
            if (sort && !['asc', 'desc'].includes(sort.toLowerCase())) {
                throw HttpErrors.badRequest(`Invalid sort direction: ${sort}. Must be 'asc' or 'desc'`, 'FILTER_INVALID_SORT_DIRECTION');
            }
        } else if (typeof spec === 'object' && spec !== null) {
            if (spec.column && spec.sort) {
                // { "column": "name", "sort": "asc" }
                if (typeof spec.column !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(spec.column)) {
                    throw HttpErrors.badRequest(`Invalid column name: ${spec.column}`, 'FILTER_INVALID_ORDER_COLUMN');
                }
                if (!['asc', 'desc'].includes(spec.sort)) {
                    throw HttpErrors.badRequest(`Invalid sort direction: ${spec.sort}`, 'FILTER_INVALID_SORT_DIRECTION');
                }
            } else {
                // { "name": "asc" }
                const entries = Object.entries(spec);
                if (entries.length !== 1) {
                    throw HttpErrors.badRequest('Order object must have exactly one column-sort pair', 'FILTER_INVALID_ORDER_OBJECT');
                }
                
                const [column, sort] = entries[0];
                if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
                    throw HttpErrors.badRequest(`Invalid column name: ${column}`, 'FILTER_INVALID_ORDER_COLUMN');
                }
                if (!['asc', 'desc'].includes(sort as string)) {
                    throw HttpErrors.badRequest(`Invalid sort direction: ${sort}`, 'FILTER_INVALID_SORT_DIRECTION');
                }
            }
        } else {
            throw HttpErrors.badRequest('Order specification must be string or object', 'FILTER_INVALID_ORDER_TYPE');
        }
    }

    /**
     * ORDER BY processing
     */
    $order(orderSpec: any): Filter {
        if (!orderSpec) return this;

        if (Array.isArray(orderSpec)) {
            orderSpec.forEach((spec: any) => this._processOrderSpec(spec));
        } else {
            this._processOrderSpec(orderSpec);
        }

        return this;
    }

    private _processOrderSpec(spec: any): void {
        if (typeof spec === 'string') {
            // "name asc" or just "name"
            const parts = spec.split(' ');
            const column = parts[0];
            const sort = (parts[1] || 'asc') as 'asc' | 'desc';
            this._order.push({ column, sort });
        } else if (typeof spec === 'object') {
            // { "name": "asc" } or { "column": "name", "sort": "asc" }
            if (spec.column && spec.sort) {
                this._order.push({ column: spec.column, sort: spec.sort });
            } else {
                const [column, sort] = Object.entries(spec)[0];
                this._order.push({ column, sort: sort as 'asc' | 'desc' });
            }
        }
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
            // Reset parameter collection for fresh query generation
            this._paramValues = [];
            this._paramIndex = 0;

            // Build SELECT clause (no parameters typically)
            const selectClause = this.buildSelectClause();

            // Use FilterWhere for WHERE clause with soft delete options
            const whereData = this.extractWhereData();
            const { whereClause, params: whereParams } = FilterWhere.generate(
                whereData, 
                this._paramIndex,
                this._softDeleteOptions
            );
            this._paramValues.push(...whereParams);
            this._paramIndex += whereParams.length;

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

            logger.debug('SQL query generated successfully', {
                tableName: this._tableName,
                paramCount: this._paramValues.length
            });

            return { query, params: this._paramValues };
        } catch (error) {
            logger.warn('SQL query generation failed', {
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
            // Use FilterWhere for consistent WHERE clause generation
            const whereData = this.extractWhereData();

            // const options = {
            //     includeTrashed: this.system.options.trashed || false,
            //     includeDeleted: this.system.options.deleted || false,
            // };

            const result = FilterWhere.generate(whereData, 0, {});
            
            logger.debug('WHERE clause generated successfully', {
                tableName: this._tableName,
                paramCount: result.params.length
            });
            
            return result;
        } catch (error) {
            logger.warn('WHERE clause generation failed', {
                tableName: this._tableName,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Extract WHERE data from Filter's internal state for FilterWhere
     */
    private extractWhereData(): any {
        // Convert Filter's internal _where conditions to FilterWhere format
        const whereData: any = {};

        for (const whereInfo of this._where) {
            const { column, operator, data } = whereInfo;

            if (!column) continue; // Skip conditions without column

            if (operator === FilterOp.EQ) {
                whereData[column] = data;
            } else {
                // Complex operators stored as objects
                if (!whereData[column]) {
                    whereData[column] = {};
                }
                whereData[column][operator] = data;
            }
        }

        return whereData;
    }

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

            logger.debug('COUNT query generated successfully', {
                tableName: this._tableName,
                paramCount: params.length
            });

            return { query, params };
        } catch (error) {
            logger.warn('COUNT query generation failed', {
                tableName: this._tableName,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Get just the WHERE clause conditions for use in other queries
     */
    getWhereClause(): string {
        try {
            // Use FilterWhere for consistent WHERE clause generation
            const whereData = this.extractWhereData();
            const { whereClause } = FilterWhere.generate(whereData, 0, this._softDeleteOptions);
            return whereClause || '1=1';
        } catch (error) {
            logger.warn('WHERE clause extraction failed', {
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
            logger.warn('ORDER clause extraction failed', {
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
            column: orderInfo.column,
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
            logger.warn('LIMIT clause generation failed', {
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
