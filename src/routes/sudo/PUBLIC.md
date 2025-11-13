# Sudo API

The Sudo API provides tenant-scoped user management operations that require explicit privilege escalation through short-lived sudo tokens.

## Base Path
- **Protected routes**: `/api/sudo/*` (sudo token required)

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sudo/users` | Create new user in current tenant |
| PATCH | `/api/sudo/users/:id` | Update existing user |
| DELETE | `/api/sudo/users/:id` | Delete user (soft delete) |

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

---

## Authentication

All Sudo API endpoints require a valid **sudo token** obtained from `POST /api/auth/sudo`. Regular JWTs, even with `access='root'`, are not sufficient.

```bash
Authorization: Bearer <sudo_token>
```

### Getting a Sudo Token

1. User must have `access='root'` in their base JWT
2. Request sudo token via `POST /api/auth/sudo`
3. Sudo token expires after 15 minutes
4. Use sudo token for `/api/sudo/*` operations

---

## User Management Endpoints

### POST /api/sudo/users

Create a new user within the current tenant.

#### Request
```bash
POST /api/sudo/users
Authorization: Bearer <sudo_token>
Content-Type: application/json

{
  "name": "John Doe",
  "auth": "john@example.com",
  "access": "full",
  "access_read": [],
  "access_edit": [],
  "access_full": []
}
```

#### Request Body Fields
- **name** (string, required): Display name for the user
- **auth** (string, required): Authentication identifier (username/email), must be unique
- **access** (string, required): Access level - `deny|read|edit|full|root`
- **access_read** (array, optional): Record-level read ACL (UUID array)
- **access_edit** (array, optional): Record-level edit ACL (UUID array)
- **access_full** (array, optional): Record-level full ACL (UUID array)

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "auth": "john@example.com",
    "access": "full",
    "access_read": [],
    "access_edit": [],
    "access_full": [],
    "access_deny": [],
    "created_at": "2025-11-13T12:00:00.000Z",
    "updated_at": "2025-11-13T12:00:00.000Z"
  }
}
```

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `JWT_REQUIRED` | "Valid JWT required for sudo operations" | No JWT provided |
| 403 | `SUDO_TOKEN_REQUIRED` | "Sudo token required - use POST /api/auth/sudo to get short-lived sudo access" | Not a sudo token |
| 409 | `DUPLICATE_AUTH` | "User with auth 'john@example.com' already exists" | Username/email already taken |

---

### PATCH /api/sudo/users/:id

Update an existing user in the current tenant.

#### Request
```bash
PATCH /api/sudo/users/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <sudo_token>
Content-Type: application/json

{
  "access": "edit",
  "name": "Jane Doe (Updated)"
}
```

#### Request Body
Any user fields to update (partial update supported):
- `name`, `access`, `access_read`, `access_edit`, `access_full`, etc.

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Jane Doe (Updated)",
    "access": "edit",
    // ... other fields
  }
}
```

---

### DELETE /api/sudo/users/:id

Delete a user from the current tenant (soft delete by default).

#### Request
```bash
DELETE /api/sudo/users/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <sudo_token>
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "trashed_at": "2025-11-13T12:05:00.000Z"
  }
}
```

---

## Security Model

### Sudo Token Requirements
- Must have `access='root'` in base JWT
- Must request sudo token via `POST /api/auth/sudo`
- Sudo token contains `is_sudo: true` flag
- Sudo token expires after 15 minutes
- Each dangerous operation requires fresh sudo token

### Why Explicit Sudo?
Even users with `access='root'` must explicitly escalate because:
1. **Audit Trail**: Logs when dangerous operations are requested
2. **Time-Limited**: Reduces window for accidental operations
3. **Explicit Intent**: Forces conscious decision for user management
4. **Security**: Long-lived root JWTs cannot directly modify users

### Tenant Isolation
All `/api/sudo/*` operations are **tenant-scoped**:
- Can only manage users within your own tenant
- Cannot see or modify users in other tenants
- No cross-tenant administrative operations
- Maintains proper multi-tenant security boundaries

---

## Common Use Cases

### Creating a New Team Member
```bash
# 1. Get sudo token (15 min)
SUDO_TOKEN=$(curl -X POST http://localhost:9001/api/auth/sudo \
  -H "Authorization: Bearer $ROOT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Adding new team member"}' | jq -r '.data.root_token')

# 2. Create user
curl -X POST http://localhost:9001/api/sudo/users \
  -H "Authorization: Bearer $SUDO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Smith",
    "auth": "alice@company.com",
    "access": "edit"
  }'
```

### Updating User Access Level
```bash
# 1. Get sudo token
SUDO_TOKEN=$(curl -X POST http://localhost:9001/api/auth/sudo \
  -H "Authorization: Bearer $ROOT_JWT" \
  -d '{"reason": "Promoting user to full access"}' | jq -r '.data.root_token')

# 2. Update user
curl -X PATCH http://localhost:9001/api/sudo/users/$USER_ID \
  -H "Authorization: Bearer $SUDO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"access": "full"}'
```

### Removing a User
```bash
# 1. Get sudo token
SUDO_TOKEN=$(curl -X POST http://localhost:9001/api/auth/sudo \
  -H "Authorization: Bearer $ROOT_JWT" \
  -d '{"reason": "Removing inactive user"}' | jq -r '.data.root_token')

# 2. Delete user (soft delete)
curl -X DELETE http://localhost:9001/api/sudo/users/$USER_ID \
  -H "Authorization: Bearer $SUDO_TOKEN"
```

---

**Related**: [Auth API Documentation](auth/PUBLIC.md) - Public authentication and sudo token acquisition
