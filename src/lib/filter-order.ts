/**
 * FilterOrder - Schema-independent ORDER BY clause generation
 * 
 * Extracted from Filter class to enable ORDER BY clause generation without
 * requiring full schema setup. Provides consistent ordering syntax for
 * any SQL operation that needs sorting.
 * 
 * Key benefits:
 * - Schema independence: No schema name or table name required
 * - Consistent syntax: Same order object format as Filter class
 * - Composable: Can be combined with any SQL operation
 * - Validation: Prevents SQL injection in column names and sort directions
 */

export type SortDirection = 'asc' | 'desc' | 'ASC' | 'DESC';

export interface FilterOrderInfo {
    column: string;
    sort: SortDirection;
}

export class FilterOrder {
    private _orderInfo: FilterOrderInfo[] = [];

    constructor() {}

    /**
     * Static method for quick ORDER BY clause generation
     */
    static generate(orderData: any): string {
        const filterOrder = new FilterOrder();
        return filterOrder.build(orderData);
    }

    /**
     * Build ORDER BY clause from order data
     */
    build(orderData: any): string {
        this._orderInfo = [];

        // Parse order data into FilterOrderInfo
        this.parseOrderData(orderData);

        // Build ORDER BY clause
        return this.buildOrderClause();
    }

    /**
     * Parse various order data formats
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
            orderData.forEach(item => {
                if (typeof item === 'string') {
                    this.parseOrderString(item);
                } else if (item.column && item.sort) {
                    this._orderInfo.push({
                        column: this.sanitizeColumnName(item.column),
                        sort: this.normalizeSortDirection(item.sort)
                    });
                }
            });
        } else if (typeof orderData === 'object') {
            // Handle object format: { name: 'asc', created_at: 'desc' }
            for (const [column, sort] of Object.entries(orderData)) {
                this._orderInfo.push({
                    column: this.sanitizeColumnName(column),
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

        if (column) {
            this._orderInfo.push({
                column: this.sanitizeColumnName(column),
                sort: this.normalizeSortDirection(sort)
            });
        }
    }

    /**
     * Build ORDER BY clause string
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
     * Sanitize column name to prevent injection
     */
    private sanitizeColumnName(column: string): string {
        // Remove any non-alphanumeric characters except underscore
        return column.replace(/[^a-zA-Z0-9_]/g, '');
    }

    /**
     * Normalize sort direction to valid SQL
     */
    private normalizeSortDirection(sort: string): SortDirection {
        const normalized = sort.toLowerCase();
        return (normalized === 'desc' || normalized === 'descending') ? 'desc' : 'asc';
    }
}