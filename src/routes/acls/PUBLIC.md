# ACLs API

The ACLs API provides administrative control over record-level access permissions. It allows administrators and root users to manage the four access control arrays that determine user permissions for specific records.

## Overview

Each record contains four access control arrays:
- `access_read`: User IDs with read access
- `access_edit`: User IDs with edit access  
- `access_full`: User IDs with full access (read/edit/delete)
- `access_deny`: User IDs with denied access (overrides other permissions)

## Authentication Requirements

All ACLs API operations require:
- Valid JWT authentication
- Admin or root level privileges
- Target record must exist in the specified schema

## API Endpoints

| Endpoint | Method | Description | Purpose |
|----------|--------|-------------|---------|
| `/api/acls/:schema/:record` | GET | Get ACL lists | View current permissions |
| `/api/acls/:schema/:record` | POST | Merge ACL entries | Add users to access lists |
| `/api/acls/:schema/:record` | PUT | Replace ACL lists | Set complete new permissions |
| `/api/acls/:schema/:record` | DELETE | Clear all ACLs | Return to default permissions |

## Examples

### Get Current ACL Lists

```bash
curl -X GET http://localhost:9001/api/acls/users/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "record_id": "123e4567-e89b-12d3-a456-426614174000",
    "schema": "users",
    "access_lists": {
      "access_read": ["11111111-2222-3333-4444-555555555551", "22222222-3333-4444-5555-666666666662"],
      "access_edit": ["33333333-4444-5555-6666-777777777773"],
      "access_full": ["44444444-5555-6666-7777-888888888884"],
      "access_deny": []
    }
  }
}
```

### Merge New Users into Access Lists

```bash
curl -X POST http://localhost:9001/api/acls/users/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "access_read": ["55555555-6666-7777-8888-999999999995", "66666666-7777-8888-9999-aaaaaaaaaaa6"],
    "access_edit": ["77777777-8888-9999-aaaa-bbbbbbbbbb7"]
  }'
```

### Replace All Access Lists

```bash
curl -X PUT http://localhost:9001/api/acls/users/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "access_read": ["11111111-2222-3333-4444-555555555551"],
    "access_edit": ["33333333-4444-5555-6666-777777777773"],
    "access_full": ["44444444-5555-6666-7777-888888888884"],
    "access_deny": ["88888888-9999-aaaa-bbbb-cccccccccc8"]
  }'
```

### Clear All ACLs (Return to Default)

```bash
curl -X DELETE http://localhost:9001/api/acls/users/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "record_id": "123e4567-e89b-12d3-a456-426614174000",
    "schema": "users",
    "status": "default_permissions",
    "access_lists": {
      "access_read": [],
      "access_edit": [],
      "access_full": [],
      "access_deny": []
    }
  }
}
```

## Permission Logic

When ACL arrays are empty (`[]`), the record uses default role-based permissions from the user's authenticated role. When ACL arrays contain user IDs, they explicitly control access:

1. **access_deny** takes precedence - users in this array are always denied
2. **access_full** grants read, edit, and delete permissions
3. **access_edit** grants read and edit permissions  
4. **access_read** grants read-only permissions
5. Empty arrays fall back to role-based permissions

## Error Handling

- `400 Bad Request`: Invalid request format or ACL structure
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Insufficient privileges (requires admin/root)
- `404 Not Found`: Schema or record not found
- `500 Internal Server Error`: Database or system error

## Security Notes

- Only admin and root users can modify ACLs
- User IDs in ACL arrays must be valid UUID format strings
- Duplicate user IDs are automatically removed
- ACL changes take effect immediately
- Always validate user IDs exist before adding to ACL lists