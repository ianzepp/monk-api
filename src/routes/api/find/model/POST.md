# POST /api/find/:model

Run a structured query against a model.

This is the primary Find API endpoint.
It accepts a JSON filter body and returns matching records.

## Docs Path

- Live route: `POST /api/find/:model`
- Docs page: `/docs/api/find/model/POST`
- Saved-filter route: `GET /api/find/:model/:target`

## Request Shape

```json
{
  "select": ["name", "email"],
  "where": {
    "status": "active"
  },
  "order": ["created_at desc"],
  "limit": 50,
  "offset": 0,
  "trashed": "exclude",
  "count": false,
  "includeTotal": false
}
```

### Supported top-level fields

- `select` — array of fields to return
- `where` — filter object
- `order` — array of sort expressions
- `limit` — maximum rows to return
- `offset` — number of rows to skip
- `trashed` — one of `exclude`, `include`, `only`
- `count` — if `true`, also compute the total row count
- `includeTotal` — alias for `count`

### Important behavior

- `trashed` is read from the **request body**, not the URL query string.
- `deleted_at IS NOT NULL` rows are never returned through the API.
- `count=true` or `includeTotal=true` returns `{ data, total }`.

## Filter Format

### Exact match

```json
{
  "where": {
    "status": "active"
  }
}
```

### Comparison operators

```json
{
  "where": {
    "age": {"$gte": 18},
    "score": {"$gt": 100},
    "price": {"$between": [10, 100]},
    "rating": {"$lte": 5}
  }
}
```

### Set and array operators

```json
{
  "where": {
    "status": {"$in": ["active", "pending"]},
    "role": {"$nin": ["banned", "deleted"]},
    "tags": {"$all": ["urgent", "review"]},
    "access_read": {"$any": ["user-123"]},
    "permissions": {"$size": {"$gte": 3}}
  }
}
```

### Pattern and search operators

```json
{
  "where": {
    "email": {"$like": "%@example.com"},
    "name": {"$ilike": "%smith%"},
    "title": {"$regex": "^Admin"},
    "description": {"$search": "platform"}
  }
}
```

### Logical operators

```json
{
  "where": {
    "$and": [
      {"department": "engineering"},
      {"role": "senior"}
    ],
    "$or": [
      {"status": "active"},
      {"status": "pending"}
    ],
    "$not": {
      "trashed_at": null
    }
  }
}
```

### Nested object filters

```json
{
  "where": {
    "metadata": {
      "tier": "premium"
    },
    "profile": {
      "region": "us-west"
    }
  }
}
```

## Select, Order, Limit, Offset

### Select specific fields

```json
{
  "select": ["id", "name", "email"]
}
```

### Sort multiple fields

```json
{
  "order": ["priority desc", "created_at asc"]
}
```

### Paginate

```json
{
  "limit": 25,
  "offset": 50
}
```

## Trashed Modes

```json
{
  "trashed": "exclude"
}
```

Valid values:

- `exclude` — return active rows only
- `include` — return active and trashed rows
- `only` — return trashed rows only

## Count Mode

When either `count` or `includeTotal` is `true`, the response includes a `total` field.

```json
{
  "count": true,
  "where": {"status": "active"}
}
```

Response shape:

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "name": "..."
    }
  ],
  "total": 42
}
```

## Examples

### Basic search

```bash
curl -X POST http://localhost:9001/api/find/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "where": {"status": "active"},
    "order": ["created_at desc"],
    "limit": 25
  }'
```

### Search with select and pagination

```bash
curl -X POST http://localhost:9001/api/find/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "select": ["id", "name", "email"],
    "where": {
      "$and": [
        {"status": {"$in": ["active", "pending"]}},
        {"email": {"$like": "%@example.com"}}
      ]
    },
    "order": ["created_at desc"],
    "limit": 50,
    "offset": 0,
    "count": true
  }'
```

### ACL-aware search

```bash
curl -X POST http://localhost:9001/api/find/documents \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "where": {
      "$and": [
        {"access_read": {"$any": ["user-123"]}},
        {"$or": [
          {"priority": {"$gte": 8}},
          {"tags": {"$all": ["urgent"]}}
        ]}
      ]
    },
    "trashed": "exclude"
  }'
```

### Show trashed rows only

```bash
curl -X POST http://localhost:9001/api/find/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "trashed": "only",
    "where": {"status": "inactive"}
  }'
```

## Saved Filters

If you want to re-run a saved filter instead of sending the whole `where` object each time, use:

- `GET /api/find/:model/:target`

Where `:target` is either:
- a UUID saved-filter ID
- a saved-filter name

## Related docs

- [Find API overview](../PUBLIC.md)
- [Saved filter docs](../:target/GET.md)
- [Collection-level stub](../../POST.md)
