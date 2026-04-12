import { describe, it, expect } from 'bun:test';
import { ModelRecord } from '@src/lib/model-record.js';
import type { Model } from '@src/lib/model.js';

function createModelWithField(fieldName: string): Model {
    return {
        model_name: 'products',
        hasField: (name: string) => name === fieldName,
        getTypedFields: () => new Map([
            [fieldName, { type: 'text', is_array: false }]
        ]),
    } as unknown as Model;
}

describe('ModelRecord', () => {
    describe('get()', () => {
        it('preserves explicit null from current data', () => {
            const record = new ModelRecord(createModelWithField('name'), { name: null });

            expect(record.get('name')).toBeNull();
        });

        it('preserves explicit null over original value on update-like records', () => {
            const record = new ModelRecord(createModelWithField('name'), { name: null });
            record.load({ name: 'original-name' });

            expect(record.get('name')).toBeNull();
        });

        it('falls back to original when current value is missing', () => {
            const record = new ModelRecord(createModelWithField('name'), {});
            record.load({ name: 'original-name' });

            expect(record.get('name')).toBe('original-name');
        });

        it('continues to treat undefined as missing for fallback behavior', () => {
            const record = new ModelRecord(createModelWithField('name'), { name: undefined });
            record.load({ name: 'original-name' });

            expect(record.get('name')).toBe('original-name');
        });
    });
});
