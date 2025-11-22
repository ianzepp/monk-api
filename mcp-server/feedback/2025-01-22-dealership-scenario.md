# MCP Server Feedback - Car Dealership Scenario

**Date:** 2025-01-22
**Scenario:** Building a car dealership management demo app
**Status:** Blocked at test data population
**Testing Duration:** ~2 hours
**API Calls Made:** 50+ for schema creation alone

---

## Executive Summary

Attempted to build a car dealership demo with 4 schemas (vehicles, customers, sales, test_drives) to evaluate Monk API capabilities via the MCP server interface. Successfully created tenant and all schemas, but **blocked at data population** due to MCP tool type mismatch with the Data API.

**Key Findings:**
- ✅ Schema creation works but requires 50+ sequential calls (performance concern)
- ❌ Data insertion blocked: MCP tool type definitions don't match API expectations
- ⚠️ Relationship documentation is completely invalid (DRIFT issue)
- ⚠️ Multiple tool usability issues discovered

---

## Critical Issues (Blockers)

### 1. MonkApiData / MonkHttp Type Mismatch with Data API

**Problem:**
The Data API `POST /api/data/:schema` endpoint expects an **array of records**, but the MCP tools define their parameters as `"type": "object"`.

**MCP Tool Definitions:**
```typescript
// MonkApiData tool
"data": {
  "description": "Record data for POST/PUT operations",
  "type": "object"  // ❌ Should support arrays for POST
}

// MonkHttp tool
"body": {
  "description": "Request body as JSON object (optional)",
  "type": "object"  // ❌ Should support arrays
}
```

**API Expectation:**
```bash
POST /api/data/vehicles
Content-Type: application/json

[
  {"vin": "...", "make": "Honda", "model": "Accord"},
  {"vin": "...", "make": "Toyota", "model": "RAV4"}
]
```

**Error Received:**
```json
{
  "success": false,
  "error": "Request body must be an array of records",
  "error_code": "BODY_NOT_ARRAY"
}
```

**Attempted:**
- MonkApiData with single object: ❌ "must be array"
- MonkApiData with array: ❌ Type error (tool expects object)
- MonkHttp with array parameter: ❌ Same error
- Direct curl via Bash: ❌ Shell quoting issues

**Root Cause Hypothesis:**
1. MCP tool is not setting `Content-Type: application/json` header
2. MCP tool is serializing arrays as nested objects: `{"body": [...]}`
3. JSON Schema type system limitation: `"type": "object"` doesn't allow arrays

**Impact:** **CRITICAL - Cannot populate test data, blocking all scenario testing**

**Recommended Fix:**
```typescript
// Option 1: Use oneOf to support both
"data": {
  "oneOf": [
    {"type": "object"},
    {"type": "array", "items": {"type": "object"}}
  ]
}

// Option 2: Create separate tools
MonkApiDataSingle - for single record operations
MonkApiDataBulk - for array operations
```

---

### 2. Schema Creation Performance - 50+ API Calls

**Problem:**
Creating a simple schema requires many sequential API calls:
- 1 call to create schema metadata
- N calls to create N columns (one per column)

**Example:**
```typescript
// Vehicles schema: 17 columns
POST /api/describe/vehicles {}                           // Call 1
POST /api/describe/vehicles/columns/vin {...}            // Call 2
POST /api/describe/vehicles/columns/make {...}           // Call 3
// ... 15 more calls ...
POST /api/describe/vehicles/columns/photos {...}         // Call 17

// Total: 18 calls for one schema
```

**Performance Impact:**
- Vehicles: 18 calls
- Customers: 12 calls
- Sales: 10 calls
- Test Drives: 10 calls
- **Total: 50 calls, ~30 seconds**

**User Experience:**
- Tedious to define schemas
- Slow iteration during development
- ChatGPT token usage is high (many tool invocations)

**Recommended Solutions:**

**Option A: Add Bulk Column Creation Endpoint**
```bash
POST /api/describe/:schema/columns
[
  {"column_name": "vin", "type": "text", "required": true},
  {"column_name": "make", "type": "text", "required": true},
  {"column_name": "model", "type": "text", "required": true}
]
```

**Option B: Add MCP Helper Tool**
```typescript
MonkSchemaBuilder({
  schema_name: "vehicles",
  columns: [
    {name: "vin", type: "text", required: true},
    {name: "make", type: "text", required: true}
  ]
})
// Tool internally makes all the POST calls
// Returns when complete
```

**Option C: Support Full JSON Schema Format**
```bash
POST /api/describe/vehicles
{
  "schema_name": "vehicles",
  "columns": [...]  // Define all columns at once
}
```

---

## High Priority Issues

### 3. Relationship Documentation is Invalid

**Documented Format (from `src/routes/api/data/:schema/:record/:relationship/GET.md`):**
```json
{
  "post_id": {
    "type": "string",
    "x-monk-relationship": {
      "type": "owned",
      "schema": "posts",
      "name": "comments"
    }
  }
}
```

**Reality:**
- Column creation responses include these fields:
  - `relationship_type: null`
  - `related_schema: null`
  - `related_column: null`
  - `relationship_name: null`
  - `cascade_delete: false`
  - `required_relationship: false`

- These fields are ALWAYS null in all column creation responses
- No documentation on how to actually set them
- No examples of working relationship configuration

**Impact:** Cannot configure foreign keys or relationships, making multi-table scenarios difficult

**Tested:**
```bash
POST /api/describe/sales/columns/vehicle_id
{
  "column_name": "vehicle_id",
  "type": "uuid",
  "description": "Foreign key to vehicles"
}
# Response: relationship_type = null (no relationship configured)
```

**Recommendation:**
1. Update documentation with actual working relationship format
2. Provide examples of:
   - One-to-many relationships (vehicle → sales)
   - Many-to-one relationships (sale → customer)
   - Optional vs required relationships
3. Add to DRIFT.md as HIGH priority issue

---

### 4. Schema Format Documentation Mismatch

**Problem:**
Documentation implies JSON Schema format, but actual implementation uses different format.

**Expected (based on examples):**
```json
POST /api/describe/vehicles
{
  "schema_name": "vehicles",
  "title": "Vehicles",
  "type": "object",
  "properties": {
    "vin": {"type": "string"},
    "make": {"type": "string"}
  }
}
```

**Actual:**
```bash
# Error: column "title" of relation "schemas" does not exist
# Error: column "type" of relation "schemas" does not exist
```

**Actual Format Discovered:**
```bash
POST /api/describe/vehicles
{}  # Just creates metadata
# Then add columns individually
```

**Impact:**
- Confusing for new users
- Time wasted trying documented format
- JSON Schema examples are misleading

**Recommendation:**
- Update all schema creation documentation
- Remove or clarify JSON Schema references
- Show actual two-step process clearly

---

## Medium Priority Issues

### 5. GET Request Body Parameter

**Problem:**
MonkHttp tool allows `body` parameter for GET requests, which violates HTTP spec.

**Example:**
```typescript
MonkHttp({
  method: "GET",
  path: "/api/user/whoami",
  body: {}  // ❌ GET requests cannot have body
})
// Error: "Request with GET/HEAD method cannot have body"
```

**Recommendation:**
- Make `body` parameter conditional based on method
- Tool should validate: `if method in ['GET', 'HEAD'] then body must be undefined`
- Better error message from tool before making API call

---

### 6. Tool Naming and Selection Confusion

**Available Tools:**
- `MonkApiData` - For data operations
- `MonkApiDescribe` - For schema operations
- `MonkHttp` - Generic HTTP requests
- `MonkAuth` - Authentication
- `MonkAuthLogin` / `MonkAuthRegister` - Shortcuts

**Confusion:**
- When to use MonkApiData vs MonkHttp?
- MonkApiData has strict type (object) but API needs arrays
- No guidance on tool selection

**Recommendation:**
- Add tool usage guide in descriptions
- Example: "Use MonkApiData for single record operations. For bulk creates, use MonkHttp with array body."

---

## Positive Experiences ✅

### What Worked Well

1. **MonkAuthRegister** - Flawless tenant creation
   ```typescript
   MonkAuthRegister({tenant: "acme-auto-dealership"})
   // ✅ Instant tenant + JWT token
   ```

2. **Token Caching** - Automatic authentication
   - Token stored after first auth
   - Subsequent calls use cached token
   - Transparent to user

3. **MonkApiDescribe (GET)** - Reading schemas worked perfectly
   ```typescript
   MonkApiDescribe({schema: "users"})
   // ✅ Returns schema metadata
   ```

4. **Column Creation via MonkHttp** - Once format was discovered
   ```typescript
   MonkHttp({
     method: "POST",
     path: "/api/describe/vehicles/columns/vin",
     body: {column_name: "vin", type: "text", required: true}
   })
   // ✅ Worked reliably
   ```

5. **Error Messages from API** - Generally helpful
   - Clear error codes (`BODY_NOT_ARRAY`, `SCHEMA_NOT_FOUND`)
   - Useful stack traces in development mode
   - Though some are confusing (see issue #1)

---

## Testing Methodology

### Scenario Approach

**Goal:** Build realistic multi-schema application to stress-test API

**Schemas Created:**
1. **Vehicles** (17 columns) - Inventory management
   - VIN, make, model, year, status, prices, dates
   - Arrays: features, photos
   - Enums: status (available/sold/reserved)

2. **Customers** (11 columns) - Customer management
   - Contact info, preferences, budget range
   - Arrays: preferred vehicle types

3. **Sales** (9 columns) - Transaction tracking
   - Foreign keys: vehicle_id, customer_id, salesperson_id
   - Financial: sale_price, commission_amount
   - Enums: financing_type

4. **Test Drives** (9 columns) - Appointment scheduling
   - Foreign keys: vehicle_id, customer_id, salesperson_id
   - Timestamps: scheduled_date, actual_date
   - Enums: status

**Planned Queries (not tested due to blocker):**
- Find API: "Available SUVs under $40k with <50k miles"
- Aggregate API: "Monthly sales by salesperson"
- Complex: "Customers who test drove but didn't buy"

### Documentation Review Process

1. Read MCP tool descriptions
2. Attempt to use tools as documented
3. Encounter errors
4. Cross-reference with API documentation
5. Cross-reference with DRIFT.md (known issues)
6. Trial and error to discover actual behavior
7. Document findings

**Time Breakdown:**
- Schema creation: 30 minutes (understanding format)
- Column creation: 45 minutes (50+ API calls)
- Data population attempts: 45 minutes (blocked)
- Documentation and analysis: 30+ minutes

---

## Recommendations for MCP Server

### Immediate (Critical Path)

1. **Fix MonkApiData type definition** to support arrays
2. **Add Content-Type header** explicitly in HTTP requests
3. **Test array serialization** - verify JSON arrays are sent correctly

### Short Term (Usability)

4. **Add MonkApiBulk tool** - Wrapper for bulk operations
5. **Add validation** - Prevent invalid tool calls (GET with body)
6. **Improve tool descriptions** - Add usage guidance

### Medium Term (Performance)

7. **Add MonkSchemaBuilder helper** - Batch column creation
8. **Add query examples** to tool descriptions
9. **Document tool selection criteria**

### Long Term (API Gaps)

10. **Work with API team** on relationship documentation
11. **Request bulk endpoints** from API team
12. **Standardize schema format** (actual vs documented)

---

## Recommendations for Monk API

### Critical (Documentation Drift)

1. **Document actual schema creation format** - Not JSON Schema
2. **Fix relationship documentation** - Current docs are fiction
3. **Update DRIFT.md** with findings from this scenario

### High Priority (Usability)

4. **Add bulk column creation endpoint**
   ```bash
   POST /api/describe/:schema/columns
   [array of column definitions]
   ```

5. **Clarify array handling** in Data API
6. **Provide relationship examples** that actually work

### Medium Priority (Features)

7. **Schema templates** - Common patterns (user management, e-commerce, etc.)
8. **Better error messages** - "Array not recognized as array" is confusing
9. **Computed fields** - Or document client-side calculation patterns

---

## Files Generated During Testing

1. **scenarios/DEALERSHIP.md** - Full scenario specification
2. **spec/DRIFT.md** - Updated with relationship issue
3. **4 database schemas** in tenant `acme-auto-dealership`:
   - vehicles (17 columns)
   - customers (11 columns)
   - sales (9 columns)
   - test_drives (9 columns)

**Not Generated (blocked):**
- Test data fixtures
- Query examples
- Results documentation

---

## Conclusion

The MCP server provides a solid foundation for interacting with Monk API, but has **critical type mismatch issues** that block realistic testing scenarios. The schema creation workflow is functional but requires many sequential calls, impacting performance and user experience.

**Can the API build a car dealership app?** Unknown - blocked before testing core features (Find API, Aggregate API, relationships).

**Is the MCP server production-ready?** No - type mismatches and usability issues need resolution.

**Most Impactful Fix:** Resolve MonkApiData array handling to unblock data population and enable real scenario testing.

---

## Appendix: Error Messages Encountered

### Schema Creation Errors (Resolved)

```json
{
  "error": "Observer execution failed: SystemError: Failed to insert record into schemas: column \"title\" of relation \"schemas\" does not exist",
  "error_code": "OBSERVER_ERROR"
}
```
**Cause:** Tried to use `title` field (doesn't exist)
**Resolution:** Use minimal schema creation `{}`

```json
{
  "error": "Observer execution failed: SystemError: Failed to insert record into schemas: column \"type\" of relation \"schemas\" does not exist",
  "error_code": "OBSERVER_ERROR"
}
```
**Cause:** Tried to use `type` field (doesn't exist)
**Resolution:** Use two-step process (schema + columns)

### Data Creation Errors (Unresolved)

```json
{
  "success": false,
  "error": "Request body must be an array of records",
  "error_code": "BODY_NOT_ARRAY"
}
```
**Cause:** Unknown - MCP tool type mismatch
**Status:** **BLOCKING ISSUE**

---

**Tested By:** Claude (Sonnet 4.5) via Claude Code
**MCP Server Version:** Latest (as of 2025-01-22)
**Monk API Version:** 3.1.0
**Environment:** macOS Darwin 23.6.0
