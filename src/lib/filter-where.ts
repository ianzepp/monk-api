/**
 * FilterWhere - Schema-independent WHERE clause generation
 * 
 * Generates parameterized WHERE clauses without requiring schema setup.
 * Extracted from Filter class to enable reusable filtering logic in SqlObserver
 * and other contexts.
 * 
 * Features: Parameter offsetting, SQL injection protection, soft delete handling
 * 
 * Quick Examples:
 * - Simple: `FilterWhere.generate({ name: 'John', age: 25 })`
 * - Offset: `FilterWhere.generate({ id: 'record-123' }, 2)` → uses $3, $4, etc.
 * - Options: `FilterWhere.generate(filter, 0, { includeTrashed: true })`
 * 
 * See docs/FILTER.md for complete operator reference and examples.
 */

export enum FilterOp {
    // Comparison operators
    EQ = '$eq',
    NE = '$ne', 
    NEQ = '$neq',
    GT = '$gt',
    GTE = '$gte',
    LT = '$lt',
    LTE = '$lte',
    
    // Pattern matching operators
    LIKE = '$like',
    NLIKE = '$nlike',
    ILIKE = '$ilike',
    NILIKE = '$nilike',
    REGEX = '$regex',
    NREGEX = '$nregex',
    
    // Array membership operators
    IN = '$in',
    NIN = '$nin',
    
    // PostgreSQL array operations (CRITICAL for ACL)
    ANY = '$any',       // Array overlap: access_read && ARRAY[user_id, group_id]
    ALL = '$all',       // Array contains: tags @> ARRAY['feature', 'backend']
    NANY = '$nany',     // NOT array overlap: NOT (access_deny && ARRAY[user_id])
    NALL = '$nall',     // NOT array contains: NOT (permissions @> ARRAY['admin'])
    SIZE = '$size',     // Array size: array_length(tags, 1) = 3
    
    // Logical operators (CRITICAL for FTP wildcards)
    AND = '$and',       // Explicit AND: { $and: [condition1, condition2] }
    OR = '$or',         // OR conditions: { $or: [{ role: 'admin' }, { role: 'mod' }] }
    NOT = '$not',       // NOT condition: { $not: { status: 'banned' } }
    NAND = '$nand',     // NAND operations
    NOR = '$nor',       // NOR operations
    
    // Range operations
    BETWEEN = '$between', // Range: { age: { $between: [18, 65] } } → age BETWEEN 18 AND 65
    
    // Search operations
    FIND = '$find',     // Full-text search: { content: { $find: 'search terms' } }
    TEXT = '$text',     // Text search: { description: { $text: 'keyword' } }
    
    // Existence operators
    EXISTS = '$exists', // Field exists: { field: { $exists: true } } → field IS NOT NULL
    NULL = '$null'      // Field is null: { field: { $null: true } } → field IS NULL
}

export interface FilterWhereInfo {
    column: string;
    operator: FilterOp;
    data: any;
}

export interface FilterWhereOptions {
    includeTrashed?: boolean;
    includeDeleted?: boolean;
}

export class FilterWhere {
    private _paramValues: any[] = [];
    private _paramIndex: number = 0;
    private _conditions: FilterWhereInfo[] = [];

    constructor(private startingParamIndex: number = 0) {
        this._paramIndex = startingParamIndex;
    }

    /**
     * Add parameter to collection and return PostgreSQL placeholder
     * Supports parameter index offsetting for complex queries
     */
    private PARAM(value: any): string {
        this._paramValues.push(value);
        return `$${++this._paramIndex}`;
    }

    /**
     * Static method for quick WHERE clause generation
     */
    static generate(
        whereData: any, 
        startingParamIndex: number = 0,
        options: FilterWhereOptions = {}
    ): { whereClause: string; params: any[] } {
        const filterWhere = new FilterWhere(startingParamIndex);
        return filterWhere.build(whereData, options);
    }

    /**
     * Build WHERE clause from filter data object
     */
    build(whereData: any, options: FilterWhereOptions = {}): { whereClause: string; params: any[] } {
        // Reset parameter collection
        this._paramValues = [];
        this._paramIndex = this.startingParamIndex;
        this._conditions = [];

        // Parse where data into conditions
        this.parseWhereData(whereData);

        // Build WHERE clause
        const whereClause = this.buildWhereClause(options);
        
        return { whereClause, params: this._paramValues };
    }

    /**
     * Parse filter data object into conditions
     */
    private parseWhereData(whereData: any): void {
        if (!whereData || typeof whereData !== 'object') {
            return;
        }

        for (const [key, value] of Object.entries(whereData)) {
            // Handle logical operators
            if (key.startsWith('$') && this.isLogicalOperator(key as FilterOp)) {
                this.parseLogicalOperator(key as FilterOp, value);
            } else if (value === null || value === undefined) {
                // Handle null values
                this._conditions.push({
                    column: key,
                    operator: FilterOp.EQ,
                    data: null
                });
            } else if (Array.isArray(value)) {
                // Handle arrays as IN operations
                this._conditions.push({
                    column: key,
                    operator: FilterOp.IN,
                    data: value
                });
            } else if (typeof value === 'object' && value !== null) {
                // Handle operator objects: { $gt: 10, $lt: 100 }
                for (const [op, data] of Object.entries(value)) {
                    if (Object.values(FilterOp).includes(op as FilterOp)) {
                        this._conditions.push({
                            column: key,
                            operator: op as FilterOp,
                            data
                        });
                    }
                }
            } else {
                // Handle direct equality
                this._conditions.push({
                    column: key,
                    operator: FilterOp.EQ,
                    data: value
                });
            }
        }
    }

    /**
     * Check if operator is a logical operator
     */
    private isLogicalOperator(op: FilterOp): boolean {
        return [FilterOp.AND, FilterOp.OR, FilterOp.NOT, FilterOp.NAND, FilterOp.NOR].includes(op);
    }

    /**
     * Parse logical operator with nested conditions
     */
    private parseLogicalOperator(operator: FilterOp, data: any): void {
        if (!Array.isArray(data)) {
            throw new Error(`Logical operator ${operator} requires array of conditions`);
        }

        // Create a special condition that represents the logical operation
        this._conditions.push({
            column: '', // No specific column for logical operators
            operator,
            data: data // Array of nested conditions
        });
    }

    /**
     * Build complete WHERE clause string
     */
    private buildWhereClause(options: FilterWhereOptions): string {
        const conditions = [];

        // Add soft delete filtering unless explicitly included
        if (!options.includeTrashed) {
            conditions.push('"trashed_at" IS NULL');
        }

        // Add permanent delete filtering unless explicitly included  
        if (!options.includeDeleted) {
            conditions.push('"deleted_at" IS NULL');
        }

        // Add parsed conditions
        const parsedConditions = this._conditions
            .map(condition => this.buildSQLCondition(condition))
            .filter(Boolean);

        if (parsedConditions.length > 0) {
            conditions.push(`(${parsedConditions.join(' AND ')})`);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    }

    /**
     * Build individual SQL condition with proper parameterization
     */
    private buildSQLCondition(whereInfo: FilterWhereInfo): string | null {
        const { column, operator, data } = whereInfo;
        
        // Handle logical operators (no specific column)
        if (!column && this.isLogicalOperator(operator)) {
            return this.buildLogicalOperatorSQL(operator, data);
        }
        
        if (!column) return null;
        const quotedColumn = `"${column}"`;

        switch (operator) {
            case FilterOp.EQ:
                if (data === null || data === undefined) {
                    return `${quotedColumn} IS NULL`;
                }
                return `${quotedColumn} = ${this.PARAM(data)}`;

            case FilterOp.NE:
            case FilterOp.NEQ:
                if (data === null || data === undefined) {
                    return `${quotedColumn} IS NOT NULL`;
                }
                return `${quotedColumn} != ${this.PARAM(data)}`;

            case FilterOp.GT:
                return `${quotedColumn} > ${this.PARAM(data)}`;

            case FilterOp.GTE:
                return `${quotedColumn} >= ${this.PARAM(data)}`;

            case FilterOp.LT:
                return `${quotedColumn} < ${this.PARAM(data)}`;

            case FilterOp.LTE:
                return `${quotedColumn} <= ${this.PARAM(data)}`;

            case FilterOp.LIKE:
                return `${quotedColumn} LIKE ${this.PARAM(data)}`;

            case FilterOp.NLIKE:
                return `${quotedColumn} NOT LIKE ${this.PARAM(data)}`;

            case FilterOp.ILIKE:
                return `${quotedColumn} ILIKE ${this.PARAM(data)}`;

            case FilterOp.NILIKE:
                return `${quotedColumn} NOT ILIKE ${this.PARAM(data)}`;

            case FilterOp.REGEX:
                return `${quotedColumn} ~ ${this.PARAM(data)}`;

            case FilterOp.NREGEX:
                return `${quotedColumn} !~ ${this.PARAM(data)}`;

            case FilterOp.IN:
                const inValues = Array.isArray(data) ? data : [data];
                if (inValues.length === 0) {
                    return '1=0'; // No values = always false
                }
                return `${quotedColumn} IN (${inValues.map(v => this.PARAM(v)).join(', ')})`;

            case FilterOp.NIN:
                const ninValues = Array.isArray(data) ? data : [data];
                if (ninValues.length === 0) {
                    return '1=1'; // No values = always true
                }
                return `${quotedColumn} NOT IN (${ninValues.map(v => this.PARAM(v)).join(', ')})`;

            // PostgreSQL array operations
            case FilterOp.ANY:
                const anyValues = Array.isArray(data) ? data : [data];
                if (anyValues.length === 0) {
                    return '1=0'; // No values = always false
                }
                return `${quotedColumn} && ARRAY[${anyValues.map(v => this.PARAM(v)).join(', ')}]`;

            case FilterOp.ALL:
                const allValues = Array.isArray(data) ? data : [data];
                if (allValues.length === 0) {
                    return '1=1'; // No values = always true
                }
                return `${quotedColumn} @> ARRAY[${allValues.map(v => this.PARAM(v)).join(', ')}]`;

            case FilterOp.NANY:
                const nanyValues = Array.isArray(data) ? data : [data];
                if (nanyValues.length === 0) {
                    return '1=1'; // No values = always true
                }
                return `NOT (${quotedColumn} && ARRAY[${nanyValues.map(v => this.PARAM(v)).join(', ')}])`;

            case FilterOp.NALL:
                const nallValues = Array.isArray(data) ? data : [data];
                if (nallValues.length === 0) {
                    return '1=0'; // No values = always false
                }
                return `NOT (${quotedColumn} @> ARRAY[${nallValues.map(v => this.PARAM(v)).join(', ')}])`;

            case FilterOp.SIZE:
                if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                    // Handle nested operators: { $size: { $gte: 1 } }
                    const entries = Object.entries(data);
                    if (entries.length === 1) {
                        const [nestedOp, nestedValue] = entries[0];
                        const arrayLengthExpression = `array_length(${quotedColumn}, 1)`;
                        return this.buildSizeOperatorSQL(arrayLengthExpression, nestedOp as FilterOp, nestedValue);
                    }
                }
                return `array_length(${quotedColumn}, 1) = ${this.PARAM(data)}`;

            // Range operations
            case FilterOp.BETWEEN:
                if (!Array.isArray(data) || data.length !== 2) {
                    throw new Error('$between requires array with exactly 2 values: [min, max]');
                }
                if (data[0] === null || data[0] === undefined || data[1] === null || data[1] === undefined) {
                    throw new Error('$between requires non-null values: [min, max]');
                }
                return `${quotedColumn} BETWEEN ${this.PARAM(data[0])} AND ${this.PARAM(data[1])}`;

            // Existence operators
            case FilterOp.EXISTS:
                return data ? `${quotedColumn} IS NOT NULL` : `${quotedColumn} IS NULL`;

            case FilterOp.NULL:
                return data ? `${quotedColumn} IS NULL` : `${quotedColumn} IS NOT NULL`;

            // Search operations (basic implementation)
            case FilterOp.FIND:
                // For now, implement as ILIKE - can be enhanced with PostgreSQL full-text search later
                return `${quotedColumn} ILIKE ${this.PARAM(`%${data}%`)}`;

            case FilterOp.TEXT:
                // For now, implement as ILIKE - can be enhanced with PostgreSQL text search later
                return `${quotedColumn} ILIKE ${this.PARAM(`%${data}%`)}`;

            default:
                console.warn('Unsupported filter operator', { operator });
                return null;
        }
    }

    /**
     * Build SQL for size operator with nested operators
     */
    private buildSizeOperatorSQL(arrayLengthExpression: string, operator: FilterOp, value: any): string {
        switch (operator) {
            case FilterOp.EQ:
                return `${arrayLengthExpression} = ${this.PARAM(value)}`;
            case FilterOp.NE:
            case FilterOp.NEQ:
                return `${arrayLengthExpression} != ${this.PARAM(value)}`;
            case FilterOp.GT:
                return `${arrayLengthExpression} > ${this.PARAM(value)}`;
            case FilterOp.GTE:
                return `${arrayLengthExpression} >= ${this.PARAM(value)}`;
            case FilterOp.LT:
                return `${arrayLengthExpression} < ${this.PARAM(value)}`;
            case FilterOp.LTE:
                return `${arrayLengthExpression} <= ${this.PARAM(value)}`;
            case FilterOp.BETWEEN:
                if (!Array.isArray(value) || value.length !== 2) {
                    throw new Error('$size with $between requires array with exactly 2 values: [min, max]');
                }
                return `${arrayLengthExpression} BETWEEN ${this.PARAM(value[0])} AND ${this.PARAM(value[1])}`;
            case FilterOp.IN:
                const inValues = Array.isArray(value) ? value : [value];
                if (inValues.length === 0) {
                    return '1=0'; // No values = always false
                }
                return `${arrayLengthExpression} IN (${inValues.map(v => this.PARAM(v)).join(', ')})`;
            case FilterOp.NIN:
                const ninValues = Array.isArray(value) ? value : [value];
                if (ninValues.length === 0) {
                    return '1=1'; // No values = always true
                }
                return `${arrayLengthExpression} NOT IN (${ninValues.map(v => this.PARAM(v)).join(', ')})`;
            default:
                throw new Error(`Unsupported operator for $size: ${operator}`);
        }
    }

    /**
     * Build SQL for logical operators
     */
    private buildLogicalOperatorSQL(operator: FilterOp, data: any): string | null {
        if (!Array.isArray(data)) {
            throw new Error(`${operator} operator requires array of conditions`);
        }

        const clauses = data.map(condition => this.buildNestedCondition(condition)).filter(Boolean);

        switch (operator) {
            case FilterOp.AND:
                if (clauses.length === 0) {
                    return '1=1'; // Empty AND = always true
                }
                return `(${clauses.join(' AND ')})`;

            case FilterOp.OR:
                if (clauses.length === 0) {
                    return '1=0'; // Empty OR = always false
                }
                return `(${clauses.join(' OR ')})`;

            case FilterOp.NOT:
                if (clauses.length === 0) {
                    return '1=0'; // Empty NOT = always false
                }
                return `NOT (${clauses.join(' AND ')})`;

            case FilterOp.NAND:
                if (clauses.length === 0) {
                    return '1=1'; // Empty NAND = always true
                }
                return `NOT (${clauses.join(' AND ')})`;

            case FilterOp.NOR:
                if (clauses.length === 0) {
                    return '1=1'; // Empty NOR = always true
                }
                return `NOT (${clauses.join(' OR ')})`;

            default:
                return null;
        }
    }

    /**
     * Build nested condition for logical operators
     * Recursively processes nested filter conditions
     */
    private buildNestedCondition(condition: any): string | null {
        if (!condition || typeof condition !== 'object') {
            return null;
        }

        // Create a temporary FilterWhere instance for the nested condition
        const nestedFilter = new FilterWhere(this._paramIndex);
        nestedFilter.parseWhereData(condition);
        
        // Build the nested conditions
        const nestedConditions = nestedFilter._conditions
            .map(cond => nestedFilter.buildSQLCondition(cond))
            .filter(Boolean);

        // Update our parameter index to account for nested parameters
        this._paramIndex = nestedFilter._paramIndex;
        this._paramValues.push(...nestedFilter._paramValues);

        // Return combined nested conditions
        if (nestedConditions.length === 0) {
            return null;
        }
        if (nestedConditions.length === 1) {
            return nestedConditions[0];
        }
        return `(${nestedConditions.join(' AND ')})`;
    }
}