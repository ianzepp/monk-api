import { FilterWhere } from '@src/lib/filter-where.js';
import { FilterOrder } from '@src/lib/filter-order.js';
import type { FilterWhereOptions } from '@src/lib/filter-where.js';

/**
 * Filter - Enterprise-Grade Database Query Builder
 *
 * Comprehensive query builder with 25+ operators including PostgreSQL arrays, logical operations,
 * full-text search, and advanced filtering patterns. Integrates with observer pipeline and ACL systems.
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

// Filter operation types
export enum FilterOp {
    // Comparison
    EQ = '$eq',
    NE = '$ne',
    NEQ = '$neq',
    GT = '$gt',
    GTE = '$gte',
    LT = '$lt',
    LTE = '$lte',

    // Pattern matching
    LIKE = '$like',
    NLIKE = '$nlike',
    ILIKE = '$ilike',
    NILIKE = '$nilike',
    REGEX = '$regex',
    NREGEX = '$nregex',

    // Array operations
    IN = '$in',
    NIN = '$nin',
    ANY = '$any',
    ALL = '$all',
    NANY = '$nany',
    NALL = '$nall',

    // Logical
    AND = '$and',
    OR = '$or',
    NOT = '$not',

    // Search
    FIND = '$find',
    TEXT = '$text',

    // Existence
    EXISTS = '$exists',
    NULL = '$null',
}

// Filter interfaces
export interface FilterWhereInfo {
    column?: string;
    operator: FilterOp;
    data: any;
}

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

export interface FilterOrderInfo {
    column: string;
    sort: 'asc' | 'desc';
}

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

    // Main assignment method - handles multiple input formats
    assign(source?: FilterData | string | string[]): Filter {
        if (source === undefined) {
            return this;
        }

        console.debug('lib/filter: source=%j', source);

        // Array of IDs → convert to $in (skip empty arrays)
        if (Array.isArray(source)) {
            if (source.length === 0) {
                return this; // Empty array = no conditions
            }
            return this.assign({ where: { id: { $in: source } } });
        }

        // Single UUID → convert to $eq
        if (typeof source === 'string' && this.isUUID(source)) {
            return this.assign({ where: { id: source } });
        }

        // Plain string → assume name field
        if (typeof source === 'string') {
            return this.assign({ where: { name: source } });
        }

        // Process FilterData object
        if (typeof source === 'object') {
            this._assignData(source);
        }

        return this;
    }

    private _assignData(source: FilterData): void {
        // SELECT
        if (source.select) {
            this.$select(...source.select);
        }

        // WHERE
        if (source.where) {
            this.$where(source.where);
        }

        // ORDER
        if (source.order) {
            this.$order(source.order);
        }

        // LIMIT/OFFSET
        if (source.limit !== undefined) {
            this.$limit(source.limit, source.offset);
        }

        // TODO: LOOKUPS and RELATED
        // if (source.lookups) this.$lookups(source.lookups);
        // if (source.related) this.$related(source.related);
    }

    // SELECT field specification
    $select(...columns: string[]): Filter {
        // If '*' is included, select all (for now, just track the request)
        if (columns.includes('*')) {
            this._select = ['*'];
        } else {
            this._select.push(...columns);
        }
        return this;
    }

    // WHERE clause processing
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

        throw new Error(`Unsupported logical operator: ${operator}`);
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

    // ORDER BY processing
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

    // LIMIT/OFFSET processing
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
     * Generate SQL query and parameters (Issue #102 - toSQL pattern)
     *
     * Returns SQL query and parameters for execution by Database methods.
     * Uses FilterWhere and FilterOrder for consistent SQL generation with soft delete support.
     */
    toSQL(): { query: string; params: any[] } {
        // Reset parameter collection for fresh query generation
        this._paramValues = [];
        this._paramIndex = 0;

        // Build SELECT clause (no parameters typically)
        const selectClause = this._select.length > 0 && !this._select.includes('*') 
            ? this._select.map(col => `"${col}"`).join(', ') 
            : '*';

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

        return { query, params: this._paramValues };
    }

    /**
     * Generate WHERE clause with parameters for use in custom queries
     *
     * Returns WHERE clause conditions and parameters that can be used
     * to build COUNT queries or other custom SQL statements.
     */
    toWhereSQL(): { whereClause: string; params: any[] } {
        // Use FilterWhere for consistent WHERE clause generation
        const whereData = this.extractWhereData();

        // const options = {
        //     includeTrashed: this.system.options.trashed || false,
        //     includeDeleted: this.system.options.deleted || false,
        // };

        return FilterWhere.generate(whereData, 0, {});
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
        const { whereClause, params } = this.toWhereSQL();

        let query = `SELECT COUNT(*) as count FROM "${this._tableName}"`;
        if (whereClause) {
            query += ` WHERE ${whereClause}`;
        }

        return { query, params };
    }

    // Get just the WHERE clause conditions for use in other queries
    getWhereClause(): string {
        // Use FilterWhere for consistent WHERE clause generation
        const whereData = this.extractWhereData();
        const { whereClause } = FilterWhere.generate(whereData, 0, this._softDeleteOptions);
        return whereClause || '1=1';
    }

    // Get just the ORDER BY clause for use in other queries
    getOrderClause(): string {
        // Use FilterOrder for consistent ORDER BY generation
        const orderData = this.extractOrderData();
        const orderClause = FilterOrder.generate(orderData);

        // Remove "ORDER BY" prefix since getOrderClause() returns just the clause part
        return orderClause.replace(/^ORDER BY\s+/, '');
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

    // Get just the LIMIT/OFFSET clause for use in other queries
    getLimitClause(): string {
        if (this._limit !== undefined) {
            let limitClause = `LIMIT ${this._limit}`;
            if (this._offset !== undefined) {
                limitClause += ` OFFSET ${this._offset}`;
            }
            return limitClause;
        }
        return '';
    }



    // Utility methods
    private isUUID(str: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
    }

    // TODO: Implement advanced features
    // $lookups(config: any): Filter { }
    // $related(config: any): Filter { }
    // $join(config: any): Filter { }
}
