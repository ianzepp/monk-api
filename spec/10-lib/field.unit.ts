import { describe, it, expect } from 'bun:test';
import { Field, type FieldRow } from '@src/lib/field.js';

/**
 * Helper to create a minimal valid FieldRow
 */
function createFieldRow(overrides: Partial<FieldRow> = {}): FieldRow {
    return {
        id: 'field-123',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        trashed_at: null,
        deleted_at: null,
        model_name: 'users',
        field_name: 'email',
        type: 'text',
        is_array: false,
        required: false,
        immutable: false,
        sudo: false,
        tracked: false,
        unique: false,
        index: false,
        searchable: false,
        minimum: null,
        maximum: null,
        pattern: null,
        enum_values: null,
        default_value: null,
        description: null,
        transform: null,
        relationship_type: null,
        related_model: null,
        related_field: null,
        relationship_name: null,
        cascade_delete: false,
        required_relationship: false,
        ...overrides,
    };
}

describe('Field', () => {
    describe('constructor', () => {
        it('should create field with basic properties', () => {
            const row = createFieldRow({
                model_name: 'users',
                field_name: 'email',
                type: 'text',
            });

            const field = new Field(row);

            expect(field.id).toBe('field-123');
            expect(field.modelName).toBe('users');
            expect(field.fieldName).toBe('email');
            expect(field.type).toBe('text');
            expect(field.isArray).toBe(false);
        });

        it('should handle boolean flags', () => {
            const row = createFieldRow({
                required: true,
                immutable: true,
                sudo: true,
                tracked: true,
                unique: true,
                index: true,
                searchable: true,
            });

            const field = new Field(row);

            expect(field.required).toBe(true);
            expect(field.immutable).toBe(true);
            expect(field.sudo).toBe(true);
            expect(field.tracked).toBe(true);
            expect(field.unique).toBe(true);
            expect(field.index).toBe(true);
            expect(field.searchable).toBe(true);
        });

        it('should default boolean flags to false when falsy', () => {
            const row = createFieldRow({
                required: false,
                immutable: false,
                sudo: false,
            });

            const field = new Field(row);

            expect(field.required).toBe(false);
            expect(field.immutable).toBe(false);
            expect(field.sudo).toBe(false);
        });

        it('should handle array type', () => {
            const row = createFieldRow({
                type: 'text',
                is_array: true,
            });

            const field = new Field(row);

            expect(field.isArray).toBe(true);
        });
    });

    describe('constraints', () => {
        it('should handle numeric constraints', () => {
            const row = createFieldRow({
                minimum: 0,
                maximum: 100,
            });

            const field = new Field(row);

            expect(field.minimum).toBe(0);
            expect(field.maximum).toBe(100);
        });

        it('should convert null constraints to undefined', () => {
            const row = createFieldRow({
                minimum: null,
                maximum: null,
            });

            const field = new Field(row);

            expect(field.minimum).toBeUndefined();
            expect(field.maximum).toBeUndefined();
        });

        it('should compile valid regex pattern', () => {
            const row = createFieldRow({
                pattern: '^[a-z]+$',
            });

            const field = new Field(row);

            expect(field.pattern).toBeInstanceOf(RegExp);
            expect(field.pattern!.test('abc')).toBe(true);
            expect(field.pattern!.test('ABC')).toBe(false);
        });

        it('should handle invalid regex pattern gracefully', () => {
            const row = createFieldRow({
                pattern: '[invalid(regex',
            });

            // Should not throw
            const field = new Field(row);

            // Pattern should be undefined for invalid regex
            expect(field.pattern).toBeUndefined();
        });

        it('should handle email regex pattern', () => {
            const row = createFieldRow({
                pattern: '^[^@]+@[^@]+\\.[^@]+$',
            });

            const field = new Field(row);

            expect(field.pattern).toBeInstanceOf(RegExp);
            expect(field.pattern!.test('test@example.com')).toBe(true);
            expect(field.pattern!.test('invalid')).toBe(false);
        });
    });

    describe('enum values', () => {
        it('should handle enum values', () => {
            const row = createFieldRow({
                enum_values: ['active', 'inactive', 'pending'],
            });

            const field = new Field(row);

            expect(field.enumValues).toEqual(['active', 'inactive', 'pending']);
        });

        it('should convert null enum to undefined', () => {
            const row = createFieldRow({
                enum_values: null,
            });

            const field = new Field(row);

            expect(field.enumValues).toBeUndefined();
        });
    });

    describe('transform', () => {
        it('should handle transform', () => {
            const row = createFieldRow({
                transform: 'lowercase',
            });

            const field = new Field(row);

            expect(field.transform).toBe('lowercase');
        });

        it('should convert null transform to undefined', () => {
            const row = createFieldRow({
                transform: null,
            });

            const field = new Field(row);

            expect(field.transform).toBeUndefined();
        });
    });

    describe('relationships', () => {
        it('should handle relationship metadata', () => {
            const row = createFieldRow({
                field_name: 'user_id',
                relationship_type: 'owned',
                related_model: 'users',
                related_field: 'id',
                relationship_name: 'orders',
                cascade_delete: true,
                required_relationship: true,
            });

            const field = new Field(row);

            expect(field.relationshipType).toBe('owned');
            expect(field.relatedModel).toBe('users');
            expect(field.relatedField).toBe('id');
            expect(field.relationshipName).toBe('orders');
            expect(field.cascadeDelete).toBe(true);
            expect(field.requiredRelationship).toBe(true);
        });

        it('should convert null relationship fields to undefined', () => {
            const row = createFieldRow({
                relationship_type: null,
                related_model: null,
                related_field: null,
                relationship_name: null,
            });

            const field = new Field(row);

            expect(field.relationshipType).toBeUndefined();
            expect(field.relatedModel).toBeUndefined();
            expect(field.relatedField).toBeUndefined();
            expect(field.relationshipName).toBeUndefined();
        });
    });

    describe('hasConstraints()', () => {
        it('should return true when minimum is set', () => {
            const field = new Field(createFieldRow({ minimum: 0 }));
            expect(field.hasConstraints()).toBe(true);
        });

        it('should return true when maximum is set', () => {
            const field = new Field(createFieldRow({ maximum: 100 }));
            expect(field.hasConstraints()).toBe(true);
        });

        it('should return true when pattern is set', () => {
            const field = new Field(createFieldRow({ pattern: '^[a-z]+$' }));
            expect(field.hasConstraints()).toBe(true);
        });

        it('should return false when no constraints', () => {
            const field = new Field(createFieldRow());
            expect(field.hasConstraints()).toBe(false);
        });
    });

    describe('hasRelationship()', () => {
        it('should return true when relationship is defined', () => {
            const field = new Field(createFieldRow({
                related_model: 'users',
                relationship_name: 'orders',
            }));
            expect(field.hasRelationship()).toBe(true);
        });

        it('should return false when related_model is missing', () => {
            const field = new Field(createFieldRow({
                relationship_name: 'orders',
            }));
            expect(field.hasRelationship()).toBe(false);
        });

        it('should return false when relationship_name is missing', () => {
            const field = new Field(createFieldRow({
                related_model: 'users',
            }));
            expect(field.hasRelationship()).toBe(false);
        });

        it('should return false when no relationship', () => {
            const field = new Field(createFieldRow());
            expect(field.hasRelationship()).toBe(false);
        });
    });

    describe('hasEnum()', () => {
        it('should return true when enum values exist', () => {
            const field = new Field(createFieldRow({
                enum_values: ['a', 'b', 'c'],
            }));
            expect(field.hasEnum()).toBe(true);
        });

        it('should return false for empty enum array', () => {
            const field = new Field(createFieldRow({
                enum_values: [],
            }));
            expect(field.hasEnum()).toBe(false);
        });

        it('should return false when no enum', () => {
            const field = new Field(createFieldRow());
            expect(field.hasEnum()).toBe(false);
        });
    });

    describe('hasTransform()', () => {
        it('should return true when transform is set', () => {
            const field = new Field(createFieldRow({
                transform: 'lowercase',
            }));
            expect(field.hasTransform()).toBe(true);
        });

        it('should return false when no transform', () => {
            const field = new Field(createFieldRow());
            expect(field.hasTransform()).toBe(false);
        });
    });

    describe('key getter', () => {
        it('should return model_name:field_name', () => {
            const field = new Field(createFieldRow({
                model_name: 'users',
                field_name: 'email',
            }));
            expect(field.key).toBe('users:email');
        });
    });

    describe('relationshipKey getter', () => {
        it('should return related_model:relationship_name for relationship fields', () => {
            const field = new Field(createFieldRow({
                related_model: 'users',
                relationship_name: 'orders',
            }));
            expect(field.relationshipKey).toBe('users:orders');
        });

        it('should return undefined for non-relationship fields', () => {
            const field = new Field(createFieldRow());
            expect(field.relationshipKey).toBeUndefined();
        });
    });
});
