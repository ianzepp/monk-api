/**
 * FilterWhere - Schema-independent WHERE clause generation
 * 
 * Extracted from Filter class to enable WHERE clause generation without
 * requiring full schema setup. Provides parameterized WHERE clauses for
 * any SQL operation that needs filtering conditions.
 * 
 * Key benefits:
 * - Schema independence: No schema name or table name required
 * - Parameter numbering: Supports starting parameter index for complex queries
 * - Consistent syntax: Same filter object format as Filter class
 * - SQL injection protection: All values properly parameterized
 */

export enum FilterOp {
    EQ = '$eq',
    NE = '$ne', 
    NEQ = '$neq',
    GT = '$gt',
    GTE = '$gte',
    LT = '$lt',
    LTE = '$lte',
    LIKE = '$like',
    NLIKE = '$nlike',
    ILIKE = '$ilike',
    NILIKE = '$nilike',
    REGEX = '$regex',
    NREGEX = '$nregex',
    IN = '$in',
    NIN = '$nin'
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

        for (const [column, value] of Object.entries(whereData)) {
            if (value === null || value === undefined) {
                // Handle null values
                this._conditions.push({
                    column,
                    operator: FilterOp.EQ,
                    data: null
                });
            } else if (Array.isArray(value)) {
                // Handle arrays as IN operations
                this._conditions.push({
                    column,
                    operator: FilterOp.IN,
                    data: value
                });
            } else if (typeof value === 'object' && value !== null) {
                // Handle operator objects: { $gt: 10, $lt: 100 }
                for (const [op, data] of Object.entries(value)) {
                    if (Object.values(FilterOp).includes(op as FilterOp)) {
                        this._conditions.push({
                            column,
                            operator: op as FilterOp,
                            data
                        });
                    }
                }
            } else {
                // Handle direct equality
                this._conditions.push({
                    column,
                    operator: FilterOp.EQ,
                    data: value
                });
            }
        }
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

            default:
                console.warn('Unsupported filter operator', { operator });
                return null;
        }
    }
}