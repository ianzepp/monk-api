/**
 * E-commerce Fixture Definition
 *
 * Complex fixture with e-commerce schemas for performance and relationship testing.
 * Includes products, customers, orders, and order items with realistic relationships.
 *
 * NOTE: This fixture requires additional schema files that don't exist yet.
 * It serves as an example of how complex fixtures would be structured in future phases.
 */
import { FixtureDefinition } from '@src/lib/fixtures/types.js';
export const ecommerceFixture = {
    name: 'ecommerce',
    description: 'E-commerce scenario with products, orders, customers, and categories',
    schemas: {
        // These schema files would need to be created in a future phase
        'categories': 'spec/fixtures/schema/ecommerce/categories.yaml',
        'products': 'spec/fixtures/schema/ecommerce/products.yaml',
        'customers': 'spec/fixtures/schema/ecommerce/customers.yaml',
        'orders': 'spec/fixtures/schema/ecommerce/orders.yaml',
        'order_items': 'spec/fixtures/schema/ecommerce/order_items.yaml'
    },
    data_generators: {
        'categories': {
            generator: 'CategoryGenerator',
            count: 20,
            options: { hierarchical: true, realistic_names: true }
        },
        'customers': {
            generator: 'CustomerGenerator',
            count: 100,
            options: { realistic_names: true, include_edge_cases: true }
        },
        'products': {
            generator: 'ProductGenerator',
            count: 500,
            options: { link_to_categories: true, realistic_names: true }
        },
        'orders': {
            generator: 'OrderGenerator',
            count: 1000,
            options: { realistic_dates: true, link_to_customers: true }
        },
        'order_items': {
            generator: 'OrderItemGenerator',
            count: 3000,
            options: { link_to_orders_and_products: true }
        }
    },
    relationships: [
        {
            from_schema: 'products',
            from_field: 'category_id',
            to_schema: 'categories',
            to_field: 'id',
            relationship_type: 'many_to_one'
        },
        {
            from_schema: 'orders',
            from_field: 'customer_id',
            to_schema: 'customers',
            to_field: 'id',
            relationship_type: 'many_to_one'
        },
        {
            from_schema: 'order_items',
            from_field: 'order_id',
            to_schema: 'orders',
            to_field: 'id',
            relationship_type: 'many_to_one'
        },
        {
            from_schema: 'order_items',
            from_field: 'product_id',
            to_schema: 'products',
            to_field: 'id',
            relationship_type: 'many_to_one'
        }
    ],
    metadata: {
        total_records: 4620,
        complexity: 'complex',
        use_cases: [
            'filter_testing',
            'performance_testing',
            'relationship_testing',
            'complex_queries',
            'bulk_operations',
            'observer_stress_testing'
        ],
        estimated_build_time_seconds: 45,
        record_counts: {
            'categories': 20,
            'customers': 100,
            'products': 500,
            'orders': 1000,
            'order_items': 3000
        }
    }
};
//# sourceMappingURL=ecommerce.js.map