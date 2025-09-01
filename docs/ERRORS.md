# API Error Handling

## Error Response Format

All API endpoints return consistent error responses following this standardized format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "error_code": "MACHINE_READABLE_ERROR_CODE",
  "data": {
    // Optional additional error context
  }
}
```

## Response Fields

### `success`
- **Type**: `boolean`
- **Value**: Always `false` for error responses
- **Purpose**: Distinguishes error responses from successful responses

### `error`
- **Type**: `string`
- **Purpose**: Human-readable error message intended for display to end users
- **Language**: English
- **Format**: Clear, actionable description of what went wrong

### `error_code`
- **Type**: `string`
- **Purpose**: Machine-readable error identifier for programmatic handling
- **Format**: `SUBJECT_FIRST` naming convention (e.g., `SCHEMA_NOT_FOUND`, `TENANT_MISSING`)
- **Stability**: Error codes are stable across API versions for reliable client handling

### `data` (Optional)
- **Type**: `object`
- **Purpose**: Additional structured error context when relevant
- **Contents**: May include validation details, conflicting values, or other contextual information
- **Development Mode**: In `NODE_ENV=development`, includes additional debugging information such as stack traces

## HTTP Status Codes

Error responses use appropriate HTTP status codes that correspond to the type of error:

| Status Code | Category | Description |
|-------------|----------|-------------|
| `400` | Bad Request | Client error - invalid input, missing required fields, malformed requests |
| `401` | Unauthorized | Authentication required or failed |
| `403` | Forbidden | Access denied - insufficient permissions for the requested operation |
| `404` | Not Found | Requested resource does not exist |
| `409` | Conflict | Request conflicts with current resource state |
| `422` | Unprocessable Entity | Request is well-formed but semantically invalid |
| `500` | Internal Server Error | Unexpected server error or system failure |

## Error Code Naming Convention

Error codes follow a consistent `SUBJECT_FIRST` pattern for logical grouping and easy filtering:

- **Schema errors**: `SCHEMA_NOT_FOUND`, `SCHEMA_PROTECTED`, `SCHEMA_INVALID_FORMAT`
- **Record errors**: `RECORD_NOT_FOUND`, `RECORD_ALREADY_EXISTS`
- **Authentication errors**: `TENANT_MISSING`, `USERNAME_MISSING`, `TOKEN_EXPIRED`
- **Permission errors**: `ACCESS_DENIED`, `OPERATION_FORBIDDEN`
- **Request errors**: `REQUEST_INVALID_FORMAT`, `REQUEST_MISSING_FIELDS`

This convention enables:
- **Logical grouping**: All schema-related errors start with `SCHEMA_*`
- **Easy filtering**: Client code can check `errorCode.startsWith('SCHEMA_')`
- **Consistent sorting**: Related errors group together alphabetically

## Environment-Specific Behavior

### Production Mode
- Error messages are sanitized and generic
- No sensitive system information exposed
- Stack traces omitted from response

### Development Mode (`NODE_ENV=development`)
- Detailed error information included in `data` field
- Stack traces provided for debugging
- Additional context about error source and cause

## Client Error Handling

Clients should handle errors by:

1. **Check HTTP status code** for error category
2. **Use `error_code`** for specific error handling logic
3. **Display `error` message** to users when appropriate
4. **Process `data` field** for additional context when present

## Backward Compatibility

- Error response structure is stable across API versions
- New fields may be added to `data` object without breaking changes
- Existing `error_code` values will not change meaning
- HTTP status codes remain consistent for existing error conditions