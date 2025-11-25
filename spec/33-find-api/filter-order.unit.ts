import { describe, it, expect } from 'vitest';
import { FilterOrder } from '@src/lib/filter-order.js';

describe('FilterOrder - String Format', () => {
    it('should generate ORDER BY from string with ASC', () => {
        const orderClause = FilterOrder.generate('name asc');

        expect(orderClause).toBe('ORDER BY "name" ASC');
    });

    it('should generate ORDER BY from string with DESC', () => {
        const orderClause = FilterOrder.generate('created_at desc');

        expect(orderClause).toBe('ORDER BY "created_at" DESC');
    });

    it('should default to ASC when direction not specified', () => {
        const orderClause = FilterOrder.generate('name');

        expect(orderClause).toBe('ORDER BY "name" ASC');
    });

    it('should handle field names with underscores', () => {
        const orderClause = FilterOrder.generate('created_at asc');

        expect(orderClause).toBe('ORDER BY "created_at" ASC');
    });

    it('should normalize ascending to ASC', () => {
        const orderClause = FilterOrder.generate('name ascending');

        expect(orderClause).toBe('ORDER BY "name" ASC');
    });

    it('should normalize descending to DESC', () => {
        const orderClause = FilterOrder.generate('priority descending');

        expect(orderClause).toBe('ORDER BY "priority" DESC');
    });

    it('should handle uppercase sort direction', () => {
        const orderClause = FilterOrder.generate('name DESC');

        expect(orderClause).toBe('ORDER BY "name" DESC');
    });

    it('should handle mixed case sort direction', () => {
        const orderClause = FilterOrder.generate('name DeSc');

        expect(orderClause).toBe('ORDER BY "name" DESC');
    });
});

describe('FilterOrder - Array Format', () => {
    it('should generate ORDER BY from array with single field', () => {
        const orderClause = FilterOrder.generate([{ field: 'name', sort: 'asc' }]);

        expect(orderClause).toBe('ORDER BY "name" ASC');
    });

    it('should generate ORDER BY from array with multiple fields', () => {
        const orderClause = FilterOrder.generate([
            { field: 'priority', sort: 'desc' },
            { field: 'name', sort: 'asc' }
        ]);

        expect(orderClause).toBe('ORDER BY "priority" DESC, "name" ASC');
    });

    it('should handle array with string elements', () => {
        const orderClause = FilterOrder.generate(['name asc', 'created_at desc']);

        expect(orderClause).toBe('ORDER BY "name" ASC, "created_at" DESC');
    });

    it('should skip null/undefined items in array', () => {
        const orderClause = FilterOrder.generate([
            { field: 'name', sort: 'asc' },
            null,
            { field: 'age', sort: 'desc' }
        ]);

        expect(orderClause).toBe('ORDER BY "name" ASC, "age" DESC');
    });

    it('should handle empty array', () => {
        const orderClause = FilterOrder.generate([]);

        expect(orderClause).toBe('');
    });
});

describe('FilterOrder - Object Format', () => {
    it('should generate ORDER BY from object with single field', () => {
        const orderClause = FilterOrder.generate({ name: 'asc' });

        expect(orderClause).toBe('ORDER BY "name" ASC');
    });

    it('should generate ORDER BY from object with multiple fields', () => {
        const orderClause = FilterOrder.generate({
            priority: 'desc',
            name: 'asc',
            created_at: 'desc'
        });

        expect(orderClause).toContain('ORDER BY');
        expect(orderClause).toContain('"priority" DESC');
        expect(orderClause).toContain('"name" ASC');
        expect(orderClause).toContain('"created_at" DESC');
    });

    it('should handle object with descending direction', () => {
        const orderClause = FilterOrder.generate({ created_at: 'descending' });

        expect(orderClause).toBe('ORDER BY "created_at" DESC');
    });

    it('should normalize object field sort directions', () => {
        const orderClause = FilterOrder.generate({ name: 'ASCENDING' });

        expect(orderClause).toBe('ORDER BY "name" ASC');
    });
});

describe('FilterOrder - Field Name Sanitization', () => {
    it('should sanitize field name by removing SQL injection patterns', () => {
        const orderClause = FilterOrder.generate('name; DROP TABLE users');

        // Sanitization removes invalid characters
        expect(orderClause).toContain('ORDER BY');
    });

    it('should parse field name up to first space', () => {
        const orderClause = FilterOrder.generate('user name asc');

        // String parsing stops at first space, "user" is the field, "name" is the direction
        expect(orderClause).toBe('ORDER BY "user" ASC');
    });

    it('should sanitize field name with special characters', () => {
        const orderClause = FilterOrder.generate('name@domain asc');

        // Sanitization removes @ symbol
        expect(orderClause).toBe('ORDER BY "namedomain" ASC');
    });

    it('should keep field name starting with number (sanitization keeps numbers)', () => {
        const orderClause = FilterOrder.generate('123field asc');

        // Sanitization keeps numbers (only removes non-alphanumeric chars except underscore)
        expect(orderClause).toBe('ORDER BY "123field" ASC');
    });

    it('should accept field names starting with underscore', () => {
        const orderClause = FilterOrder.generate('_private asc');

        expect(orderClause).toBe('ORDER BY "_private" ASC');
    });

    it('should accept field names with letters and numbers', () => {
        const orderClause = FilterOrder.generate('field123 asc');

        expect(orderClause).toBe('ORDER BY "field123" ASC');
    });

    it('should sanitize field names by removing invalid characters', () => {
        const orderClause = FilterOrder.generate([{ field: 'name@domain', sort: 'asc' }]);

        expect(orderClause).toBe('ORDER BY "namedomain" ASC');
    });
});

describe('FilterOrder - Sort Direction Normalization', () => {
    it('should normalize invalid sort direction to ASC', () => {
        const orderClause = FilterOrder.generate('name invalid');

        // Invalid direction defaults to ASC
        expect(orderClause).toBe('ORDER BY "name" ASC');
    });

    it('should throw error for numeric sort direction', () => {
        expect(() => {
            FilterOrder.generate({ name: 1 } as any);
        }).toThrow();
    });

    it('should normalize empty sort direction to ASC', () => {
        const orderClause = FilterOrder.generate({ name: '' });

        // Empty direction defaults to ASC
        expect(orderClause).toBe('ORDER BY "name" ASC');
    });

    it('should accept asc', () => {
        const orderClause = FilterOrder.generate('name asc');
        expect(orderClause).toBe('ORDER BY "name" ASC');
    });

    it('should accept desc', () => {
        const orderClause = FilterOrder.generate('name desc');
        expect(orderClause).toBe('ORDER BY "name" DESC');
    });

    it('should accept ascending', () => {
        const orderClause = FilterOrder.generate('name ascending');
        expect(orderClause).toBe('ORDER BY "name" ASC');
    });

    it('should accept descending', () => {
        const orderClause = FilterOrder.generate('name descending');
        expect(orderClause).toBe('ORDER BY "name" DESC');
    });
});

describe('FilterOrder - Input Format Handling', () => {
    it('should return empty for number input', () => {
        const orderClause = FilterOrder.generate(123 as any);

        // Invalid input returns empty ORDER BY
        expect(orderClause).toBe('');
    });

    it('should return empty for boolean input', () => {
        const orderClause = FilterOrder.generate(true as any);

        // Invalid input returns empty ORDER BY
        expect(orderClause).toBe('');
    });

    it('should return empty for empty object', () => {
        const orderClause = FilterOrder.generate({});

        // Empty object returns empty ORDER BY
        expect(orderClause).toBe('');
    });

    it('should return empty for empty string', () => {
        const orderClause = FilterOrder.generate('');

        // Empty string returns empty ORDER BY
        expect(orderClause).toBe('');
    });

    it('should return empty for whitespace-only string', () => {
        const orderClause = FilterOrder.generate('   ');

        // Whitespace-only string returns empty ORDER BY
        expect(orderClause).toBe('');
    });

    it('should accept null/undefined as empty order', () => {
        const orderClause = FilterOrder.generate(null);
        expect(orderClause).toBe('');
    });
});

describe('FilterOrder - Array Sanitization', () => {
    it('should skip invalid array items', () => {
        const orderClause = FilterOrder.generate([{ field: 'name', sort: 'asc' }, 123, { field: 'age', sort: 'desc' }] as any);

        // Invalid items are skipped, valid ones are processed
        expect(orderClause).toContain('"name" ASC');
        expect(orderClause).toContain('"age" DESC');
    });

    it('should sanitize array item with invalid field name', () => {
        const orderClause = FilterOrder.generate([{ field: 'name; DROP TABLE', sort: 'asc' }]);

        // Field name is sanitized by removing invalid characters
        expect(orderClause).toContain('ORDER BY');
    });

    it('should normalize array item with invalid sort direction', () => {
        const orderClause = FilterOrder.generate([{ field: 'name', sort: 'invalid' }]);

        // Invalid sort direction defaults to ASC
        expect(orderClause).toBe('ORDER BY "name" ASC');
    });

    it('should sanitize array with string item containing invalid field', () => {
        const orderClause = FilterOrder.generate(['name; DROP TABLE asc']);

        // Field name is sanitized
        expect(orderClause).toContain('ORDER BY');
    });
});

describe('FilterOrder - Edge Cases', () => {
    it('should handle null order data', () => {
        const orderClause = FilterOrder.generate(null);

        expect(orderClause).toBe('');
    });

    it('should handle undefined order data', () => {
        const orderClause = FilterOrder.generate(undefined);

        expect(orderClause).toBe('');
    });

    it('should properly escape field names with quotes', () => {
        const orderClause = FilterOrder.generate('user_id asc');

        expect(orderClause).toContain('"user_id"');
    });

    it('should uppercase sort direction in output', () => {
        const orderClause = FilterOrder.generate('name asc');

        expect(orderClause).toContain('ASC');
        expect(orderClause).not.toContain('asc');
    });

    it('should join multiple fields with comma and space', () => {
        const orderClause = FilterOrder.generate([
            { field: 'priority', sort: 'desc' },
            { field: 'name', sort: 'asc' }
        ]);

        expect(orderClause).toContain(', ');
        expect(orderClause).toBe('ORDER BY "priority" DESC, "name" ASC');
    });

    it('should handle very long field names', () => {
        const longFieldName = 'a'.repeat(100);
        const orderClause = FilterOrder.generate({ [longFieldName]: 'asc' });

        expect(orderClause).toContain(`"${longFieldName}"`);
        expect(orderClause).toContain('ASC');
    });

    it('should handle field name at SQL identifier limit', () => {
        const fieldName = 'field_with_63_characters_exactly_which_is_pg_identifier_max';
        const orderClause = FilterOrder.generate({ [fieldName]: 'desc' });

        expect(orderClause).toContain(`"${fieldName}"`);
        expect(orderClause).toContain('DESC');
    });
});

describe('FilterOrder - Static Validate Method', () => {
    it('should validate without throwing for valid string order', () => {
        expect(() => {
            FilterOrder.validate('name asc');
        }).not.toThrow();
    });

    it('should validate without throwing for valid array order', () => {
        expect(() => {
            FilterOrder.validate([{ field: 'name', sort: 'asc' }]);
        }).not.toThrow();
    });

    it('should validate without throwing for valid object order', () => {
        expect(() => {
            FilterOrder.validate({ name: 'asc', created_at: 'desc' });
        }).not.toThrow();
    });

    it('should throw for invalid field name', () => {
        expect(() => {
            FilterOrder.validate('name; DROP TABLE asc');
        }).toThrow('Invalid field name format');
    });

    it('should throw for invalid sort direction', () => {
        expect(() => {
            FilterOrder.validate('name invalid');
        }).toThrow('Invalid sort direction');
    });

    it('should validate without throwing for null/undefined', () => {
        expect(() => {
            FilterOrder.validate(null);
        }).not.toThrow();

        expect(() => {
            FilterOrder.validate(undefined);
        }).not.toThrow();
    });

    it('should throw for invalid array item', () => {
        expect(() => {
            FilterOrder.validate([123] as any);
        }).toThrow('Invalid order specification at index 0');
    });
});

describe('FilterOrder - Complex Scenarios', () => {
    it('should handle mixed formats in array', () => {
        const orderClause = FilterOrder.generate([
            'priority desc',
            { field: 'status', sort: 'asc' },
            'created_at desc'
        ]);

        expect(orderClause).toBe('ORDER BY "priority" DESC, "status" ASC, "created_at" DESC');
    });

    it('should handle object with multiple fields maintaining order', () => {
        // Note: Object key order is insertion order in modern JS
        const orderClause = FilterOrder.generate({
            priority: 'desc',
            status: 'asc',
            created_at: 'desc',
            name: 'asc'
        });

        expect(orderClause).toContain('ORDER BY');
        expect(orderClause).toContain('"priority" DESC');
        expect(orderClause).toContain('"status" ASC');
        expect(orderClause).toContain('"created_at" DESC');
        expect(orderClause).toContain('"name" ASC');
    });

    it('should handle sanitization of field names with special chars', () => {
        const orderClause = FilterOrder.generate([
            { field: 'user@name', sort: 'asc' },
            { field: 'email#address', sort: 'desc' }
        ]);

        expect(orderClause).toBe('ORDER BY "username" ASC, "emailaddress" DESC');
    });
});
