# POST /api/aggregate/:model

Run an aggregation query against a model.

This is the full aggregation endpoint. Use `GET /api/aggregate/:model` for shorthand
one-function queries, and use this page when you need multiple aggregations or `groupBy`.

## Docs Path

- Live route: `POST /api/aggregate/:model`
- Docs page: `/docs/api/aggregate/model/POST`

## Path Parameters

- `:model` — target model name

## Authentication

Requires a valid JWT bearer token.

```bash
Authorization: Bearer <token>
```

## Request Body

```json
{
  "where": {
    "status": "active"
  },
  "aggregate": {
    "total_count": {"$count": "*"},
    "total_revenue": {"$sum": "amount"},
    "avg_amount": {"$avg": "amount"},
    "min_amount": {"$min": "amount"},
    "max_amount": {"$max": "amount"},
    "distinct_users": {"$distinct": "user_id"}
  },
  "groupBy": ["country", "status"],
  "trashed": "exclude"
}
```

### Supported fields

- `where` — filter object, same shape as the Find API
- `aggregate` — object of named aggregations
- `groupBy` — string or array of strings
- `trashed` — one of `exclude`, `include`, or `only`

### Supported aggregation functions

- `$count` — count records or non-null field values
- `$sum` — sum numeric values
- `$avg` — average numeric values
- `$min` — minimum value
- `$max` — maximum value
- `$distinct` — count distinct values

## Request Examples

### Count rows

```json
{
  "aggregate": {
    "total": {"$count": "*"}
  }
}
```

### Sum and average by status

```json
{
  "where": {"status": "paid"},
  "aggregate": {
    "orders": {"$count": "*"},
    "revenue": {"$sum": "amount"},
    "avg_order": {"$avg": "amount"}
  },
  "groupBy": ["status"]
}
```

### Distinct count by day

```json
{
  "where": {
    "created_at": {"$gte": "2024-01-01"}
  },
  "aggregate": {
    "active_users": {"$distinct": "user_id"},
    "total_actions": {"$count": "*"}
  },
  "groupBy": ["DATE_TRUNC('day', created_at)"]
}
```

## Response

```json
{
  "success": true,
  "data": [
    {
      "country": "US",
      "status": "active",
      "total_count": 45,
      "total_revenue": 125000.5,
      "avg_amount": 2777.79,
      "min_amount": 10,
      "max_amount": 5000,
      "distinct_users": 31
    }
  ]
}
```

## Notes

- This endpoint executes through the database aggregate pipeline.
- `trashed` is handled in the request body, not the URL.
- If `aggregate` is missing or empty, the request is rejected.
- If `groupBy` is provided, it may be a string or an array of strings.
- `data` is not used by this endpoint.

## Related docs

- [Aggregate API overview](../PUBLIC.md)
- [GET /api/aggregate/:model](../GET.md)
- [Bulk API](../../bulk/PUBLIC.md)
