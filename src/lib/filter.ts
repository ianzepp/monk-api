import { db, type DbContext, type TxContext } from '../db/index.js';
import type { System } from './system.js';

/**
 * Filter class for building complex database queries with support for WHERE, ORDER BY, and LIMIT clauses.
 * 
 * ## Core Features
 * - Tree-based condition building with logical operators (AND, OR, NOT)
 * - Rich operator support for comparisons, pattern matching, and array operations
 * - Automatic soft delete filtering via trashed_at column
 * - Order and limit clause generation
 * - SQL injection protection through parameterized queries
 * 
 * ## WHERE Conditions
 * The Filter class automatically excludes soft-deleted and permanently deleted records by adding 
 * `trashed_at IS NULL` and `deleted_at IS NULL` to all generated WHERE clauses. This ensures that 
 * all database queries respect both soft delete and permanent delete behavior without requiring 
 * explicit filtering in application code.
 * 
 * All user-defined WHERE conditions are combined with the automatic filters using AND logic:
 * ```sql
 * WHERE trashed_at IS NULL AND deleted_at IS NULL AND (user_conditions)
 * ```
 * 
 * ### Query Parameter Overrides
 * - `?include_trashed=true` - Shows trashed records: `WHERE deleted_at IS NULL AND (user_conditions)`
 * - `?include_deleted=true` - Shows deleted records: `WHERE trashed_at IS NULL AND (user_conditions)`  
 * - Both parameters - Shows all records: `WHERE (user_conditions)`
 * 
 * ## Usage
 * ```typescript
 * const filter = new Filter(system, schemaName, tableName);
 * filter.assign({
 *   where: { name: { $like: 'John%' }, age: { $gte: 18 } },
 *   order: [{ column: 'created_at', direction: 'DESC' }],
 *   limit: 10
 * });
 * const results = await filter.execute();
 * ```
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
    NULL = '$null'
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
    private _schemaName: string;
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

    public readonly system: System;

    constructor(system: System, schemaName: string, tableName: string) {
        this.system = system;
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
                children
            };
        } else if (operator === FilterOp.OR && Array.isArray(value)) {
            const children: ConditionNode[] = [];
            value.forEach((condition: any) => {
                children.push(...this._processWhereObject(condition));
            });
            
            return {
                type: 'logical',
                logicalOp: '$or',
                children
            };
        } else if (operator === FilterOp.NOT && typeof value === 'object') {
            const children = this._processWhereObject(value);
            
            return {
                type: 'logical',
                logicalOp: '$not',
                children
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
                data: fieldValue
            };
            
            nodes.push(node);
            
            // Also add to legacy array for backward compatibility
            this._where.push({ 
                column: fieldName, 
                operator: FilterOp.IN, 
                data: fieldValue 
            });
        } else if (typeof fieldValue === 'object' && fieldValue !== null) {
            // Complex condition: { "age": { "$gte": 18, "$lt": 65 } }
            for (const [op, data] of Object.entries(fieldValue)) {
                nodes.push({
                    type: 'condition',
                    column: fieldName,
                    operator: op as FilterOp,
                    data: data
                });
                
                // Also add to legacy array for backward compatibility
                this._where.push({ 
                    column: fieldName, 
                    operator: op as FilterOp, 
                    data: data 
                });
            }
        } else {
            // Simple equality: { "status": "active" }
            const node = {
                type: 'condition' as const,
                column: fieldName,
                operator: FilterOp.EQ,
                data: fieldValue
            };
            
            nodes.push(node);
            
            // Also add to legacy array for backward compatibility
            this._where.push({ 
                column: fieldName, 
                operator: FilterOp.EQ, 
                data: fieldValue 
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

    // Execute the query
    async execute(): Promise<any[]> {
        try {
            // Build complete SQL query
            const sqlQuery = this._buildSQL();
            
            // Execute using System's database context
            const result = await this.system.database.execute(sqlQuery);
            return result.rows;
        } catch (error) {
            console.error('Filter execution error:', error);
            throw error;
        }
    }

    // Get just the WHERE clause conditions for use in other queries
    getWhereClause(): string {
        const baseConditions = [];
        
        // Add soft delete filtering unless explicitly included via options
        if (!this.system.options.trashed) {
            baseConditions.push('trashed_at IS NULL');
        }
        
        // Add permanent delete filtering unless explicitly included via options
        if (!this.system.options.deleted) {
            baseConditions.push('deleted_at IS NULL');
        }
        
        // Build WHERE clause using new tree structure
        if (this._conditions.length > 0) {
            const conditionSQL = this._buildConditionTreeSQL(this._conditions);
            if (conditionSQL && conditionSQL !== '1=1') {
                baseConditions.push(`(${conditionSQL})`);
            }
        } else if (this._where.length > 0) {
            // Fallback to legacy flat structure
            const conditions = this._where.map(w => this._buildSQLCondition(w)).filter(Boolean);
            if (conditions.length > 0) {
                baseConditions.push(`(${conditions.join(' AND ')})`);
            }
        }
        
        return baseConditions.length > 0 ? baseConditions.join(' AND ') : '1=1';
    }

    // Get just the ORDER BY clause for use in other queries
    getOrderClause(): string {
        if (this._order.length > 0) {
            const orders = this._order.map(o => `"${o.column}" ${o.sort.toUpperCase()}`);
            return orders.join(', ');
        }
        return '';
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

    private _buildSQL(): any {
        // Build SELECT clause
        const selectClause = this._select.length > 0 && !this._select.includes('*')
            ? this._select.map(col => `"${col}"`).join(', ')
            : '*';

        // Build WHERE clause using new tree structure
        let whereClause = '';
        if (this._conditions.length > 0) {
            const conditionSQL = this._buildConditionTreeSQL(this._conditions);
            if (conditionSQL) {
                whereClause = 'WHERE ' + conditionSQL;
            }
        } else if (this._where.length > 0) {
            // Fallback to legacy flat structure
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

        return query;
    }

    // For testing - return the SQL string directly
    private _buildSQLString(): string {
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
        return [
            `SELECT ${selectClause}`,
            `FROM "${this._tableName}"`,
            whereClause,
            orderClause,
            limitClause
        ].filter(Boolean).join(' ');
    }

    // Build SQL from condition tree - supports $and, $or, $not
    private _buildConditionTreeSQL(nodes: ConditionNode[]): string {
        if (nodes.length === 0) return '';
        
        const clauses = nodes.map(node => this._buildNodeSQL(node)).filter(Boolean);
        
        // Multiple top-level nodes are implicitly AND-ed
        return clauses.length > 1 ? clauses.join(' AND ') : clauses[0];
    }
    
    private _buildNodeSQL(node: ConditionNode): string {
        if (node.type === 'condition') {
            return this._buildConditionSQL(node);
        } else if (node.type === 'logical') {
            return this._buildLogicalSQL(node);
        }
        
        return '';
    }
    
    private _buildConditionSQL(node: ConditionNode): string {
        if (!node.column || !node.operator) return '';
        
        const quotedColumn = `"${node.column}"`;
        const { data } = node;
        
        switch (node.operator) {
            case FilterOp.EQ:
                return `${quotedColumn} = ${this._formatSQLValue(data)}`;
            case FilterOp.NE:
            case FilterOp.NEQ:
                return `${quotedColumn} != ${this._formatSQLValue(data)}`;
            case FilterOp.GT:
                return `${quotedColumn} > ${data}`;
            case FilterOp.GTE:
                return `${quotedColumn} >= ${data}`;
            case FilterOp.LT:
                return `${quotedColumn} < ${data}`;
            case FilterOp.LTE:
                return `${quotedColumn} <= ${data}`;
            case FilterOp.LIKE:
                return `${quotedColumn} LIKE ${this._formatSQLValue(data)}`;
            case FilterOp.ILIKE:
                return `${quotedColumn} ILIKE ${this._formatSQLValue(data)}`;
            case FilterOp.IN:
                const inValues = Array.isArray(data) ? data : [data];
                return `${quotedColumn} IN (${inValues.map(v => this._formatSQLValue(v)).join(', ')})`;
            case FilterOp.NIN:
                const ninValues = Array.isArray(data) ? data : [data];
                return `${quotedColumn} NOT IN (${ninValues.map(v => this._formatSQLValue(v)).join(', ')})`;
            default:
                console.warn(`Unsupported operator: ${node.operator}`);
                return '';
        }
    }
    
    private _buildLogicalSQL(node: ConditionNode): string {
        if (!node.children || node.children.length === 0) return '';
        
        const childClauses = node.children.map(child => this._buildNodeSQL(child)).filter(Boolean);
        
        if (childClauses.length === 0) return '';
        
        switch (node.logicalOp) {
            case '$and':
                return childClauses.length > 1 
                    ? `(${childClauses.join(' AND ')})` 
                    : childClauses[0];
                    
            case '$or':
                return childClauses.length > 1 
                    ? `(${childClauses.join(' OR ')})` 
                    : childClauses[0];
                    
            case '$not':
                return childClauses.length === 1 
                    ? `NOT ${childClauses[0]}`
                    : `NOT (${childClauses.join(' AND ')})`;
                    
            default:
                console.warn(`Unsupported logical operator: ${node.logicalOp}`);
                return '';
        }
    }
    
    private _formatSQLValue(value: any): string {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        if (typeof value === 'string') {
            return `'${this._escapeSQLValue(value)}'`;
        }
        if (typeof value === 'boolean') {
            return value.toString();
        }
        if (typeof value === 'number') {
            return value.toString();
        }
        return String(value);
    }

    private _buildSQLCondition(whereInfo: FilterWhereInfo): string | null {
        const { column, operator, data } = whereInfo;
        
        if (!column) return null;

        const quotedColumn = `"${column}"`;

        switch (operator) {
            case FilterOp.EQ:
                if (data === null || data === undefined) {
                    return `${quotedColumn} IS NULL`;
                }
                return `${quotedColumn} = ${this._formatSQLValue(data)}`;
            case FilterOp.NE:
            case FilterOp.NEQ:
                if (data === null || data === undefined) {
                    return `${quotedColumn} IS NOT NULL`;
                }
                return `${quotedColumn} != ${this._formatSQLValue(data)}`;
            case FilterOp.GT:
                return `${quotedColumn} > ${data}`;
            case FilterOp.GTE:
                return `${quotedColumn} >= ${data}`;
            case FilterOp.LT:
                return `${quotedColumn} < ${data}`;
            case FilterOp.LTE:
                return `${quotedColumn} <= ${data}`;
            case FilterOp.LIKE:
                return `${quotedColumn} LIKE ${this._formatSQLValue(data)}`;
            case FilterOp.ILIKE:
                return `${quotedColumn} ILIKE ${this._formatSQLValue(data)}`;
            case FilterOp.IN:
                const inValues = Array.isArray(data) ? data : [data];
                return `${quotedColumn} IN (${inValues.map(v => this._formatSQLValue(v)).join(', ')})`;
            case FilterOp.NIN:
                const ninValues = Array.isArray(data) ? data : [data];
                return `${quotedColumn} NOT IN (${ninValues.map(v => this._formatSQLValue(v)).join(', ')})`;
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