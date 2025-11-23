# Aggregate API

## POST /api/aggregate/:model

Perform aggregation queries with optional GROUP BY support.

### Request Body

```json
{
  "where": {
    "status": "active"
  },
  "aggregate": {
    "total_count": { "$count": "*" },
    "total_revenue": { "$sum": "amount" },
    "avg_amount": { "$avg": "amount" },
    "min_amount": { "$min": "amount" },
    "max_amount": { "$max": "amount" }
  },
  "groupBy": ["country", "status"]
}
```

### Supported Aggregation Functions

- `$count` - Count records (use "*" for all records or field name for non-null values)
- `$sum` - Sum numeric values
- `$avg` - Average of numeric values  
- `$min` - Minimum value
- `$max` - Maximum value
- `$distinct` - Count distinct values

### Examples

**Simple count:**
```json
{
  "aggregate": {
    "total": { "$count": "*" }
  }
}
```

**Multiple aggregations with filter:**
```json
{
  "where": { "status": "paid" },
  "aggregate": {
    "order_count": { "$count": "*" },
    "total_revenue": { "$sum": "amount" },
    "avg_order": { "$avg": "amount" }
  }
}
```

**Group by with aggregations:**
```json
{
  "where": { "created_at": { "$gte": "2024-01-01" } },
  "aggregate": {
    "orders": { "$count": "*" },
    "revenue": { "$sum": "amount" }
  },
  "groupBy": ["country"]
}
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "country": "US",
      "orders": 450,
      "revenue": 125000.50
    },
    {
      "country": "UK",
      "orders": 230,
      "revenue": 67500.25
    }
  ]
}
```
