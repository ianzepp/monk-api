import { db, schema, type DbContext, type TxContext } from '../db/index.js';
import { eq, gt, gte, lt, lte, like, ilike, inArray, notInArray, and, or, not, sql } from 'drizzle-orm';

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
    NULL = '$null'
}

// Filter interfaces
export interface FilterWhereInfo {
    column?: string;
    operator: FilterOp;
    data: any;
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
    private _schemaName: string;
    private _tableName: string;
    private _query: any;
    private _select: string[] = [];
    private _where: FilterWhereInfo[] = [];
    private _order: FilterOrderInfo[] = [];
    private _limit?: number;
    private _offset?: number;
    private _lookups: any[] = [];
    private _related: any[] = [];

    constructor(schemaName: string, tableName: string, dbOrTx: DbContext | TxContext = db) {
        this._schemaName = schemaName;
        this._tableName = tableName;
        
        // For dynamic schemas, we'll build queries using raw SQL
        // since Drizzle's type system doesn't know about runtime tables
        this._query = null; // Will build SQL manually
    }

    // Main assignment method - handles multiple input formats
    assign(source?: FilterData | string | string[]): Filter {
        if (source === undefined) {
            return this;
        }

        // Array of IDs → convert to $in
        if (Array.isArray(source)) {
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
            this._processWhereObject(conditions);
        }

        this._applyWhereConditions();
        return this;
    }

    private _processWhereObject(conditions: any): void {
        for (const [key, value] of Object.entries(conditions)) {
            if (key.startsWith('$')) {
                // Logical operators
                this._processLogicalOperator(key as FilterOp, value);
            } else {
                // Field conditions
                this._processFieldCondition(key, value);
            }
        }
    }

    private _processLogicalOperator(operator: FilterOp, value: any): void {
        if (operator === FilterOp.AND && Array.isArray(value)) {
            value.forEach((condition: any) => this._processWhereObject(condition));
        } else if (operator === FilterOp.OR && Array.isArray(value)) {
            // TODO: Handle OR conditions (more complex)
            console.log('OR conditions not fully implemented yet');
        }
    }

    private _processFieldCondition(fieldName: string, fieldValue: any): void {
        if (typeof fieldValue === 'object' && fieldValue !== null) {
            // Complex condition: { "age": { "$gte": 18, "$lt": 65 } }
            for (const [op, data] of Object.entries(fieldValue)) {
                this._where.push({ 
                    column: fieldName, 
                    operator: op as FilterOp, 
                    data: data 
                });
            }
        } else {
            // Simple equality: { "status": "active" }
            this._where.push({ 
                column: fieldName, 
                operator: FilterOp.EQ, 
                data: fieldValue 
            });
        }
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

    // Execute the query
    async execute(): Promise<any[]> {
        try {
            // Build complete SQL query
            const sqlQuery = this._buildSQL();
            
            // Execute using Drizzle's raw SQL execution
            const result = await db.execute(sqlQuery);
            return result.rows;
        } catch (error) {
            console.error('Filter execution error:', error);
            throw error;
        }
    }

    private _buildSQL(): any {
        // Build SELECT clause
        const selectClause = this._select.length > 0 && !this._select.includes('*')
            ? this._select.map(col => `"${col}"`).join(', ')
            : '*';

        // Build WHERE clause
        let whereClause = '';
        if (this._where.length > 0) {
            const conditions = this._where.map(w => this._buildSQLCondition(w)).filter(Boolean);
            if (conditions.length > 0) {
                whereClause = 'WHERE ' + conditions.join(' AND ');
            }
        }

        // Build ORDER BY clause
        let orderClause = '';
        if (this._order.length > 0) {
            const orders = this._order.map(o => `"${o.column}" ${o.sort.toUpperCase()}`);
            orderClause = 'ORDER BY ' + orders.join(', ');
        }

        // Build LIMIT/OFFSET clause
        let limitClause = '';
        if (this._limit !== undefined) {
            limitClause = `LIMIT ${this._limit}`;
            if (this._offset !== undefined) {
                limitClause += ` OFFSET ${this._offset}`;
            }
        }

        // Combine all clauses
        const query = [
            `SELECT ${selectClause}`,
            `FROM "${this._tableName}"`,
            whereClause,
            orderClause,
            limitClause
        ].filter(Boolean).join(' ');

        return sql.raw(query);
    }

    private _buildSQLCondition(whereInfo: FilterWhereInfo): string | null {
        const { column, operator, data } = whereInfo;
        
        if (!column) return null;

        const quotedColumn = `"${column}"`;

        switch (operator) {
            case FilterOp.EQ:
                return `${quotedColumn} = '${this._escapeSQLValue(data)}'`;
            case FilterOp.NE:
            case FilterOp.NEQ:
                return `${quotedColumn} != '${this._escapeSQLValue(data)}'`;
            case FilterOp.GT:
                return `${quotedColumn} > ${data}`;
            case FilterOp.GTE:
                return `${quotedColumn} >= ${data}`;
            case FilterOp.LT:
                return `${quotedColumn} < ${data}`;
            case FilterOp.LTE:
                return `${quotedColumn} <= ${data}`;
            case FilterOp.LIKE:
                return `${quotedColumn} LIKE '${this._escapeSQLValue(data)}'`;
            case FilterOp.ILIKE:
                return `${quotedColumn} ILIKE '${this._escapeSQLValue(data)}'`;
            case FilterOp.IN:
                const inValues = Array.isArray(data) ? data : [data];
                return `${quotedColumn} IN (${inValues.map(v => `'${this._escapeSQLValue(v)}'`).join(', ')})`;
            case FilterOp.NIN:
                const ninValues = Array.isArray(data) ? data : [data];
                return `${quotedColumn} NOT IN (${ninValues.map(v => `'${this._escapeSQLValue(v)}'`).join(', ')})`;
            default:
                console.warn(`Unsupported operator: ${operator}`);
                return null;
        }
    }

    private _escapeSQLValue(value: any): string {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        return String(value).replace(/'/g, "''");
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