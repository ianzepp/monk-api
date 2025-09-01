import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';
import { FilterOp, type FilterWhereInfo, type FilterWhereOptions } from '@src/lib/filter-types.js';

/**
 * FilterWhere - Schema-independent WHERE clause generation
 *
 * The authoritative implementation for WHERE clause logic including validation,
 * parameter management, and SQL generation. Extracted from Filter class to enable
 * reusable filtering logic across the application.
 *
 * Features: Parameter offsetting, SQL injection protection, soft delete handling,
 * comprehensive validation of filter operators and data types.
 *
 * Quick Examples:
 * - Simple: `FilterWhere.generate({ name: 'John', age: 25 })`
 * - Offset: `FilterWhere.generate({ id: 'record-123' }, 2)` → uses $3, $4, etc.
 * - Options: `FilterWhere.generate(filter, 0, { includeTrashed: true })`
 *
 * See docs/FILTER.md for complete operator reference and examples.
 */

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
     * Static method for quick WHERE clause generation with validation
     * This is the authoritative entry point for all WHERE clause generation
     */
    static generate(whereData: any, startingParamIndex: number = 0, options: FilterWhereOptions = {}): { whereClause: string; params: any[] } {
        try {
            // Validate the WHERE data before processing
            FilterWhere.validateWhereData(whereData);
            
            const filterWhere = new FilterWhere(startingParamIndex);
            return filterWhere.build(whereData, options);
        } catch (error) {
            logger.warn('FilterWhere validation failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Public validation method for external use
     * Allows other classes to validate WHERE data without generating SQL
     */
    static validate(whereData: any): void {
        FilterWhere.validateWhereData(whereData);
    }

    /**
     * Validate WHERE data structure and operator requirements
     * Centralized validation logic where operator implementation lives
     */
    static validateWhereData(whereData: any): void {
        if (!whereData) {
            return; // Empty conditions are valid
        }

        if (typeof whereData === 'string') {
            if (!whereData.trim()) {
                throw HttpErrors.badRequest('WHERE condition string cannot be empty', 'FILTER_EMPTY_WHERE_STRING');
            }
            return; // String conditions are valid
        }

        if (typeof whereData !== 'object' || whereData === null) {
            throw HttpErrors.badRequest('WHERE conditions must be object or string', 'FILTER_INVALID_WHERE_TYPE');
        }

        // Validate object structure recursively
        FilterWhere.validateWhereObject(whereData);
    }

    /**
     * Validate WHERE object structure recursively
     */
    private static validateWhereObject(conditions: any): void {
        for (const [key, value] of Object.entries(conditions)) {
            if (key.startsWith('$')) {
                // Validate logical operators
                FilterWhere.validateLogicalOperator(key as FilterOp, value);
            } else {
                // Validate field conditions
                FilterWhere.validateFieldCondition(key, value);
            }
        }
    }

    /**
     * Validate logical operator structure
     */
    private static validateLogicalOperator(operator: FilterOp, value: any): void {
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
                FilterWhere.validateWhereObject(condition);
            });
        } else if (operator === FilterOp.NOT) {
            if (typeof value !== 'object' || value === null) {
                throw HttpErrors.badRequest('$not operator requires an object condition', 'FILTER_INVALID_NOT_CONDITION');
            }
            FilterWhere.validateWhereObject(value);
        } else if (Object.values(FilterOp).includes(operator)) {
            // Valid operator, will be handled in field validation
        } else {
            throw HttpErrors.badRequest(`Unsupported logical operator: ${operator}`, 'FILTER_UNSUPPORTED_LOGICAL_OPERATOR');
        }
    }

    /**
     * Validate field condition structure
     */
    private static validateFieldCondition(fieldName: string, fieldValue: any): void {
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
                FilterWhere.validateOperatorData(op as FilterOp, data);
            }
        }
        // Array and simple values are handled in processing
    }

    /**
     * Validate operator-specific data requirements
     */
    private static validateOperatorData(operator: FilterOp, data: any): void {
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
                    data: null,
                });
            } else if (Array.isArray(value)) {
                // Handle arrays as IN operations
                this._conditions.push({
                    column: key,
                    operator: FilterOp.IN,
                    data: value,
                });
            } else if (typeof value === 'object' && value !== null) {
                // Handle operator objects: { $gt: 10, $lt: 100 }
                for (const [op, data] of Object.entries(value)) {
                    if (Object.values(FilterOp).includes(op as FilterOp)) {
                        this._conditions.push({
                            column: key,
                            operator: op as FilterOp,
                            data,
                        });
                    }
                }
            } else {
                // Handle direct equality
                this._conditions.push({
                    column: key,
                    operator: FilterOp.EQ,
                    data: value,
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
        // Normalize $not operator to accept both object and array formats for better usability
        // This allows intuitive single-condition syntax: {"$not": {"field": "value"}}
        // instead of requiring array wrapper: {"$not": [{"field": "value"}]}
        // Other logical operators ($and, $or) naturally require arrays for multiple conditions
        if (operator === FilterOp.NOT && !Array.isArray(data) && typeof data === 'object' && data !== null) {
            data = [data]; // Convert object to single-item array for consistent processing
        }
        
        if (!Array.isArray(data)) {
            throw new Error(`Logical operator ${operator} requires array of conditions`);
        }

        // Create a special condition that represents the logical operation
        this._conditions.push({
            column: '', // No specific column for logical operators
            operator,
            data: data, // Array of nested conditions
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
        const parsedConditions = this._conditions.map(condition => this.buildSQLCondition(condition)).filter(Boolean);

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
                logger.warn('Unsupported filter operator', { operator });
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
        const nestedConditions = nestedFilter._conditions.map(cond => nestedFilter.buildSQLCondition(cond)).filter(Boolean);

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