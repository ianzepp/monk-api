# User API

The User API provides both self-service account operations and sudo-gated tenant user management. It complements the generic Data API by exposing explicit user workflows on top of the sudo-protected `users` model.

## Base Path
All User API routes are prefixed with `/api/user`

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication
All User API routes require authentication via Auth0 bearer token in the Authorization header.
- **Header**: `Authorization: Bearer <auth0_access_token>`

Password, sudo-token, and impersonation-token endpoints are disabled unless explicit non-production local auth bootstrap is enabled with `MONK_ENABLE_LOCAL_AUTH=true`.

## Key Features

### Self-Service Operations
Unlike the Data API (which requires sudo for the users table), the User API allows authenticated users to:
- ✅ View their own profile
- ✅ Update their own name and auth identifier
- ✅ Deactivate their own account

### Administrative Operations
With a sudo token from [`POST /api/user/sudo`](sudo/POST.md), privileged users can:
- ✅ List tenant users
- ✅ Create users
- ✅ Read, update, and delete other users
- ✅ Manage passwords and API keys for tenant users
- ✅ Issue impersonation tokens with `POST /api/user/fake`

### Security Boundaries
The User API enforces strict security controls:
- ❌ Cannot modify own access level (prevents privilege escalation)
- ❌ Cannot modify other users' profiles (use Data API with sudo)
- ❌ Cannot update protected fields like access_read, access_edit, access_full

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user/me` | View your own user profile |
| PUT | `/api/user/me` | Update your own name or auth identifier |
| DELETE | `/api/user/me` | Deactivate your own account (soft delete) |
| GET | `/api/user` | List users in the tenant (sudo required) |
| POST | `/api/user` | Create a user in the tenant (sudo required) |
| GET | `/api/user/:id` | View a specific user by UUID or `me` |
| PUT | `/api/user/:id` | Update a specific user by UUID or `me` |
| DELETE | `/api/user/:id` | Delete a specific user by UUID or `me` |
| POST | [`/api/user/sudo`](sudo/POST.md) | Issue a short-lived sudo token |

---

## GET /api/user/me

Retrieve your own user profile information including access levels and permissions.

### Authentication
- **Required**: Yes (any authenticated user)
- **Sudo**: Not required

### Request
```bash
curl -X GET \
  -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/api/user/me
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "auth": "john@example.com",
    "access": "full",
    "access_read": ["uuid1", "uuid2"],
    "access_edit": ["uuid3"],
    "access_full": ["uuid4"],
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z",
    "trashed_at": null
  }
}
```

### Response Fields
- `id` (uuid) - Unique user identifier
- `name` (string) - Display name
- `auth` (string) - Authentication identifier (username/email)
- `access` (string) - Base access level: `deny`, `read`, `edit`, `full`, or `root`
- `access_read` (uuid[]) - Record-level read ACLs
- `access_edit` (uuid[]) - Record-level edit ACLs
- `access_full` (uuid[]) - Record-level full ACLs
- `created_at` (timestamp) - Account creation timestamp
- `updated_at` (timestamp) - Last update timestamp
- `trashed_at` (timestamp|null) - Soft delete timestamp (null if active)

---

## PUT /api/user/me

Update your own profile information. You can only modify your `name` and `auth` fields - access levels and permissions require admin access via the Data API.

### Authentication
- **Required**: Yes (any authenticated user)
- **Sudo**: Not required

### Request Body
```json
{
  "name": "Jane Doe",           // Optional: Update display name
  "auth": "jane@example.com"    // Optional: Update auth identifier
}
```

### Validation Rules
- **name**: 2-100 characters
- **auth**: 2-255 characters, must be unique across tenant
- **Disallowed fields**: Cannot update `access`, `access_read`, `access_edit`, `access_full`

### Request
```bash
curl -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe", "auth": "jane@example.com"}' \
  https://api.example.com/api/user/me
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Jane Doe",
    "auth": "jane@example.com",
    "access": "full",
    "updated_at": "2025-01-15T11:00:00Z"
  }
}
```

### Error Responses

**400 - Validation Error**
```json
{
  "success": false,
  "error": "Name must be between 2 and 100 characters",
  "error_code": "VALIDATION_ERROR",
  "data": {
    "field": "name"
  }
}
```

**400 - Disallowed Field**
```json
{
  "success": false,
  "error": "Cannot update fields: access. Use admin endpoints to modify access levels.",
  "error_code": "VALIDATION_ERROR",
  "data": {
    "disallowed_fields": ["access"]
  }
}
```

**409 - Duplicate Auth**
```json
{
  "success": false,
  "error": "Auth identifier already exists",
  "error_code": "AUTH_CONFLICT",
  "data": {
    "field": "auth"
  }
}
```

---

## DELETE /api/user/me

Deactivate your own account (soft delete). This sets the `trashed_at` timestamp and prevents future authentication. An administrator can reactivate the account if needed.

### Authentication
- **Required**: Yes (any authenticated user)
- **Sudo**: Not required

### Request Body
```json
{
  "confirm": true,              // Required: Must be true
  "reason": "Leaving company"   // Optional: Reason for audit log
}
```

### Validation Rules
- **confirm**: Must be exactly `true` (boolean)
- **reason**: Optional string for audit purposes

### Request
```bash
curl -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true, "reason": "Leaving company"}' \
  https://api.example.com/api/user/me
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "message": "Account deactivated successfully",
    "deactivated_at": "2025-01-15T11:30:00Z",
    "reason": "Leaving company"
  }
}
```

### Error Responses

**400 - Missing Confirmation**
```json
{
  "success": false,
  "error": "Account deactivation requires explicit confirmation",
  "error_code": "CONFIRMATION_REQUIRED",
  "data": {
    "field": "confirm",
    "required_value": true
  }
}
```

### Notes
- After deactivation, you cannot authenticate with this account
- The account data is preserved (soft delete via `trashed_at`)
- An administrator can reactivate the account using the Data API with sudo access
- To permanently delete an account, an administrator must use the Data API with sudo and `permanent=true`

---

## Administrative User Management

For tenant-wide user management, use the collection and `:id` endpoints with a sudo token:

```bash
# 1. Exchange a normal token for a sudo token
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "User administration"}' \
  https://api.example.com/api/user/sudo

# 2. Use the sudo token to list users
curl -X GET \
  -H "Authorization: Bearer $SUDO_TOKEN" \
  https://api.example.com/api/user

# 3. Create or manage other users
curl -X POST \
  -H "Authorization: Bearer $SUDO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "New User", "auth": "new@example.com", "access": "edit"}' \
  https://api.example.com/api/user
```

---

## Comparison: User API vs Data API

The User API provides self-service operations on the users table without requiring sudo access:

| Feature | User API | Data API (`/api/data/users`) |
|---------|----------|------------------------------|
| **Authentication** | JWT required | JWT required |
| **Sudo Required** | ❌ No (for self-service ops) | ✅ Yes (users table has `sudo=true`) |
| **Self-Update** | ✅ Can update own profile | ❌ Cannot update without sudo |
| **Access Control** | ✅ Cannot change own access level | ❌ No protection (if you have sudo) |
| **Fields Allowed** | Only `name` and `auth` | All fields (with sudo) |
| **Use Case** | Self-service profile management | Admin user management |

### When to Use User API
- Users updating their own profiles
- Users deactivating their own accounts
- Self-service operations without admin involvement

### When to Use Data API
- Admins creating new users
- Admins modifying user access levels
- Admins managing access_read/access_edit/access_full arrays
- Any operation on other users' records

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data (name/auth length, type errors) |
| `CONFIRMATION_REQUIRED` | 400 | Account deactivation missing `confirm: true` |
| `AUTH_CONFLICT` | 409 | Auth identifier already exists |

---

## Security Model

### Self-Service Security
The User API implements the `withSelfServiceSudo()` pattern:
1. Route handlers wrap database operations with `withSelfServiceSudo(context, async () => {...})`
2. This temporarily sets the `as_sudo` flag in the request context
3. The sudo validator observer checks both `is_sudo` (JWT) and `as_sudo` (self-service flag)
4. Database operations proceed as if user has sudo, but only for their own record
5. Business logic ensures users can only modify their own profile

### Protection Against Privilege Escalation
- Users cannot update their own `access` field
- Attempting to modify `access` via `PUT /api/user/me` returns 400 error
- Access level changes require admin access via Data API with sudo
- The `as_sudo` flag is request-scoped and automatically cleaned up

### Audit Trail
All operations are logged through the standard observer pipeline:
- Profile updates logged with timestamp and user ID
- Account deactivations logged with optional reason
- All changes tracked via `updated_at` timestamp
