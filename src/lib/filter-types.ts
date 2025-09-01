/**
 * Shared types and enums for Filter system
 * 
 * This file contains all shared interfaces and enums used across
 * Filter, FilterWhere, and FilterOrder classes to eliminate duplication
 * and ensure consistency.
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
    ANY = '$any', // Array overlap: access_read && ARRAY[user_id, group_id]
    ALL = '$all', // Array contains: tags @> ARRAY['feature', 'backend']
    NANY = '$nany', // NOT array overlap: NOT (access_deny && ARRAY[user_id])
    NALL = '$nall', // NOT array contains: NOT (permissions @> ARRAY['admin'])
    SIZE = '$size', // Array size: array_length(tags, 1) = 3

    // Logical operators (CRITICAL for FS wildcards)
    AND = '$and', // Explicit AND: { $and: [condition1, condition2] }
    OR = '$or', // OR conditions: { $or: [{ role: 'admin' }, { role: 'mod' }] }
    NOT = '$not', // NOT condition: { $not: { status: 'banned' } }
    NAND = '$nand', // NAND operations
    NOR = '$nor', // NOR operations

    // Range operations
    BETWEEN = '$between', // Range: { age: { $between: [18, 65] } } → age BETWEEN 18 AND 65

    // Search operations
    FIND = '$find', // Full-text search: { content: { $find: 'search terms' } }
    TEXT = '$text', // Text search: { description: { $text: 'keyword' } }

    // Existence operators
    EXISTS = '$exists', // Field exists: { field: { $exists: true } } → field IS NOT NULL
    NULL = '$null', // Field is null: { field: { $null: true } } → field IS NULL
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

export type SortDirection = 'asc' | 'desc' | 'ASC' | 'DESC';

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