import { describe, expect, it } from 'bun:test';
import { Model } from '@src/lib/model.js';
import { ModelRecord } from '@src/lib/model-record.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import type { SystemContext } from '@src/lib/system-context-types.js';
import FieldSudoValidator from '@src/observers/all/1/25-field-sudo-validator.js';

function createModel(): Model {
    return new Model({} as SystemContext, 'products', {
        status: 'active',
        _fields: [
            { field_name: 'name', type: 'text' },
            { field_name: 'secret', type: 'text', sudo: true },
        ],
    });
}

function createContext(record: ModelRecord, operation: 'create' | 'update'): ObserverContext {
    return {
        system: {
            isSudo: () => false,
            getUser: () => ({ id: 'user-1' }),
        } as unknown as SystemContext,
        operation,
        model: record.model,
        record,
        recordIndex: 0,
        errors: [],
        warnings: [],
        startTime: Date.now(),
    };
}

describe('FieldSudoValidator', () => {
    it('allows non-sudo updates when sudo fields are unchanged', async () => {
        const model = createModel();
        const record = new ModelRecord(model, {
            id: 'record-1',
            name: 'new name',
        });
        record.load({
            id: 'record-1',
            name: 'old name',
            secret: 'unchanged-secret',
        });

        await expect(new FieldSudoValidator().execute(createContext(record, 'update'))).resolves.toBeUndefined();
    });

    it('blocks non-sudo updates to changed sudo fields', async () => {
        const model = createModel();
        const record = new ModelRecord(model, {
            id: 'record-1',
            secret: 'new-secret',
        });
        record.load({
            id: 'record-1',
            name: 'old name',
            secret: 'old-secret',
        });

        await expect(new FieldSudoValidator().execute(createContext(record, 'update'))).rejects.toThrow('sudo');
    });

    it('blocks non-sudo creates with sudo fields', async () => {
        const model = createModel();
        const record = new ModelRecord(model, {
            name: 'new product',
            secret: 'protected',
        });

        await expect(new FieldSudoValidator().execute(createContext(record, 'create'))).rejects.toThrow('sudo');
    });
});
