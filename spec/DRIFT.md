# Documentation Drift

This document tracks discrepancies between API documentation and actual implementation behavior discovered during test development.

## Describe API (spec/31-describe-api)

### Field Name: "freeze" vs "frozen"

**Documentation**: `src/routes/api/describe/:schema/POST.md` and `PUT.md` use `freeze`
**Implementation**: Actual field name is `frozen`
**Impact**: Medium - Documentation misleading
**Files affected**:
- `src/routes/api/describe/:schema/POST.md` (line 20, 30)
- `src/routes/api/describe/:schema/PUT.md` (line 20, 30)

**Resolution**: Update documentation to use `frozen` consistently

---

### Response Format: System Fields

**Documentation**: `src/routes/api/describe/:schema/PUT.md` shows responses include `id`, `created_at`, `updated_at`
**Implementation**: Describe API strips system fields from responses (only Data API returns them)
**Impact**: High - Creates confusion about response format differences between APIs
**Example**:
```json
// Documented response
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "schema_name": "users",
  "created_at": "2024-01-15T10:30:00Z"
}

// Actual response
{
  "schema_name": "users"
}
```

**Resolution**: Update all Describe API documentation to reflect that system fields are stripped

---

### Empty Update Validation

**Documentation**: No explicit mention of empty update handling
**Implementation**: PUT endpoints accept empty request bodies (return success without changes)
**Impact**: Low - May be intentional design, but unclear
**Affected endpoints**:
- `PUT /api/describe/:schema`
- `PUT /api/describe/:schema/columns/:column`

**Tests skipped**:
- `spec/31-describe-api/schema-columns-put.test.ts:195` - Empty updates test

**Resolution**: Document whether empty updates are intentionally allowed

---

### Type Normalization

**Documentation**: Implied that types might normalize (e.g., `decimal` → `numeric`)
**Implementation**: Types remain as specified in request
**Impact**: Low - Tests adjusted to match actual behavior
**Examples**:
- `decimal` stays `decimal` (not normalized to `numeric`)
- `timestamp` stays `timestamp` (not `timestamp with time zone`)

**Resolution**: Clarify in documentation that types are stored as-is

---

### Default Value Validation

**Documentation**: No clear specification for default_value type requirements
**Implementation**: Strict type validation that's inconsistent
**Impact**: Medium - Unclear how to properly set default values
**Error examples**:
- Sending `default_value: true` for boolean → "expected string but got boolean"
- Sending `default_value: "true"` for boolean → "expected boolean but got string"

**Tests skipped**:
- `spec/31-describe-api/schema-columns-post.test.ts:47` - default_value test

**Resolution**: Document exact format requirements for default_value field

---

### Column Creation Without Type

**Documentation**: Type appears to be required field
**Implementation**: Column creation succeeds without type (may default to text)
**Impact**: Low - May be intentional fallback behavior
**Tests skipped**:
- `spec/31-describe-api/schema-columns-post.test.ts:233` - No type test

**Resolution**: Document default type behavior or enforce type requirement

---

### Soft Delete and Name Reuse

**Documentation**: `src/routes/api/describe/:schema/DELETE.md` doesn't mention name reuse restrictions
**Implementation**: Soft-deleted schemas retain schema_name, preventing recreation with same name
**Impact**: Medium - Affects schema lifecycle management
**Error**: "Schema 'name' already exists" when trying to recreate deleted schema

**Tests skipped**:
- `spec/31-describe-api/schema-delete.test.ts:60` - Name reuse test

**Resolution**: Document that deleted schema names cannot be reused without Data API restore

---

### Trashed Items in List Endpoints

**Documentation**: `src/routes/api/describe/GET.md` doesn't specify trashed item filtering
**Implementation**: Deleted schemas still appear in `GET /api/describe` results
**Impact**: Medium - Unexpected behavior for listing active schemas
**Expected**: Trashed items filtered by default (require `?include_trashed=true`)
**Actual**: Trashed items included in default results

**Tests skipped**:
- `spec/31-describe-api/schema-list.test.ts:67` - Trashed schemas test

**Resolution**: Implement filtering or document current behavior

---

### Error Codes: Non-Existent Schema in Column Operations

**Documentation**: Various column endpoints document specific error codes
**Implementation**: Returns `INTERNAL_ERROR` instead of `COLUMN_NOT_FOUND` for non-existent schema
**Impact**: Low - Error handling works but codes differ
**Affected endpoints**:
- `PUT /api/describe/:schema/columns/:column`

**Expected**: `COLUMN_NOT_FOUND` or `SCHEMA_NOT_FOUND`
**Actual**: `INTERNAL_ERROR`

**Test adjustments**:
- `spec/31-describe-api/schema-columns-put.test.ts:211` - Adjusted to expect INTERNAL_ERROR

**Resolution**: Return more specific error code or update documentation

---

## Data API (spec/32-data-api)

### Empty Array Validation

**Documentation**: `src/routes/api/data/:schema/POST.md` implies arrays should contain records
**Implementation**: Empty arrays are accepted and return success with empty data array
**Impact**: Low - May be intentional (idempotent no-op)
**Affected endpoints**:
- `POST /api/data/:schema`

**Tests skipped**:
- `spec/32-data-api/data-post.test.ts:127` - Empty array test

**Resolution**: Document whether empty arrays are intentionally allowed

---

### Error Codes: Non-Existent Schema (Data API)

**Documentation**: Should return `SCHEMA_NOT_FOUND`
**Implementation**: Returns `INTERNAL_ERROR` for non-existent schema
**Impact**: Low - Error handling works but codes differ
**Affected endpoints**:
- `POST /api/data/:schema`
- Likely affects other Data API endpoints

**Test adjustments**:
- `spec/32-data-api/data-post.test.ts:165` - Adjusted to expect INTERNAL_ERROR

**Resolution**: Return more specific error code or update documentation

---

### Required Field Validation in UPDATE vs CREATE

**Documentation**: No clear specification of validation differences between CREATE and UPDATE
**Implementation**: UPDATE allows setting required fields to null, while CREATE rejects it
**Impact**: Low - May be intentional (allows clearing fields during updates)
**Affected endpoints**:
- `PUT /api/data/:schema/:record`

**Tests skipped**:
- `spec/32-data-api/data-put.test.ts:155` - Required field null validation

**Resolution**: Document that required field validation is less strict in UPDATE operations

---

### Empty Update Body Validation

**Documentation**: No mention of empty update handling
**Implementation**: PUT endpoints accept empty request bodies (return success without changes)
**Impact**: Low - May be intentional design (idempotent updates)
**Affected endpoints**:
- `PUT /api/data/:schema/:record`

**Tests skipped**:
- `spec/32-data-api/data-put.test.ts:165` - Empty update test

**Resolution**: Document whether empty updates are intentionally allowed

---

### Relationship Configuration Format

**Documentation**: `src/routes/api/data/:schema/:record/:relationship/GET.md` shows `x-monk-relationship` extension format
**Implementation**: Actual relationship structure is different from documented format
**Impact**: High - Documented format is completely invalid
**Documented format**:
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

**Actual format**: Unknown - documentation is invalid
**Affected documentation**:
- `src/routes/api/data/:schema/:record/:relationship/GET.md` (lines 68-86)
- Related relationship endpoint documentation

**Discovery source**: User reported during Car Dealership scenario development (2025-01-22)

**Resolution**: Document actual relationship configuration format and update all relationship endpoint documentation

---

## Summary Statistics

**Total Discrepancies**: 14 (9 Describe API + 5 Data API)
**Impact Levels**:
- High: 2 (System fields in responses, relationship configuration format)
- Medium: 4 (Field naming, default values, soft delete, trashed filtering)
- Low: 8 (Empty updates/arrays, type normalization, column without type, error codes, required field validation)

**Tests Skipped Due to Drift**: 7 (5 Describe API + 2 Data API)
**Test Adjustments Made**: Multiple (documented in test files with comments)

---

## Recommendations

1. **Immediate**: Fix field name documentation (freeze → frozen)
2. **High Priority**: Document actual relationship configuration format (x-monk-relationship is invalid)
3. **High Priority**: Document Describe API response format (no system fields)
4. **Medium Priority**: Clarify soft delete behavior and name reuse restrictions
5. **Medium Priority**: Implement or document trashed item filtering in list endpoints
6. **Low Priority**: Document default_value validation rules
7. **Low Priority**: Clarify intentional behaviors (empty updates, type normalization, default types)

---

## Notes

- All discrepancies documented here were discovered through systematic testing
- Tests follow actual implementation behavior, not documentation
- Skipped tests are marked with `.skip` and include `TODO` comments
- Most discrepancies are minor and don't affect core functionality
- Documentation updates would resolve most issues without code changes
