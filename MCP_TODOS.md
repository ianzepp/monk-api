# MCP Tool Improvement Suggestions

Based on real-world usage with the firearms inventory database project.

## What Works Well

1. **TOON format** - The compact response format is efficient and readable
2. **Bulk operations** - Full support for batch create, update, delete, and aggregation via `/api/bulk`
   - `create-all` - Batch inserts
   - `update-all` - Batch updates by ID
   - `update-any` - Batch updates by filter
   - `delete-all` / `delete-any` - Batch deletes
   - `aggregate` - Aggregations within bulk transactions
3. **Simple CRUD paths** - `/api/data/{model}` and `/api/data/{model}/{id}` are intuitive
4. **Aggregation API** - Full support for `$sum`, `$avg`, `$count`, `$min`, `$max` with `groupBy` via `/api/aggregate/:model`
5. **History API** - Change tracking available via `/api/history/:model/:record`
6. **Find API** - Advanced filtering with 25+ operators via `POST /api/find/:model`

## Suggestions for Improvement

### 1. Partial field updates (PATCH)
Currently PUT works, but PATCH semantics would be clearer for single-field updates

### 2. Query filters on GET
Being able to filter directly on GET requests:
```
GET /api/data/firearms?firearm_type=rifle&msrp_gt=1000
```
(Note: POST /api/find/:model supports this, but GET shorthand would be convenient)

### 3. Upsert support
For syncing data, an upsert operation (insert or update if exists) based on a unique field would be handy.
(Note: Currently returns 422 `OPERATION_UNSUPPORTED`)

---

## Priority Assessment

| Feature | Impact | Use Case |
|---------|--------|----------|
| PATCH | Low | Cleaner semantics, minor improvement |
| GET filters | Low | Convenience (POST /api/find already works) |
| Upsert | Low | Data sync scenarios |

---

## Session Learnings

During this session, I made 32 individual PUT calls to update firearm MSRP values when I could have used a single bulk request:

```json
POST /api/bulk
{
  "operations": [{
    "operation": "update-all",
    "model": "firearms",
    "data": [
      {"id": "abc", "msrp": 500},
      {"id": "def", "msrp": 600}
    ]
  }]
}
```

**Lesson**: Check `/docs/api/bulk` before doing repetitive operations.

---

## Code TODOs

### Describe API field routes - use ModelCache for lookups

**Files:**
- `src/routes/api/describe/:model/fields/:field/PUT.ts`
- `src/routes/api/describe/:model/fields/PUT.ts` (bulk, currently disabled)

**Issue:** Single field PUT uses `system.describe.fields.update404()` which queries the DB by `model_name` + `field_name` to find the field ID. This is inefficient since the ModelCache already has all field metadata (including IDs) loaded via `_fields`.

**Fix:**
1. Get model from cache: `ModelCache.getInstance().getModel(system, model)`
2. Find field in `model._fields` by `field_name`
3. Use `updateOne(id, body)` directly with the cached ID

**Applies to:**
- Single field PUT - avoid DB lookup per request
- Bulk field PUT - enable the route by mapping `field_name` → `id` from cache, then call `updateAll`

---

*Generated from Claude Code session, 2025-11-24*
