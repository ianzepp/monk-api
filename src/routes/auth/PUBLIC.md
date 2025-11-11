# Protected Auth API

The Protected Auth API provides authenticated user account management and privilege escalation. All endpoints require valid JWT tokens and are used for managing authenticated user accounts.

## Base Path
All protected Auth API routes are prefixed with `/api/auth`

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | [`/api/auth/whoami`](#get-apiauthwhoami) | Return canonical identity, tenant routing data, and ACL arrays for the caller. |
| POST | [`/api/auth/sudo`](#post-apiauthsudo) | Exchange a standard user token for a short-lived root token after auditing the request. |

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication Required
All endpoints require valid JWT token in Authorization header: `Bearer <token>`

---

## GET /api/auth/whoami

Return the fully hydrated user identity for the active JWT, including tenant metadata, ACL lists, and record status flags. Clients typically call this at startup to confirm the token is valid, discover the backing database, and personalize UI according to the access arrays.

### Request Body
None - GET request with no body.

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john.doe",
    "tenant": "my-company",
    "database": "tenant_a1b2c3d4",
    "access": "full",
    "access_read": ["uuid1", "uuid2"],
    "access_edit": ["uuid3"],
    "access_full": ["uuid4"],
    "is_active": true
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `TOKEN_MISSING` | "Authorization header required" | No Bearer token provided |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Bad JWT signature or expired |
| 401 | `USER_NOT_FOUND` | "User not found or inactive" | User doesn't exist in tenant DB |

---

## POST /api/auth/sudo

Perform just-in-time privilege escalation for administrators who need to call `/api/root/*`. The endpoint verifies the caller’s base access level, logs the provided reason for audit tracking, and issues a 15-minute root token tied to the originating user.

### Request Body
```json
{
  "reason": "string"    // Optional: Reason for privilege escalation (for audit trail)
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "root_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 900,
    "token_type": "Bearer",
    "access_level": "root",
    "warning": "Root token expires in 15 minutes",
    "elevated_from": "admin",
    "reason": "Tenant administration"
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `USER_JWT_REQUIRED` | "Valid user JWT required for privilege escalation" | No valid user JWT |
| 403 | `SUDO_ACCESS_DENIED` | "Insufficient privileges for sudo" | User lacks admin/root access |

---

## Privilege Escalation Model

### Access Level Requirements
- **sudo endpoint**: Requires `admin` or `root` base access level
- **Root operations**: Generated root token required for `/api/root/*` endpoints
- **Time limits**: Root tokens expire after 15 minutes for security

### Token Management Strategy
```javascript
// Client should maintain separate tokens:
localStorage.setItem('user_token', userJwt);        // Long-lived (1 hour)
sessionStorage.setItem('root_token', rootJwt);     // Short-lived (15 minutes)
localStorage.setItem('refresh_token', refreshJwt); // Very long-lived (30 days)

// Use appropriate token for different operations:
const userHeaders = { 'Authorization': `Bearer ${userToken}` };    // Normal operations
const rootHeaders = { 'Authorization': `Bearer ${rootToken}` };    // Administrative operations
```

### Sudo Workflow Example
```bash
# 1. Normal user operations with user JWT
curl -X GET http://localhost:9001/api/auth/whoami \
  -H "Authorization: Bearer USER_JWT_TOKEN"

# 2. Request elevated privileges when needed
curl -X POST http://localhost:9001/api/auth/sudo \
  -H "Authorization: Bearer USER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Tenant administration tasks"}'

# 3. Use root JWT for administrative operations
curl -X GET http://localhost:9001/api/root/tenant \
  -H "Authorization: Bearer ROOT_JWT_TOKEN"
```

## Security Model

### Privilege Escalation Security
- **Explicit escalation**: Must actively request root privileges
- **Time-limited**: Root tokens automatically expire after 15 minutes
- **Audit logging**: All sudo requests logged with reason and user context
- **Base requirements**: Only admin/root users can escalate privileges

### Best Practices
1. **Request sudo only when needed**: Don't preemptively escalate
2. **Provide clear reasons**: Include meaningful audit trail information
3. **Handle expiration**: Root tokens expire quickly - be prepared to re-escalate
4. **Separate storage**: Keep user and root tokens in different storage mechanisms

## Error Response Format

All error responses follow the standardized format documented in the main error handling specification. For token acquisition (login, register, refresh), see `/docs/public-auth`.

## Related Documentation

- **Token Acquisition**: `/docs/public-auth` - Login, register, refresh operations
- **Administrative Operations**: `/docs/root` - Root API requiring elevated privileges
- **User Data Management**: `/docs/data` - Working with user data and schemas

The Protected Auth API enables secure user account management and privilege escalation within the authenticated context of the Monk platform.
