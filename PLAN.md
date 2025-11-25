# Plan: Invert Observer Pipeline to Single-Record Processing

## Summary

Refactor the observer pipeline from batch-oriented (`context.data: ModelRecord[]`) to single-record oriented (`context.record: ModelRecord`). The outer loop moves from individual observers up to `ObserverRunner`, eliminating redundant iteration and simplifying observer logic.

Additionally, remove `select` from the observer pipeline entirely - selects bypass the pipeline and go directly through `Database.selectAny()`.

## Motivation

1. **Redundant looping** - Every observer currently loops over `context.data[]` internally
2. **SQL observers are already row-by-row** - `SqlCreateObserver` does N individual INSERTs, not batch INSERT
3. **Most API operations are single-record** - Bulk operations are the exception, not the rule
4. **Simpler observer code** - No more `for (const record of data)` boilerplate
5. **Cross-record observers are redundant** - Database constraints handle uniqueness better
6. **Select doesn't fit the model** - Selects produce records, they don't process input records

## Design

### Write Operations (create/update/delete/revert/access)

```
Database.createAll(records[])
  → Preload existing records (for update/delete/revert) - BEFORE pipeline
  → ObserverRunner.execute(system, operation, model, records[])
      → results = []
      → errors = []
      → for (record of records):
          → context = { system, operation, model, record, recordIndex, errors: [], warnings: [] }
          → for (ring of relevantRings):
              → for (observer of getObservers(model, ring)):
                  → observer.execute(context)
              → if (ring < 5 && context.errors.length > 0):
                  → collect errors with recordIndex, break record loop
          → if (context.errors.length === 0):
              → results.push(context.record.toObject())
      → if (errors.length > 0): throw aggregated error
      → return results
```

### Select Operations (no pipeline)

```
Database.selectAny(modelName, filter, options)
  → Build filter with soft-delete options
  → TODO: Inject ACL conditions into filter (access_read check)
  → Execute SQL directly via Filter.toSQL()
  → Convert PostgreSQL types
  → Return results
```

Select-specific concerns (ACL filtering, type unmapping for fields model) will be handled directly in `Database.selectAny()` or the `Filter` class, not via observers.

### Error Semantics

- Validation errors (rings 0-4) collected per-record with index
- If ANY record fails validation, entire batch fails before Ring 5 (database)
- No partial writes - all or nothing
- Error messages include record index: "record[3]: field 'email' is required"

### Interface Changes

**ObserverContext** (src/lib/observers/interfaces.ts):
```typescript
// Before
interface ObserverContext {
    data?: ModelRecord[];  // Array of records
    // ...
}

// After
interface ObserverContext {
    record: ModelRecord;    // Single record being processed
    recordIndex: number;    // Index in original batch (for error messages)
    // ...
}
```

**BaseObserver** (src/lib/observers/base-observer.ts):
```typescript
// Before
async execute(context: ObserverContext): Promise<void> {
    for (const record of context.data) {
        await this.executeOne(record, context);
    }
}

// After
async execute(context: ObserverContext): Promise<void> {
    // Direct single-record logic, no loop needed
    // Subclasses override this directly
}

// Remove executeOne() - no longer needed
```

## Files to Modify

### Phase 1: Core Infrastructure

1. **src/lib/observers/interfaces.ts**
   - Change `data?: ModelRecord[]` to `record: ModelRecord`
   - Add `recordIndex: number`
   - Remove `filter?: any` (unused in write operations)

2. **src/lib/observers/runner.ts**
   - Move record loop from observers into `execute()`
   - Create per-record context
   - Aggregate errors with record indices
   - Handle early termination on validation failure

3. **src/lib/observers/base-observer.ts**
   - Remove default `execute()` loop implementation
   - Remove `executeOne()` method
   - Update helper methods to work with `context.record`

### Phase 2: Update All Observers (src/observers/**)

Each observer changes from:
```typescript
async execute(context: ObserverContext): Promise<void> {
    const { data } = context;
    if (!data || data.length === 0) return;

    for (const record of data) {
        // validation logic
    }
}
```

To:
```typescript
async execute(context: ObserverContext): Promise<void> {
    const { record } = context;
    // validation logic directly on record
}
```

**Observers to update:**

Ring 0 (Setup):
- [ ] all/0/05-external-model-guard.ts (remove 'select' from operations)
- [ ] all/0/10-record-preloader.ts (REMOVE - move logic to Database class)
- [ ] all/0/50-update-merger.ts

Ring 1 (Input Validation):
- [ ] all/1/10-frozen-validator.ts
- [ ] all/1/20-model-sudo-validator.ts
- [ ] all/1/25-field-sudo-validator.ts
- [ ] all/1/30-immutable-validator.ts
- [ ] all/1/40-data-validator.ts
- [ ] fields/1/10-system-model.ts
- [ ] fields/1/50-default-value-type-checker.ts
- [ ] fields/1/50-field-name-validator.ts
- [ ] models/1/10-system-model.ts
- [ ] models/1/50-model-name-validator.ts
- [ ] users/1/50-email-validation.ts

Ring 2 (Access Control):
- [ ] all/2/50-existence-validator.ts
- [ ] all/2/50-soft-delete-protector.ts

Ring 3 (Business Logic):
- [ ] fields/3/50-duplicate-field-checker.ts (may be removable - DB constraint)
- [ ] fields/3/50-relationship-model-checker.ts
- [ ] models/3/50-duplicate-model-checker.ts (may be removable - DB constraint)
- [ ] models/3/50-system-table-protector.ts

Ring 4 (Transform):
- [ ] all/4/50-transform-processor.ts
- [ ] all/4/50-uuid-array-processor.ts
- [ ] fields/4/90-type-mapper.ts

Ring 5 (Database):
- [ ] all/5/50-sql-access-observer.ts
- [ ] all/5/50-sql-create-observer.ts
- [ ] all/5/50-sql-delete-observer.ts
- [ ] all/5/50-sql-revert-observer.ts
- [ ] all/5/50-sql-select-observer.ts (REMOVE - selects bypass pipeline)
- [ ] all/5/50-sql-update-observer.ts

Ring 6 (Post-DB Transform):
- [ ] fields/6/10-ddl-create.ts
- [ ] fields/6/10-ddl-delete.ts
- [ ] fields/6/10-ddl-update.ts
- [ ] fields/6/20-ddl-indexes.ts
- [ ] fields/6/80-type-unmapper.ts (remove 'select' from operations)
- [ ] models/6/10-ddl-create.ts
- [ ] models/6/10-ddl-delete.ts
- [ ] models/6/10-ddl-update.ts

Ring 7 (Side Effects):
- [ ] all/7/60-history-tracker.ts

Ring 8 (Cache):
- [ ] all/8/50-cache-invalidator.ts
- [ ] fields/8/50-field-cache-invalidator.ts
- [ ] models/8/50-model-cache-invalidator.ts

Ring 9 (Async): (none currently)

### Phase 3: FieldTypeMapper Utility

4. **src/lib/field-type-mapper.ts** (NEW FILE)
   ```typescript
   export class FieldTypeMapper {
       private static readonly USER_TO_PG: Record<string, string> = {
           'decimal': 'numeric',
           'decimal[]': 'numeric[]',
       };

       private static readonly PG_TO_USER: Record<string, string> = {
           'numeric': 'decimal',
           'numeric[]': 'decimal[]',
       };

       /** Map user-facing type to PostgreSQL type (for writes) */
       static toPg(userType: string): string {
           return this.USER_TO_PG[userType] || userType;
       }

       /** Map PostgreSQL type to user-facing type (for reads) */
       static toUser(pgType: string): string {
           return this.PG_TO_USER[pgType] || pgType;
       }
   }
   ```

5. **Update type-mapper.ts (Ring 4)** - Use `FieldTypeMapper.toPg()`

6. **Update type-unmapper.ts (Ring 6)** - Use `FieldTypeMapper.toUser()`

### Phase 4: Database Class Changes

7. **src/lib/database.ts**
   - Move record preloading from observer to `runObserverPipeline()` (before pipeline)
   - In `selectAny()`: call `FieldTypeMapper.toUser()` for 'fields' model
   - Add TODO comment in `selectAny()` for future ACL filtering
   - Runner handles the record loop internally
   - No changes to public API (`createAll`, `updateAll`, etc.)

### Phase 5: Remove Select from Pipeline

8. **src/lib/observers/types.ts**
   - Remove `'select'` from `OperationType`
   - Remove `'select'` entry from `RING_OPERATION_MATRIX`

9. **Delete observers**
   - Delete `src/observers/all/5/50-sql-select-observer.ts`
   - Delete `src/observers/all/0/10-record-preloader.ts` (logic moves to Database)

10. **Update observers that reference select**
    - `all/0/05-external-model-guard.ts` - remove 'select' from operations
    - `fields/6/80-type-unmapper.ts` - remove 'select' from operations

### Phase 6: Cleanup

11. **Remove redundant observers**
    - Evaluate `duplicate-field-checker.ts` - likely removable if DB has unique constraint
    - Evaluate `duplicate-model-checker.ts` - likely removable if DB has unique constraint

## Testing Strategy

1. Run existing test suite after each phase
2. Pay special attention to:
   - Bulk insert/update operations
   - Validation error messages (should include record index)
   - Transaction rollback on partial failure
   - DDL observers (model/field creation)

## Rollback Plan

Each phase can be rolled back independently. The key files to preserve before starting:
- src/lib/observers/runner.ts
- src/lib/observers/base-observer.ts
- src/lib/observers/interfaces.ts

## Resolved Questions

1. **sql-select-observer.ts** - RESOLVED: Remove entirely. Selects bypass the pipeline and go through `Database.selectAny()` directly.

2. **Record preloading** - RESOLVED: Move to Database class before pipeline. Single batch query preserved, pipeline stays single-record.

3. **ACL for selects** - RESOLVED: TODO in `Database.selectAny()` or `Filter` class. Not an observer concern.

4. **Type unmapping for fields model on select** - RESOLVED: Create `FieldTypeMapper` utility class with `toPg()` and `toUser()` static methods. Called directly in `Database.selectAny()` for 'fields' model, and used by the Ring 4/6 observers for write operations.

## Open Questions

1. **History tracker batching** - RESOLVED: Keep 1-by-1 INSERTs for initial implementation. See "Future Improvements" for PostOps pattern.

2. **Error message format** - RESOLVED: Keep existing structured format (`{ message, code, field }`), add `record` (recordIndex) to each error object. Runner attaches `recordIndex` to errors as they're collected.

---

## Future Improvements (Optional)

### PostOps Pattern for Batched Side Effects

After the single-record refactor is complete, consider adding a PostOps accumulator for observers that generate additional database operations (history tracking, cascade operations, webhook-triggered writes, etc.).

**Design:**

```typescript
interface ObserverContext {
    record: ModelRecord;
    recordIndex: number;
    // ... existing fields ...

    // NEW: Accumulated operations to execute after main pipeline
    postOps: PendingOperation[];
}

interface PendingOperation {
    operation: OperationType;
    model: string;
    data: Record<string, any>;
}
```

**Flow:**

```
ObserverRunner.execute(records[])
  → for (record of records):
      → run all rings for record
      → accumulate postOps from context
  → if (no errors):
      → aggregate postOps by model
      → for (model of postOpsModels):
          → recursively execute batched postOps (depth + 1)
          → respects SQL_MAX_RECURSION limit
  → return results
```

**Benefits:**
- History tracker adds to `postOps` instead of executing immediately
- All history rows for a batch become one multi-row INSERT
- Transactional consistency preserved (same tx)
- Reusable for cascade deletes, webhook-triggered writes, etc.
- Follows existing Bulk API operation pattern

**Example - History Tracker with PostOps:**

```typescript
// Before (current): immediate INSERT per field change
await system.database.createOne('history', historyRecord);

// After (with PostOps): accumulate for batch execution
context.postOps.push({
    operation: 'create',
    model: 'history',
    data: historyRecord
});
```

This is a non-breaking enhancement that can be added after the core single-record refactor is stable.
