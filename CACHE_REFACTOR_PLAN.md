# Cache Architecture Refactor Plan

## Implementation Status: COMPLETE

All phases have been implemented and tested. The new NamespaceCache is now the primary caching mechanism. Legacy caches (ModelCache, RelationshipCache) are kept for backward compatibility but are deprecated.

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Field Class | COMPLETE | `src/lib/field.ts` - 31 unit tests |
| Phase 2: NamespaceCache | COMPLETE | `src/lib/namespace-cache.ts` - integrated into System |
| Phase 3: Model Refactor | COMPLETE | New categorized Maps with backward-compatible legacy API |
| Phase 4: Relationship Migration | COMPLETE | `Database.getRelationship()` uses NamespaceCache |
| Phase 5: Cache Invalidation | COMPLETE | Observers invalidate both caches |
| Phase 5: Cleanup | DEFERRED | Legacy caches kept for backward compatibility |

**Test Results:** All 239 integration tests + 449 unit tests pass.

**Files Created:**
- `src/lib/field.ts` - First-class Field domain object
- `src/lib/namespace-cache.ts` - NamespaceCacheManager + NamespaceCache
- `spec/10-lib/field.unit.ts` - Field unit tests

**Files Modified:**
- `src/lib/model.ts` - Refactored to use Field objects
- `src/lib/system.ts` - Added `namespace` property
- `src/lib/system-context-types.ts` - Added `namespace` to interface
- `src/lib/database.ts` - `toModel()` and `getRelationship()` use NamespaceCache
- `src/lib/api-helpers.ts` - `withTransaction()` loads namespace cache
- `src/observers/models/8/50-model-cache-invalidator.ts` - Invalidates both caches
- `src/observers/fields/8/50-field-cache-invalidator.ts` - Invalidates both caches

---

## Problem Statement

The current caching architecture has several issues:

1. **Schema-blind caching**: ModelCache and RelationshipCache key by database name only, not PG schema/namespace. This creates potential cross-tenant visibility issues when multiple tenants share the same database.

2. **Scattered complexity**: Model class maintains 8 separate Set/Map properties for field metadata, which is sloppy and hard to maintain.

3. **No first-class Field**: Fields are raw objects passed around, not proper domain objects.

4. **Separate RelationshipCache**: Relationship data is just field metadata and should be part of the field/model structure.

5. **On-demand loading**: Cold starts pay performance penalties; eager loading per namespace would be more efficient.

---

## Target Architecture

### NamespaceCacheManager (Singleton) + NamespaceCache (Per-Namespace)

The manager holds all namespace caches; each NamespaceCache is bound to a specific `db:ns`.

```typescript
/**
 * Singleton manager that holds all namespace caches.
 * Returns bound NamespaceCache instances for use in per-request System context.
 */
class NamespaceCacheManager {
    private static instance: NamespaceCacheManager;
    private caches = new Map<string, NamespaceCache>();

    static getInstance(): NamespaceCacheManager;

    // Get or create namespace cache (called once per request in System constructor)
    getNamespaceCache(db: string, ns: string): NamespaceCache;

    // Cache key: "monk:ns_tenant_a"
    private getCacheKey(db: string, ns: string): string {
        return `${db}:${ns}`;
    }
}

/**
 * Per-namespace cache bound to a specific db:ns.
 * Stored on System for the request lifecycle - no need to pass db/ns repeatedly.
 *
 * Loading vs Reading:
 * - Load operations (loadAll, loadOne) require tx and hit the database
 * - Read operations (getModel, getRelationships) are pure cache reads, no tx needed
 * - Invalidation clears cache entries, then loadOne() is called to repopulate
 */
class NamespaceCache {
    readonly db: string;
    readonly ns: string;

    // Internal storage
    private models: Map<string, Model>;              // key: model_name
    private fields: Map<string, Field>;              // key: "model_name:field_name"
    private relationships: Map<string, Field[]>;     // key: "parent_model:relationship_name"
    private loaded: boolean = false;
    private loadedAt: number;

    // === Load operations (require tx) ===

    // Initial load - all models + fields for namespace (one-time penalty per tenant)
    async loadAll(tx: TxContext): Promise<void>;

    // Reload single model after invalidation
    async loadOne(tx: TxContext, modelName: string): Promise<void>;

    // Check if initial load completed
    isLoaded(): boolean;

    // === Read operations (no tx needed) ===

    getModel(modelName: string): Model | undefined;
    getRelationships(parentModel: string, relationshipName: string): Field[];

    // === Invalidation (no tx needed, but loadOne should follow) ===

    invalidateModel(modelName: string): void;

    // Internal: rebuild relationships index from current fields
    private rebuildRelationships(): void;
}
```

### System Integration

System gains a `namespace` property bound at construction:

```typescript
class System implements SystemContext {
    // Existing
    readonly context: Context;
    readonly userId: string;
    readonly options: SystemOptions;
    tx: TxContext;
    readonly database: Database;
    readonly describe: Describe;

    // New: bound namespace cache for this request
    readonly namespace: NamespaceCache;

    constructor(c: Context, options: SystemOptions = {}) {
        // ... existing initialization ...

        // Bind namespace cache from JWT claims
        const db = c.get('dbName');   // From JWT token.db
        const ns = c.get('nsName');   // From JWT token.ns
        this.namespace = NamespaceCacheManager.getInstance().getNamespaceCache(db, ns);
    }
}
```

**Initial load in withTransaction():**

```typescript
export function withTransaction(handler: (context: Context) => Promise<void>) {
    return async (context: Context) => {
        const system = context.get('system');
        const nsName = context.get('nsName');
        const pool = context.get('database');
        const tx = await pool.connect();

        try {
            await tx.query('BEGIN');
            await tx.query(`SET LOCAL search_path TO "${nsName}", public`);
            system.tx = tx;

            // Ensure namespace cache is loaded (one-time per tenant)
            if (!system.namespace.isLoaded()) {
                await system.namespace.loadAll(tx);
            }

            await handler(context);
            await tx.query('COMMIT');
        } catch (error) {
            // ... rollback ...
        } finally {
            tx.release();
            system.tx = undefined;
        }
    };
}
```

**Usage in routes/observers (read operations - no tx):**

```typescript
// Get model - pure cache read
const model = system.namespace.getModel('users');

// Get relationships - pure cache read
const rels = system.namespace.getRelationships('users', 'items');
```

**Invalidation in observers (has tx for reload):**

```typescript
// In Ring 8 cache-invalidator observer
system.namespace.invalidateModel(modelName);
await system.namespace.loadOne(system.tx, modelName);
```

### Model (Simplified)

Holds core metadata and categorized Field maps for O(1) lookups.

```typescript
class Model {
    // Core metadata (from models table)
    readonly modelName: string;
    readonly status: string;
    readonly sudo?: boolean;
    readonly frozen?: boolean;
    readonly external?: boolean;

    // All fields for this model
    readonly fields: Map<string, Field>;      // key: field_name

    // Categorized views (same Field objects, filtered by attribute)
    readonly immutables: Map<string, Field>;  // field.immutable === true
    readonly sudos: Map<string, Field>;       // field.sudo === true
    readonly requireds: Map<string, Field>;   // field.required === true
    readonly trackeds: Map<string, Field>;    // field.tracked === true
    readonly typeds: Map<string, Field>;      // field.type is set
    readonly enums: Map<string, Field>;       // field.enumValues has values
    readonly transforms: Map<string, Field>;  // field.transform is set
    readonly constraints: Map<string, Field>; // field has min/max/pattern

    // Convenience methods
    hasField(fieldName: string): boolean;
    getField(fieldName: string): Field | undefined;

    // Database operation proxies (unchanged from current)
    async count(filter?: FilterData): Promise<number>;
    async selectAny(filter?: FilterData): Promise<any[]>;
    // ... etc
}
```

**Usage patterns:**

```typescript
// Check if field is immutable
if (model.immutables.has('status')) { ... }

// Get full Field object for immutable field
const field = model.immutables.get('status');

// Iterate immutable fields
for (const [fieldName, field] of model.immutables) { ... }
```

### Field (First-Class, Data-Only)

Domain object wrapping field row data with typed accessors.

```typescript
class Field {
    // Identity
    readonly id: string;
    readonly modelName: string;
    readonly fieldName: string;

    // Type information
    readonly type: string;
    readonly isArray: boolean;

    // Behavior flags
    readonly required: boolean;
    readonly immutable: boolean;
    readonly sudo: boolean;
    readonly tracked: boolean;

    // Constraints (used together by single validator)
    readonly minimum?: number;
    readonly maximum?: number;
    readonly pattern?: RegExp;      // Pre-compiled from string

    // Enum
    readonly enumValues?: string[];

    // Transform
    readonly transform?: string;

    // Relationship metadata (absorbs RelationshipCache)
    readonly relatedModel?: string;
    readonly relationshipName?: string;
    readonly relationshipType?: string;  // 'owned', 'referenced'

    // Convenience
    hasConstraints(): boolean;
    hasRelationship(): boolean;
}
```

### ModelRecord (Unchanged)

Continues to reference Model and provide change tracking.

```typescript
class ModelRecord {
    readonly model: Model;
    // ... existing implementation unchanged
}
```

---

## Phased Implementation

### Phase 1: Field Class - COMPLETE

Create first-class Field without changing anything else.

**Files:**
- Create: `src/lib/field.ts`

**Changes:**
- Field class wraps raw field row
- Compiles pattern to RegExp in constructor
- Exposes typed readonly properties
- No external changes yet

**Validation:**
- Unit tests for Field class
- Verify pattern compilation

---

### Phase 2: NamespaceCacheManager + NamespaceCache - COMPLETE

Replace ModelCache and RelationshipCache with schema-aware namespace caching.

**Files:**
- Create: `src/lib/namespace-cache.ts` (contains both Manager and Cache classes)
- Modify: `src/lib/system.ts` (add `namespace` property)
- Modify: `src/lib/system-context-types.ts` (add `namespace` to interface)
- Deprecate: `src/lib/model-cache.ts` (keep temporarily)
- Deprecate: `src/lib/relationship-cache.ts` (keep temporarily)

**Changes:**
- `NamespaceCacheManager`: singleton that holds all namespace caches
- `NamespaceCache`: per-namespace instance with `getModel()`, `getRelationships()`, `invalidateModel()`
- Eager load all models + fields on first access per namespace
- Store Field objects in `fields` Map (key: `model_name:field_name`)
- Build `relationships` index during load (key: `parent_model:relationship_name`, value: `Field[]`)

**System Integration:**
- System constructor gets `db`/`ns` from Hono context (set by auth middleware from JWT)
- System calls `NamespaceCacheManager.getInstance().getNamespaceCache(db, ns)`
- Stores result as `system.namespace` for request lifecycle
- All call sites use `system.namespace.getModel()` etc. - no db/ns passing

**Database.toModel() Migration:**
- Currently calls `ModelCache.getInstance().getModel(system, modelName)`
- Changes to `system.namespace.getModel(modelName)`

**Validation:**
- Multi-tenant test: verify tenant A cannot see tenant B's cached models
- Eager load test: verify single DB round-trip loads all models+fields
- Relationship test: verify one-to-many lookups work

---

### Phase 3: Model Refactor - COMPLETE

Simplify Model to use Field objects and categorized Maps.

**Files:**
- Modify: `src/lib/model.ts`

**Changes:**
- Constructor receives `Map<string, Field>` instead of raw `_fields` array
- Remove individual Set/Map properties (immutableFields, sudoFields, etc.)
- Add categorized Maps populated from Field objects:
  - `immutables`, `sudos`, `requireds`, `trackeds`
  - `typeds`, `enums`, `transforms`, `constraints`
- Keep `fields: Map<string, Field>` as primary collection
- Update `hasField()` to check `fields.has()`
- Remove `getValidationFields()` (observers use categorized Maps directly)

**Observer updates:**
- `40-data-validator.ts`: Use `model.requireds`, `model.typeds`, `model.constraints`, `model.enums`
- `30-immutable-validator.ts`: Use `model.immutables`
- `25-field-sudo-validator.ts`: Use `model.sudos`
- Other observers as needed

**Validation:**
- All existing observer tests pass
- Performance benchmark: verify no regression

---

### Phase 4: Relationship Route Migration - COMPLETE

Update `/api/data/:model/:record/:relationship*` routes to use NamespaceCache.

**Note:** Routes continue to use `Database.getRelationship()` which now internally uses NamespaceCache when available.

**Files:**
- Modify: `src/routes/api/data/:model/:record/:relationship/GET.ts`
- Modify: `src/routes/api/data/:model/:record/:relationship/POST.ts`
- Modify: `src/routes/api/data/:model/:record/:relationship/:child/GET.ts`
- Modify: `src/routes/api/data/:model/:record/:relationship/:child/PUT.ts`
- Modify: `src/routes/api/data/:model/:record/:relationship/:child/DELETE.ts`

**Changes:**
- Replace `RelationshipCache.getInstance().getRelationship()` with `NamespaceCache.getInstance().getRelationships()`
- Handle one-to-many: `getRelationships()` returns `Field[]`
- Update route logic to work with Field objects

**Validation:**
- Relationship route integration tests pass
- Verify parent→child lookups work correctly

---

### Phase 5: Cleanup - PARTIAL (Cache Invalidation Complete, Deletion Deferred)

Remove deprecated code.

**Files:**
- Delete: `src/lib/model-cache.ts`
- Delete: `src/lib/relationship-cache.ts`
- Modify: `src/observers/*/8/50-*-cache-invalidator.ts` → call `system.namespace.invalidateModel()`

**Changes:**
- Remove all ModelCache references
- Remove all RelationshipCache references
- Update cache invalidation observers to call `system.namespace.invalidateModel(modelName)`

**Validation:**
- Full test suite passes
- No references to old caches remain
- Grep for `ModelCache` and `RelationshipCache` returns zero hits

---

## Cache Invalidation Strategy

When a model or field changes (via Describe API):

1. **Trigger**: Ring 8 observer detects model/field create/update/delete
2. **Invalidate**: Call `system.namespace.invalidateModel(modelName)`
   - Removes model from `models` Map
   - Removes all fields for that model from `fields` Map (keys starting with `modelName:`)
   - Clears stale relationship entries
3. **Reload**: Call `await system.namespace.loadOne(system.tx, modelName)`
   - Queries `models` table for this model
   - Queries `fields` table for this model's fields
   - Builds new Model with Field objects
   - Updates `models` and `fields` Maps
   - Calls `rebuildRelationships()` to regenerate index

**Two loading scenarios:**

| Scenario | Trigger | Method | Cost |
|----------|---------|--------|------|
| First request for tenant | `withTransaction()` | `loadAll(tx)` | One-time, loads all models+fields |
| Model/field change | Ring 8 observer | `invalidateModel()` + `loadOne(tx)` | Per-model reload |

**Note**: Only the affected model is invalidated and reloaded, not the entire namespace.

---

## Edge Cases & Error Handling

### getModel() before loadAll()

If `getModel()` is called before `loadAll()` completes (bug or misconfiguration), **throw immediately**:

```typescript
getModel(modelName: string): Model {
    if (!this.loaded) {
        throw new Error(`NamespaceCache not loaded for ${this.db}:${this.ns}. loadAll() must be called first.`);
    }
    // ...
}
```

### Model not found

`getModel()` throws if model doesn't exist (cleaner TypeScript, no undefined checks everywhere):

```typescript
getModel(modelName: string): Model {
    if (!this.loaded) { /* throw */ }

    const model = this.models.get(modelName);
    if (!model) {
        throw new Error(`Model '${modelName}' not found in namespace ${this.db}:${this.ns}`);
    }
    return model;
}

// For callers that need to check first:
hasModel(modelName: string): boolean {
    return this.models.has(modelName);
}
```

### Concurrent loadAll() requests (cold tenant)

Use a loading semaphore to prevent duplicate loads:

```typescript
class NamespaceCache {
    private loaded: boolean = false;
    private loading: Promise<void> | null = null;  // Semaphore

    async loadAll(tx: TxContext): Promise<void> {
        // Already loaded
        if (this.loaded) return;

        // Another request is loading - wait for it
        if (this.loading) {
            await this.loading;
            return;
        }

        // First request - do the load
        this.loading = this.doLoadAll(tx);
        try {
            await this.loading;
            this.loaded = true;
        } finally {
            this.loading = null;
        }
    }

    private async doLoadAll(tx: TxContext): Promise<void> {
        // Actual DB queries and cache population
    }
}
```

### Error handling during load

Isolate failures to individual models - don't fail entire tenant:

```typescript
private async doLoadAll(tx: TxContext): Promise<void> {
    const modelRows = await tx.query(`SELECT * FROM models WHERE status IN ('active', 'system') ...`);
    const fieldRows = await tx.query(`SELECT * FROM fields WHERE trashed_at IS NULL ...`);

    // Group fields by model
    const fieldsByModel = new Map<string, any[]>();
    for (const row of fieldRows.rows) {
        const fields = fieldsByModel.get(row.model_name) || [];
        fields.push(row);
        fieldsByModel.set(row.model_name, fields);
    }

    // Build each model, isolating failures
    for (const modelRow of modelRows.rows) {
        try {
            const fields = fieldsByModel.get(modelRow.model_name) || [];
            const model = this.buildModel(modelRow, fields);
            this.models.set(modelRow.model_name, model);
        } catch (error) {
            console.error(`Failed to load model '${modelRow.model_name}'`, { error });
            // Continue loading other models
        }
    }

    this.rebuildRelationships();
}
```

### Relationship rebuild scope

For now, rebuild entire relationships index on any change. Optimize later if needed:

```typescript
private rebuildRelationships(): void {
    this.relationships.clear();

    for (const field of this.fields.values()) {
        if (field.relatedModel && field.relationshipName) {
            const key = `${field.relatedModel}:${field.relationshipName}`;
            const existing = this.relationships.get(key) || [];
            existing.push(field);
            this.relationships.set(key, existing);
        }
    }
}
```

---

## Migration Notes

### SystemContext Changes

Add `namespace` property (bound NamespaceCache instance):

```typescript
interface SystemContext {
    // Existing properties unchanged
    readonly context: Context;
    readonly userId: string;
    readonly options: Readonly<SystemOptions>;
    tx: any;
    readonly database: any;
    readonly describe: any;

    // New: bound namespace cache for this request's db:ns
    readonly namespace: NamespaceCache;

    getUser(): UserInfo;
    isRoot(): boolean;
}
```

The `db` and `ns` values are accessible via `system.namespace.db` and `system.namespace.ns` if needed, but most code just calls `system.namespace.getModel()` directly.

### Observer Migration Guide

Before:
```typescript
const immutableFields = model.getImmutableFields();
if (immutableFields.has(fieldName)) { ... }
```

After:
```typescript
if (model.immutables.has(fieldName)) { ... }
const field = model.immutables.get(fieldName);
```

Before:
```typescript
for (const config of model.getValidationFields()) {
    if (config.required && !value) { ... }
}
```

After:
```typescript
for (const [fieldName, field] of model.requireds) {
    const value = record.get(fieldName);
    if (value === null || value === undefined) { ... }
}
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Multi-tenant data leakage during migration | Phase 2 adds new cache alongside old; validate isolation before switching |
| Observer performance regression | Benchmark before/after Phase 3 |
| Relationship route breakage | Integration tests before Phase 4 cleanup |
| Cache invalidation gaps | Audit all Describe API paths touch invalidation |

---

## Open Questions

1. **Field validation logic**: Keep as data-only (current plan) or add validation methods to Field class later?

2. **Namespace eager load scope**: Load ALL models+fields, or allow lazy loading for rarely-used models?

3. **Cache TTL**: Currently trust-based (invalidate on change). Add time-based refresh as backup?

---

*Generated from Claude Code session, 2025-11-25*
