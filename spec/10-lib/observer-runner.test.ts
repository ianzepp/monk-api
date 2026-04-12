import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { Model } from '@src/lib/model.js';
import { ModelRecord } from '@src/lib/model-record.js';
import type { SystemContext } from '@src/lib/system-context-types.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import type { Observer } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { ObserverLoader } from '@src/lib/observers/loader.js';
import { ObserverRunner } from '@src/lib/observers/runner.js';

type ObserverGetSpy = ReturnType<typeof spyOn>;

function createModel(): Model {
    return new Model({} as SystemContext, 'users', {
        status: 'active',
        _fields: []
    });
}

describe('ObserverRunner', () => {
    let getObserversSpy: ObserverGetSpy;

    afterEach(() => {
        getObserversSpy?.mockRestore();
    });

    it('stops post-database rings when ring 5 reports errors', async () => {
        const ringsExecuted: string[] = [];
        const observersByRing = new Map<ObserverRing, Observer[]>([
            [ObserverRing.Database, [{
                ring: ObserverRing.Database,
                name: 'ring-5-failure',
                executeTry: async (context) => {
                    ringsExecuted.push('ring-5');
                    context.errors.push(new ValidationError('database write failed', 'id', 'RING_5_ERROR'));
                },
                execute: async () => undefined
            }]],
            [ObserverRing.PostDatabase, [{
                ring: ObserverRing.PostDatabase,
                name: 'ring-6-side-effect',
                executeTry: async () => {
                    ringsExecuted.push('ring-6');
                },
                execute: async () => undefined
            }]],
            [ObserverRing.Audit, [{
                ring: ObserverRing.Audit,
                name: 'ring-7-audit',
                executeTry: async () => {
                    ringsExecuted.push('ring-7');
                },
                execute: async () => undefined
            }]],
        ]);

        getObserversSpy = spyOn(ObserverLoader, 'getObservers').mockImplementation((model: string, ring: ObserverRing) => {
            void model;
            return observersByRing.get(ring) ?? [];
        });

        const model = createModel();
        const record = new ModelRecord(model, { id: 'record-1' });

        const result = await new ObserverRunner().execute({} as SystemContext, 'create', model, [record]);

        expect(result.success).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('RING_5_ERROR');
        expect(ringsExecuted).toEqual(['ring-5']);
        expect(getObserversSpy.mock.calls.map(([_model, ring]: [string, ObserverRing]) => ring)).toEqual([
            ObserverRing.DataPreparation,
            ObserverRing.InputValidation,
            ObserverRing.Security,
            ObserverRing.Business,
            ObserverRing.Enrichment,
            ObserverRing.Database
        ]);
    });

    it('keeps pre-ring validation behavior and does not execute post-db rings after validation failures', async () => {
        const ringsExecuted: string[] = [];
        const observersByRing = new Map<ObserverRing, Observer[]>([
            [ObserverRing.DataPreparation, [{
                ring: ObserverRing.DataPreparation,
                name: 'ring-0-validation-failure',
                executeTry: async (context) => {
                    ringsExecuted.push('ring-0');
                    context.errors.push(new ValidationError('missing required field', 'name', 'VALIDATION_ERROR'));
                },
                execute: async () => undefined
            }]],
            [ObserverRing.Database, [{
                ring: ObserverRing.Database,
                name: 'ring-5-should-not-run',
                executeTry: async () => {
                    ringsExecuted.push('ring-5');
                },
                execute: async () => undefined
            }]],
            [ObserverRing.PostDatabase, [{
                ring: ObserverRing.PostDatabase,
                name: 'ring-6-should-not-run',
                executeTry: async () => {
                    ringsExecuted.push('ring-6');
                },
                execute: async () => undefined
            }]],
        ]);

        getObserversSpy = spyOn(ObserverLoader, 'getObservers').mockImplementation((model: string, ring: ObserverRing) => {
            void model;
            return observersByRing.get(ring) ?? [];
        });

        const model = createModel();
        const record = new ModelRecord(model, { id: 'record-1' });

        const result = await new ObserverRunner().execute({} as SystemContext, 'create', model, [record]);

        expect(result.success).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('VALIDATION_ERROR');
        expect(ringsExecuted).toEqual(['ring-0']);
        expect(getObserversSpy).toHaveBeenCalledTimes(1);
    });
});
