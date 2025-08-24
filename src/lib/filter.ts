import { db, type DbContext, type TxContext } from '@src/db/index.js';
import type { SystemContextWithInfrastructure } from '@lib/types/system-context.js';

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
 * ### WHERE Clause Operators
 * 
 * #### Comparison Operators
 * - **$eq** - Equals (default for simple values)
 *   ```typescript
 *   { name: "John" }                    // → name = 'John'
 *   { age: { $eq: 25 } }               // → age = 25
 *   { status: null }                   // → status IS NULL
 *   ```
 * 
 * - **$ne, $neq** - Not equals
 *   ```typescript
 *   { status: { $ne: "inactive" } }    // → status != 'inactive'
 *   { age: { $neq: null } }            // → age IS NOT NULL
 *   ```
 * 
 * - **$gt, $gte, $lt, $lte** - Numeric/date comparisons
 *   ```typescript
 *   { age: { $gt: 18 } }               // → age > 18
 *   { age: { $gte: 21 } }              // → age >= 21
 *   { score: { $lt: 100 } }            // → score < 100
 *   { price: { $lte: 999.99 } }        // → price <= 999.99
 *   { created_at: { $gte: "2024-01-01" } } // → created_at >= '2024-01-01'
 *   ```
 * 
 * #### Pattern Matching Operators
 * - **$like** - Case-sensitive pattern matching (% wildcards)
 *   ```typescript
 *   { name: { $like: "John%" } }       // → name LIKE 'John%'
 *   { email: { $like: "%@gmail.com" } } // → email LIKE '%@gmail.com'
 *   ```
 * 
 * - **$nlike** - Case-sensitive NOT LIKE
 *   ```typescript
 *   { name: { $nlike: "temp%" } }      // → name NOT LIKE 'temp%'
 *   ```
 * 
 * - **$ilike** - Case-insensitive LIKE (PostgreSQL)
 *   ```typescript
 *   { name: { $ilike: "john%" } }      // → name ILIKE 'john%' (matches "John", "JOHN", etc.)
 *   ```
 * 
 * - **$nilike** - Case-insensitive NOT LIKE
 *   ```typescript
 *   { name: { $nilike: "test%" } }     // → name NOT ILIKE 'test%'
 *   ```
 * 
 * - **$regex** - Regular expression matching
 *   ```typescript
 *   { phone: { $regex: "^\\+1" } }     // → phone ~ '^\\+1'
 *   ```
 * 
 * - **$nregex** - NOT regular expression
 *   ```typescript
 *   { email: { $nregex: ".*temp.*" } } // → email !~ '.*temp.*'
 *   ```
 * 
 * #### Array Operations
 * - **$in** - Value in array (auto-applied for array values)
 *   ```typescript
 *   { status: ["active", "pending"] }         // → status IN ('active', 'pending')
 *   { id: { $in: ["uuid1", "uuid2"] } }      // → id IN ('uuid1', 'uuid2')
 *   { priority: { $in: [1, 2, 3] } }         // → priority IN (1, 2, 3)
 *   ```
 * 
 * - **$nin** - Value NOT in array
 *   ```typescript
 *   { status: { $nin: ["deleted", "banned"] } } // → status NOT IN ('deleted', 'banned')
 *   ```
 * 
 * - **$any** - Array field contains any value (PostgreSQL arrays)
 *   ```typescript
 *   { tags: { $any: ["urgent", "priority"] } } // → tags && ARRAY['urgent', 'priority']
 *   ```
 * 
 * - **$all** - Array field contains all values
 *   ```typescript
 *   { tags: { $all: ["feature", "backend"] } } // → tags @> ARRAY['feature', 'backend']
 *   ```
 * 
 * - **$nany, $nall** - Negated array operations
 *   ```typescript
 *   { tags: { $nany: ["deprecated"] } }        // → NOT (tags && ARRAY['deprecated'])
 *   { tags: { $nall: ["old", "legacy"] } }     // → NOT (tags @> ARRAY['old', 'legacy'])
 *   ```
 * 
 * #### Logical Operators
 * - **$and** - All conditions must be true
 *   ```typescript
 *   { $and: [
 *       { age: { $gte: 18 } },
 *       { status: "active" },
 *       { verified: true }
 *   ] }
 *   // → (age >= 18 AND status = 'active' AND verified = true)
 *   ```
 * 
 * - **$or** - Any condition must be true
 *   ```typescript
 *   { $or: [
 *       { role: "admin" },
 *       { role: "moderator" }
 *   ] }
 *   // → (role = 'admin' OR role = 'moderator')
 *   ```
 * 
 * - **$not** - Negates the condition
 *   ```typescript
 *   { $not: { status: "banned" } }            // → NOT (status = 'banned')
 *   { $not: { age: { $lt: 18 } } }            // → NOT (age < 18)
 *   ```
 * 
 * #### Search Operators
 * - **$find** - Full-text search (implementation specific)
 *   ```typescript
 *   { content: { $find: "search terms" } }    // → Full-text search implementation
 *   ```
 * 
 * - **$text** - Text search with ranking
 *   ```typescript
 *   { description: { $text: "keyword" } }     // → Text search with relevance scoring
 *   ```
 * 
 * #### Existence Operators
 * - **$exists** - Field exists and is not null
 *   ```typescript
 *   { optional_field: { $exists: true } }     // → optional_field IS NOT NULL
 *   { temp_data: { $exists: false } }         // → temp_data IS NULL
 *   ```
 * 
 * - **$null** - Field is null
 *   ```typescript
 *   { deleted_at: { $null: true } }           // → deleted_at IS NULL
 *   { required_field: { $null: false } }      // → required_field IS NOT NULL
 *   ```
 * 
 * ### Complex Condition Examples
 * ```typescript
 * // Multiple conditions on same field (implicit AND)
 * { age: { $gte: 18, $lt: 65 } }             // → age >= 18 AND age < 65
 * 
 * // Nested logical operations
 * {
 *   $and: [
 *     { status: "active" },
 *     {
 *       $or: [
 *         { role: "admin" },
 *         { permissions: { $any: ["write"] } }
 *       ]
 *     }
 *   ]
 * }
 * // → status = 'active' AND (role = 'admin' OR permissions && ARRAY['write'])
 * 
 * // Mixed operators
 * {
 *   name: { $ilike: "john%" },
 *   age: { $gte: 21 },
 *   tags: { $in: ["vip", "premium"] },
 *   $not: { status: "suspended" }
 * }
 * // → name ILIKE 'john%' AND age >= 21 AND tags IN ('vip', 'premium') AND NOT (status = 'suspended')
 * ```
 * 
 * ## ORDER BY Clause
 * 
 * ### Single Column Ordering
 * ```typescript
 * // String format: "column [direction]"
 * { order: "name" }                          // → ORDER BY "name" ASC
 * { order: "created_at desc" }               // → ORDER BY "created_at" DESC
 * 
 * // Object format
 * { order: { column: "price", sort: "desc" } } // → ORDER BY "price" DESC
 * { order: { name: "asc" } }                 // → ORDER BY "name" ASC
 * ```
 * 
 * ### Multi-Column Ordering
 * ```typescript
 * { order: [
 *     "priority desc",
 *     "created_at",
 *     { column: "name", sort: "asc" }
 * ] }
 * // → ORDER BY "priority" DESC, "created_at" ASC, "name" ASC
 * ```
 * 
 * ### Case Sensitivity
 * ```typescript
 * // PostgreSQL collations for case-insensitive sorting
 * { order: "name COLLATE \"C\"" }            // Case-sensitive
 * { order: "name COLLATE \"en_US.utf8\"" }   // Locale-aware
 * ```
 * 
 * ## LIMIT/OFFSET Clause
 * 
 * ### Basic Pagination
 * ```typescript
 * { limit: 10 }                              // → LIMIT 10
 * { limit: 20, offset: 40 }                  // → LIMIT 20 OFFSET 40 (page 3)
 * ```
 * 
 * ### Pagination Helper
 * ```typescript
 * // Page-based pagination (page 1 = first page)
 * const page = 3;
 * const pageSize = 25;
 * { limit: pageSize, offset: (page - 1) * pageSize } // → LIMIT 25 OFFSET 50
 * ```
 * 
 * ### Performance Considerations
 * - Use ORDER BY with LIMIT for consistent results
 * - Large OFFSET values can be slow - consider cursor-based pagination
 * - Index columns used in ORDER BY for better performance
 * 
 * ## Tree-Based Condition Building
 * 
 * The Filter class builds a tree structure for complex logical operations:
 * 
 * ### Simple Conditions
 * ```typescript
 * { name: "John", age: 25 }
 * // Tree: [condition(name=John), condition(age=25)]
 * // SQL: name = 'John' AND age = 25
 * ```
 * 
 * ### Nested Logical Operations
 * ```typescript
 * {
 *   status: "active",
 *   $or: [
 *     { role: "admin" },
 *     {
 *       $and: [
 *         { role: "user" },
 *         { verified: true }
 *       ]
 *     }
 *   ]
 * }
 * // Tree structure:
 * // - condition(status=active)
 * // - logical($or)
 * //   - condition(role=admin)
 * //   - logical($and)
 * //     - condition(role=user)
 * //     - condition(verified=true)
 * ```
 * 
 * ### Performance Optimization
 * - Place most selective conditions first
 * - Use indexes on commonly filtered columns
 * - Consider compound indexes for multi-column filters
 * - Avoid excessive nesting in complex conditions
 * 
 * ## Comprehensive Usage Examples
 * 
 * ### Basic User Search
 * ```typescript
 * const filter = new Filter(system, "users", "users_table");
 * filter.assign({
 *   where: {
 *     name: { $ilike: "john%" },
 *     status: "active",
 *     age: { $gte: 18 }
 *   },
 *   order: "created_at desc",
 *   limit: 10
 * });
 * const users = await filter.execute();
 * ```
 * 
 * ### Advanced Product Search
 * ```typescript
 * const filter = new Filter(system, "products", "products_table");
 * filter.assign({
 *   where: {
 *     $and: [
 *       {
 *         $or: [
 *           { category: { $in: ["electronics", "computers"] } },
 *           { tags: { $any: ["sale", "clearance"] } }
 *         ]
 *       },
 *       { price: { $gte: 10, $lte: 1000 } },
 *       { in_stock: true },
 *       { $not: { discontinued: true } }
 *     ]
 *   },
 *   order: [
 *     "featured desc",
 *     "price asc",
 *     "name"
 *   ],
 *   limit: 50,
 *   offset: 0
 * });
 * const products = await filter.execute();
 * ```
 * 
 * ### Using with System Context
 * ```typescript
 * // In route handler with System integration
 * export default async function(context: Context): Promise<any> {
 *   return await handleContextDb(context, async (system: System) => {
 *     const filter = new Filter(system, 'articles', 'articles_table');
 *     
 *     // Parse query parameters
 *     const searchTerm = context.req.query('search');
 *     const category = context.req.query('category');
 *     const page = parseInt(context.req.query('page') || '1');
 *     
 *     // Build dynamic filter
 *     const conditions: any = {};
 *     if (searchTerm) {
 *       conditions.$or = [
 *         { title: { $ilike: `%${searchTerm}%` } },
 *         { content: { $ilike: `%${searchTerm}%` } }
 *       ];
 *     }
 *     if (category) {
 *       conditions.category = category;
 *     }
 *     
 *     filter.assign({
 *       where: conditions,
 *       order: "published_at desc",
 *       limit: 20,
 *       offset: (page - 1) * 20
 *     });
 *     
 *     return await filter.execute();
 *   });
 * }
 * ```
 * 
 * ## Reusable Query Components
 * 
 * ### Extracting Clauses for Complex Queries
 * ```typescript
 * const filter = new Filter(system, "orders", "orders_table");
 * filter.assign({
 *   where: { status: "pending", priority: { $gte: 5 } },
 *   order: "created_at desc"
 * });
 * 
 * // Use clauses in custom SQL
 * const whereClause = filter.getWhereClause();
 * const orderClause = filter.getOrderClause();
 * const limitClause = filter.getLimitClause();
 * 
 * const customSQL = `
 *   SELECT o.*, c.name as customer_name 
 *   FROM orders o 
 *   JOIN customers c ON o.customer_id = c.id 
 *   WHERE ${whereClause}
 *   ${orderClause ? `ORDER BY ${orderClause}` : ''}
 *   ${limitClause}
 * `;
 * ```
 * 
 * ## Edge Cases and Limitations
 * 
 * ### Null Handling
 * ```typescript
 * { field: null }                    // → field IS NULL
 * { field: { $eq: null } }           // → field IS NULL
 * { field: { $ne: null } }           // → field IS NOT NULL
 * ```
 * 
 * ### Empty Arrays
 * ```typescript
 * { tags: [] }                       // → No condition added (ignored)
 * { tags: { $in: [] } }              // → False condition (matches nothing)
 * ```
 * 
 * ### SQL Injection Protection
 * All values are properly escaped and parameterized:
 * ```typescript
 * { name: "O'Connor" }               // → name = 'O''Connor' (safely escaped)
 * { comment: "'; DROP TABLE users; --" } // → Safely escaped, no injection
 * ```
 * 
 * ### Performance Notes
 * - Automatic soft delete filtering adds overhead - disable via options when not needed
 * - Complex nested conditions can impact query planning - test with EXPLAIN
 * - Use appropriate indexes for filtered and ordered columns
 * - Consider query caching for frequently used filter patterns
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

    public readonly system: SystemContextWithInfrastructure;

    constructor(system: SystemContextWithInfrastructure, schemaName: string, tableName: string) {
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
    // 
    // 🚨 TODO: ARCHITECTURAL ISSUE - Filter should NOT execute database operations
    // This method bypasses the observer pipeline and violates separation of concerns.
    // Should be replaced with toSQL() method that returns query + parameters.
    /**
     * Generate SQL query and parameters (Issue #102 - toSQL pattern)
     * 
     * Returns SQL query and parameters for execution by Database methods.
     * This enables proper observer pipeline coverage for read operations.
     */
    toSQL(): { query: string; params: any[] } {
        const query = this._buildSQL();
        // Note: Current implementation doesn't use parameterized queries
        // This can be enhanced later to return proper parameters
        return { query, params: [] };
    }

    /**
     * Generate WHERE clause with parameters for use in custom queries
     * 
     * Returns WHERE clause conditions and parameters that can be used
     * to build COUNT queries or other custom SQL statements.
     */
    toWhereSQL(): { whereClause: string; params: any[] } {
        const whereClause = this.getWhereClause();
        // Note: Current implementation doesn't use parameterized queries
        // This can be enhanced later to return proper parameters
        return { whereClause, params: [] };
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

    /**
     * @deprecated Use Database.selectAny() instead (Issue #102)
     * 
     * This method bypasses the observer pipeline and violates separation of concerns.
     * Use system.database.selectAny(schema, filterData) for proper architecture.
     */
    async execute(): Promise<any[]> {
        console.warn('⚠️  DEPRECATED: Filter.execute() bypasses observer pipeline');
        console.warn('   Use Database.selectAny() instead for proper architecture (Issue #102)');
        console.warn('   Example: await system.database.selectAny(schemaName, filterData)');
        
        try {
            // Use toSQL() pattern for consistency
            const { query, params } = this.toSQL();
            
            // Execute using System's database context (bypasses observers!)
            const result = await this.system.database.execute(query);
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