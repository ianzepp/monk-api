import { vi } from 'vitest';
import type { SystemContext } from '@src/lib/system-context-types.js';
import type { Model } from '@src/lib/model.js';
import type { System } from '@src/lib/system.js';
import { Database } from '@src/lib/database.js';

/**
 * Create a mock SystemContext for testing
 */
export function createMockSystemContext(
    overrides?: Partial<SystemContext>
): SystemContext {
    const defaults: Partial<SystemContext> = {
        userId: 'test-user-id',
        context: {} as any, // Context is a Hono context type, not a string
        options: {},
        database: {} as any,
        describe: {} as any,
        getUser: vi.fn().mockReturnValue({
            id: 'test-user-id',
            tenant: 'test-tenant',
            role: 'user',
            accessRead: [],
            accessEdit: [],
            accessFull: [],
        }),
        isRoot: vi.fn().mockReturnValue(false),
    };

    return {
        ...defaults,
        ...overrides,
    } as SystemContext;
}

/**
 * Create a mock System for testing (used by BulkProcessor)
 */
export function createMockSystem(
    overrides?: Partial<System>
): System {
    const database = overrides?.database || ({} as any);

    const defaults: Partial<System> = {
        userId: 'test-user-id',
        correlationId: 'test-correlation-id',
        context: {} as any, // Context is a Hono context type, not a string
        options: {},
        database,
        describe: {} as any,
        getUser: vi.fn().mockReturnValue({
            id: 'test-user-id',
            tenant: 'test-tenant',
            role: 'user',
            accessRead: [],
            accessEdit: [],
            accessFull: [],
        }),
        isRoot: vi.fn().mockReturnValue(false),
    };

    return {
        ...defaults,
        ...overrides,
    } as System;
}

/**
 * Create a mock Model for testing
 */
export function createMockModel(
    overrides?: Partial<Model>
): Model {
    const defaults: Partial<Model> = {
        modelName: 'test_model',
        status: 'active',
        immutableFields: new Set<string>(),
        sudoFields: new Set<string>(),
        trackedFields: new Set<string>(),
        requiredFields: new Set<string>(),
        typedFields: new Map(),
        rangeFields: new Map(),
        enumFields: new Map(),
        transformFields: new Map(),
        validationFields: [],
        external: false,
        frozen: false,
    };

    return {
        ...defaults,
        ...overrides,
        // Ensure model_name getter is available
        get model_name() {
            return this.modelName;
        },
    } as Model;
}

/**
 * Create a mock NamespaceCache for testing
 */
export function createMockNamespace(overrides?: {
    getModel?: any;
}): any {
    const defaultModel = createMockModel({ modelName: 'orders' });

    return {
        getModel: overrides?.getModel ?? vi.fn().mockReturnValue(defaultModel),
        isLoaded: vi.fn().mockReturnValue(true),
        invalidateModel: vi.fn(),
        loadOne: vi.fn().mockResolvedValue(undefined),
        loadAll: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Create a mock Database with common spy methods
 */
export function createMockDatabase(overrides?: {
    getModel?: any;
    execute?: any;
    getDefaultSoftDeleteOptions?: any;
    convertPostgreSQLTypes?: any;
    aggregate?: any;
}): Database {
    // Create mock namespace with getModel
    const mockNamespace = createMockNamespace({
        getModel: overrides?.getModel,
    });

    const mockSystem = createMockSystemContext({
        database: {} as any,
        namespace: mockNamespace,
    });

    const database = new Database(mockSystem);

    // Set up default spies
    if (overrides?.execute !== undefined) {
        vi.spyOn(database as any, 'execute').mockImplementation(overrides.execute);
    } else {
        vi.spyOn(database as any, 'execute').mockResolvedValue({ rows: [] });
    }

    if (overrides?.getDefaultSoftDeleteOptions !== undefined) {
        vi.spyOn(database as any, 'getDefaultSoftDeleteOptions')
            .mockImplementation(overrides.getDefaultSoftDeleteOptions);
    } else {
        vi.spyOn(database as any, 'getDefaultSoftDeleteOptions').mockReturnValue({});
    }

    if (overrides?.convertPostgreSQLTypes !== undefined) {
        vi.spyOn(database as any, 'convertPostgreSQLTypes')
            .mockImplementation(overrides.convertPostgreSQLTypes);
    } else {
        vi.spyOn(database as any, 'convertPostgreSQLTypes')
            .mockImplementation((row: any) => row);
    }

    if (overrides?.aggregate !== undefined) {
        vi.spyOn(database, 'aggregate').mockImplementation(overrides.aggregate);
    }

    return database;
}
