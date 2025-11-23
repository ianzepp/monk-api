# Car Dealership Management Demo

> **Scenario**: Evaluate Monk API capabilities by building a demo car dealership management application
>
> **Created**: 2025-01-22
> **Status**: In Progress
> **Goal**: Test real-world use of Find API, Aggregate API, relationships, ACLs, and multi-schema operations

## Overview

This scenario demonstrates using the Monk API to build a car dealership management system with inventory tracking, customer management, sales recording, and test drive scheduling.

## Core Features

1. **Inventory Management** - Vehicle listings with search and filtering
2. **Customer Management** - Customer records with preferences and history
3. **Sales Tracking** - Sales records with commission calculations
4. **Test Drive Scheduling** - Appointment management and follow-up
5. **Analytics Dashboard** - Sales metrics, inventory stats, performance reports
6. **Access Control** - Role-based permissions for salespeople vs managers

## Schema Design

### 1. Vehicles (Inventory)

```json
{
  "schema_name": "vehicles",
  "title": "Vehicles",
  "type": "object",
  "required": ["vin", "make", "model", "year", "status", "asking_price"],
  "properties": {
    "vin": {
      "type": "string",
      "description": "Vehicle Identification Number (unique)",
      "maxLength": 17
    },
    "make": {
      "type": "string",
      "description": "Vehicle manufacturer"
    },
    "model": {
      "type": "string",
      "description": "Vehicle model"
    },
    "year": {
      "type": "integer",
      "description": "Model year"
    },
    "trim": {
      "type": "string",
      "description": "Trim level"
    },
    "body_type": {
      "type": "string",
      "description": "sedan, suv, truck, coupe, etc."
    },
    "mileage": {
      "type": "integer",
      "description": "Current mileage"
    },
    "color_exterior": {
      "type": "string"
    },
    "color_interior": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": ["available", "sold", "reserved", "in_service"],
      "default": "available"
    },
    "purchase_price": {
      "type": "number",
      "description": "Dealer purchase price"
    },
    "asking_price": {
      "type": "number",
      "description": "Listed sale price"
    },
    "sale_price": {
      "type": "number",
      "description": "Actual sale price (when sold)"
    },
    "date_acquired": {
      "type": "string",
      "format": "date",
      "description": "Date vehicle acquired by dealer"
    },
    "date_sold": {
      "type": "string",
      "format": "date",
      "description": "Date vehicle sold"
    },
    "features": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Features like leather, sunroof, navigation, etc."
    },
    "photos": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Array of photo URLs (external storage)"
    }
  }
}
```

### 2. Customers

```json
{
  "schema_name": "customers",
  "title": "Customers",
  "type": "object",
  "required": ["name", "email", "phone"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Customer full name"
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "phone": {
      "type": "string"
    },
    "address": {
      "type": "string"
    },
    "city": {
      "type": "string"
    },
    "state": {
      "type": "string",
      "maxLength": 2
    },
    "zip": {
      "type": "string"
    },
    "preferred_contact_method": {
      "type": "string",
      "enum": ["email", "phone", "text"]
    },
    "budget_min": {
      "type": "number",
      "description": "Minimum budget"
    },
    "budget_max": {
      "type": "number",
      "description": "Maximum budget"
    },
    "preferred_types": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Preferred vehicle types: sedan, suv, truck, etc."
    },
    "notes": {
      "type": "string",
      "description": "General notes about customer preferences"
    }
  }
}
```

### 3. Sales

```json
{
  "schema_name": "sales",
  "title": "Sales",
  "type": "object",
  "required": ["vehicle_id", "customer_id", "salesperson_id", "sale_date", "sale_price"],
  "properties": {
    "vehicle_id": {
      "type": "string",
      "description": "Foreign key to vehicles.id (NOTE: x-monk-relationship docs are invalid - see DRIFT.md)"
    },
    "customer_id": {
      "type": "string",
      "description": "Foreign key to customers.id"
    },
    "salesperson_id": {
      "type": "string",
      "description": "Foreign key to users.id"
    },
    "sale_date": {
      "type": "string",
      "format": "date",
      "description": "Date of sale"
    },
    "sale_price": {
      "type": "number",
      "description": "Final sale price"
    },
    "financing_type": {
      "type": "string",
      "enum": ["cash", "loan", "lease"]
    },
    "commission_rate": {
      "type": "number",
      "description": "Commission percentage (0.03 = 3%)"
    },
    "commission_amount": {
      "type": "number",
      "description": "Calculated commission amount"
    },
    "trade_in_vehicle": {
      "type": "string",
      "description": "Description of trade-in vehicle if applicable"
    },
    "trade_in_value": {
      "type": "number",
      "description": "Trade-in allowance"
    },
    "notes": {
      "type": "string"
    }
  }
}
```

### 4. Test Drives

```json
{
  "schema_name": "test_drives",
  "title": "Test Drives",
  "type": "object",
  "required": ["vehicle_id", "customer_id", "scheduled_date"],
  "properties": {
    "vehicle_id": {
      "type": "string",
      "description": "Foreign key to vehicles.id"
    },
    "customer_id": {
      "type": "string",
      "description": "Foreign key to customers.id"
    },
    "salesperson_id": {
      "type": "string",
      "description": "Foreign key to users.id"
    },
    "scheduled_date": {
      "type": "string",
      "format": "date-time",
      "description": "Scheduled appointment time"
    },
    "actual_date": {
      "type": "string",
      "format": "date-time",
      "description": "Actual test drive time"
    },
    "status": {
      "type": "string",
      "enum": ["scheduled", "completed", "cancelled", "no_show"],
      "default": "scheduled"
    },
    "customer_notes": {
      "type": "string",
      "description": "Customer feedback about test drive"
    },
    "salesperson_notes": {
      "type": "string",
      "description": "Salesperson observations"
    }
  }
}
```

## Key Use Cases & Queries

### 1. Inventory Search

**Find available SUVs under $40k with low mileage:**

```bash
POST /api/find/vehicles
{
  "where": {
    "status": "available",
    "body_type": "suv",
    "asking_price": {"$lte": 40000},
    "mileage": {"$lte": 50000}
  },
  "order": ["asking_price asc"],
  "limit": 20
}
```

### 2. Sales Dashboard

**Monthly sales metrics by salesperson:**

```bash
POST /api/aggregate/sales
{
  "where": {
    "sale_date": {"$gte": "2025-01-01", "$lte": "2025-01-31"}
  },
  "aggregate": {
    "total_sales": {"$count": "*"},
    "total_revenue": {"$sum": "sale_price"},
    "avg_sale_price": {"$avg": "sale_price"},
    "total_commission": {"$sum": "commission_amount"}
  },
  "groupBy": ["salesperson_id"]
}
```

### 3. Inventory Analytics

**Average days in inventory by make/model:**

```bash
POST /api/aggregate/vehicles
{
  "where": {
    "status": "sold"
  },
  "aggregate": {
    "vehicles_sold": {"$count": "*"},
    "avg_sale_price": {"$avg": "sale_price"},
    "avg_profit": {"$avg": "sale_price - purchase_price"}
  },
  "groupBy": ["make", "model"]
}
```

### 4. Customer Follow-up (Test Drives → No Sale)

**Multi-step query to find customers who test drove but didn't buy:**

```javascript
// Step 1: Find completed test drives from 30+ days ago
const testDrives = await MonkApiFind("test_drives", {
  where: {
    status: "completed",
    actual_date: {"$lte": "2024-12-23"}  // 30 days ago
  },
  select: ["customer_id", "vehicle_id", "actual_date"]
});

// Step 2: Find sales for those customers
const sales = await MonkApiFind("sales", {
  where: {
    customer_id: {"$in": testDrives.map(td => td.customer_id)}
  },
  select: ["customer_id", "sale_date"]
});

// Step 3: Client-side diff to find non-buyers
const nonBuyers = testDrives.filter(td =>
  !sales.some(s => s.customer_id === td.customer_id)
);

// Step 4: Fetch customer details for follow-up
const customers = await MonkApiData("GET", "customers", {
  where: {
    id: {"$in": nonBuyers.map(nb => nb.customer_id)}
  }
});
```

### 5. Vehicle Relationship Queries

**NOTE:** The relationship implementation differs from documentation. See DRIFT.md for details.

```bash
# Get vehicle details
GET /api/data/vehicles/{vehicle_id}

# Get sales for specific vehicle (requires client-side join)
POST /api/find/sales
{
  "where": {
    "vehicle_id": "{vehicle_id}"
  }
}

# Get test drives for specific vehicle (requires client-side join)
POST /api/find/test_drives
{
  "where": {
    "vehicle_id": "{vehicle_id}"
  }
}
```

## Access Control Strategy

### Salesperson Role
- **access_read**: Own sales, all vehicles, all customers
- **access_edit**: Own sales, own test_drives
- **access_full**: None

### Manager Role
- **access_read**: All records
- **access_edit**: All records
- **access_full**: All records

**Implementation via ACLs:**

```bash
# Create sale with ACL
POST /api/data/sales
{
  "vehicle_id": "...",
  "customer_id": "...",
  "salesperson_id": "user_salesperson_123",
  "sale_price": 35000,
  "access_read": ["user_salesperson_123", "group_managers", "group_salespeople"],
  "access_edit": ["user_salesperson_123", "group_managers"],
  "access_full": ["group_managers"]
}
```

**NOTE:** ACLs API is untested according to DRIFT.md. Use with caution.

## Known Limitations & Workarounds

### 1. Relationships

**Issue:** `x-monk-relationship` documentation is invalid (see DRIFT.md)

**Workaround:** Use foreign key fields and manual joins via Find API

```javascript
// Get vehicle with sales history
const vehicle = await getData("vehicles", vehicleId);
const sales = await findRecords("sales", {
  where: { vehicle_id: vehicleId }
});
const result = { ...vehicle, sales };
```

### 2. Computed Fields

**Issue:** No computed columns (e.g., days_in_inventory, profit_margin)

**Workaround:** Calculate client-side or use Aggregate API

```javascript
// Client-side calculation
const daysInInventory = differenceInDays(
  new Date(),
  new Date(vehicle.date_acquired)
);

// Or use Aggregate API for reports
POST /api/aggregate/vehicles
{
  "aggregate": {
    "avg_days_in_inventory": {"$avg": "EXTRACT(DAY FROM (NOW() - date_acquired))"}
  }
}
```

### 3. Subqueries

**Issue:** No subquery support (e.g., "customers who test drove but didn't buy")

**Workaround:** Multiple Find API calls + client-side filtering (see example above)

### 4. File Storage

**Issue:** No binary file uploads

**Workaround:** Use external service (Cloudinary, S3, Imgur) and store URLs

```json
{
  "photos": [
    "https://res.cloudinary.com/demo/image/upload/v1234/vehicle1.jpg",
    "https://res.cloudinary.com/demo/image/upload/v1234/vehicle2.jpg"
  ]
}
```

## API Features Evaluated

| Feature | API Used | Status | Notes |
|---------|----------|--------|-------|
| **CRUD Operations** | Data API | ✅ Expected to work | Basic create/read/update/delete |
| **Complex Filtering** | Find API | ✅ Expected to work | 25+ operators, tested extensively |
| **Aggregations** | Aggregate API | ✅ Expected to work | COUNT, SUM, AVG, GROUP BY |
| **Relationships** | Data API | ⚠️ Documentation invalid | Manual joins required, see DRIFT.md |
| **Access Control** | ACLs API | ⚠️ Untested | Use cautiously, may have issues |
| **Soft Deletes** | All APIs | ✅ Expected to work | Context-aware filtering |
| **Audit Trails** | History API | ✅ Expected to work | Not tested in this scenario |

## Expected Challenges

1. **Relationship Complexity**: Multiple API calls needed for joins
2. **ACL Testing**: First real test of ACLs API
3. **Aggregate Limitations**: No nested aggregations (can't do AVG(SUM(x)))
4. **Client-Side Logic**: More business logic in client vs database

## Success Criteria

- ✅ Create all 4 schemas successfully
- ✅ Populate realistic test data
- ✅ Demonstrate inventory search with multiple filters
- ✅ Generate sales dashboard with aggregations
- ✅ Show relationship queries (even if manual)
- ⚠️ Test ACL permissions (expect issues)
- ✅ Document any API bugs or drift from documentation

## Files Generated

- `scenarios/DEALERSHIP.md` (this file)
- Test data fixtures (if created)
- Query examples and results

## Next Steps

1. Create demo tenant: `acme-auto-dealership`
2. Define and create schemas
3. Populate test data
4. Execute queries and document results
5. Update DRIFT.md with any new findings

---

**Version**: 1.0
**Last Updated**: 2025-01-22
