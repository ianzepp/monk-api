import { type SortDirection, type FilterOrderInfo } from '@src/lib/filter-types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';

/**
 * FilterOrder - Schema-independent ORDER BY clause generation
 * 
 * The authoritative implementation for ORDER BY clause logic including validation,
 * sanitization, and SQL generation. Matches FilterWhere design patterns for
 * consistency and security.
 * 
 * Features: Comprehensive validation, SQL injection protection, multiple input formats,
 * proper error handling and logging.
 * 
 * Quick Examples:
 * - String: `FilterOrder.generate('created_at desc')`
 * - Array: `FilterOrder.generate([{ column: 'priority', sort: 'desc' }])`
 * - Object: `FilterOrder.generate({ created_at: 'desc', name: 'asc' })`
 * 
 * See docs/FILTER.md for complete examples and security features.
 */

export class FilterOrder {
    private _orderInfo: FilterOrderInfo[] = [];

    constructor() {}

    /**
     * Static method for quick ORDER BY clause generation with validation
     * This is the authoritative entry point for all ORDER BY clause generation
     */
    static generate(orderData: any): string {
        try {
            // Validate the ORDER data before processing
            FilterOrder.validateOrderData(orderData);
            
            const filterOrder = new FilterOrder();
            return filterOrder.build(orderData);
        } catch (error) {
            logger.warn('FilterOrder validation failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Public validation method for external use
     * Allows other classes to validate ORDER data without generating SQL
     */
    static validate(orderData: any): void {
        FilterOrder.validateOrderData(orderData);
    }

    /**
     * Validate ORDER data structure and requirements
     * Centralized validation logic where order implementation lives
     */
    static validateOrderData(orderData: any): void {
        if (!orderData) {
            return; // Empty order data is valid
        }

        if (Array.isArray(orderData)) {
            orderData.forEach((spec: any, index: number) => {
                try {
                    FilterOrder.validateOrderSpec(spec);
                } catch (error) {
                    throw HttpErrors.badRequest(`Invalid order specification at index ${index}: ${error instanceof Error ? error.message : String(error)}`, 'FILTER_INVALID_ORDER_SPEC');
                }
            });
        } else {
            FilterOrder.validateOrderSpec(orderData);
        }
    }

    /**
     * Validate individual order specification
     */
    private static validateOrderSpec(spec: any): void {
        if (typeof spec === 'string') {
            FilterOrder.validateOrderString(spec);
        } else if (typeof spec === 'object' && spec !== null) {
            if (spec.column && spec.sort) {
                // Explicit format: { "column": "name", "sort": "asc" }
                FilterOrder.validateColumnName(spec.column);
                FilterOrder.validateSortDirection(spec.sort);
            } else {
                // Key-value format: { "name": "asc" } or { "name": "asc", "created_at": "desc" }
                const entries = Object.entries(spec);
                if (entries.length === 0) {
                    throw HttpErrors.badRequest('Order object cannot be empty', 'FILTER_EMPTY_ORDER_OBJECT');
                }
                
                for (const [column, sort] of entries) {
                    FilterOrder.validateColumnName(column);
                    FilterOrder.validateSortDirection(sort as string);
                }
            }
        } else {
            throw HttpErrors.badRequest('Order specification must be string or object', 'FILTER_INVALID_ORDER_TYPE');
        }
    }

    /**
     * Validate order string format
     */
    private static validateOrderString(orderString: string): void {
        if (!orderString || typeof orderString !== 'string') {
            throw HttpErrors.badRequest('Order string must be a non-empty string', 'FILTER_INVALID_ORDER_STRING');
        }

        const parts = orderString.trim().split(/\s+/);
        const column = parts[0];
        const sort = parts[1];
        
        if (!column) {
            throw HttpErrors.badRequest('Order string must contain a column name', 'FILTER_MISSING_ORDER_COLUMN');
        }
        
        FilterOrder.validateColumnName(column);
        
        if (sort) {
            FilterOrder.validateSortDirection(sort);
        }
    }

    /**
     * Validate column name with proper SQL injection protection
     */
    private static validateColumnName(column: any): void {
        if (!column || typeof column !== 'string') {
            throw HttpErrors.badRequest('Column name must be a non-empty string', 'FILTER_INVALID_ORDER_COLUMN_NAME');
        }

        // Enhanced SQL injection protection for column names (matches FilterWhere)
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
            throw HttpErrors.badRequest(`Invalid column name format: ${column}`, 'FILTER_INVALID_ORDER_COLUMN_FORMAT');
        }
    }

    /**
     * Validate sort direction
     */
    private static validateSortDirection(sort: any): void {
        if (!sort || typeof sort !== 'string') {
            throw HttpErrors.badRequest('Sort direction must be a non-empty string', 'FILTER_INVALID_SORT_DIRECTION_TYPE');
        }

        const normalized = sort.toLowerCase();
        if (!['asc', 'desc', 'ascending', 'descending'].includes(normalized)) {
            throw HttpErrors.badRequest(`Invalid sort direction: ${sort}. Must be 'asc', 'desc', 'ascending', or 'descending'`, 'FILTER_INVALID_SORT_DIRECTION');
        }
    }

    /**
     * Build ORDER BY clause from order data
     */
    build(orderData: any): string {
        try {
            this._orderInfo = [];

            // Parse order data into FilterOrderInfo
            this.parseOrderData(orderData);

            // Build ORDER BY clause
            return this.buildOrderClause();
        } catch (error) {
            logger.warn('FilterOrder build failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Parse various order data formats with validation
     */
    private parseOrderData(orderData: any): void {
        if (!orderData) {
            return;
        }

        if (typeof orderData === 'string') {
            // Handle string format: "name asc" or "created_at desc"
            this.parseOrderString(orderData);
        } else if (Array.isArray(orderData)) {
            // Handle array format: [{ column: 'name', sort: 'asc' }]
            orderData.forEach((item, index) => {
                if (!item) {
                    throw HttpErrors.badRequest(`Order item at index ${index} cannot be null or undefined`, 'FILTER_NULL_ORDER_ITEM');
                }
                
                if (typeof item === 'string') {
                    this.parseOrderString(item);
                } else if (typeof item === 'object' && item.column && item.sort) {
                    // Already validated, now process
                    this._orderInfo.push({
                        column: item.column, // No need to sanitize, already validated
                        sort: this.normalizeSortDirection(item.sort)
                    });
                } else {
                    throw HttpErrors.badRequest(`Invalid order item at index ${index}`, 'FILTER_INVALID_ORDER_ITEM');
                }
            });
        } else if (typeof orderData === 'object') {
            // Handle object format: { name: 'asc', created_at: 'desc' }
            for (const [column, sort] of Object.entries(orderData)) {
                // Already validated, now process
                this._orderInfo.push({
                    column, // No need to sanitize, already validated
                    sort: this.normalizeSortDirection(sort as string)
                });
            }
        }
    }

    /**
     * Parse order string: "column direction"
     */
    private parseOrderString(orderString: string): void {
        const parts = orderString.trim().split(/\s+/);
        const column = parts[0];
        const sort = parts[1] || 'asc';

        // Column and sort are already validated by validateOrderString
        this._orderInfo.push({
            column, // No need to sanitize, already validated
            sort: this.normalizeSortDirection(sort)
        });
    }

    /**
     * Build ORDER BY clause string with proper escaping
     */
    private buildOrderClause(): string {
        if (this._orderInfo.length === 0) {
            return '';
        }

        const orderClauses = this._orderInfo.map(orderInfo => {
            const { column, sort } = orderInfo;
            return `"${column}" ${sort.toUpperCase()}`;
        });

        return `ORDER BY ${orderClauses.join(', ')}`;
    }

    /**
     * Normalize sort direction to valid SQL - now with proper typing
     */
    private normalizeSortDirection(sort: string): 'asc' | 'desc' {
        const normalized = sort.toLowerCase();
        return (normalized === 'desc' || normalized === 'descending') ? 'desc' : 'asc';
    }
}