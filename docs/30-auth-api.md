# 30-Auth API Documentation

> **Authentication and User Management**
>
> The Auth API provides user authentication, account management, and privilege escalation capabilities. It includes both public endpoints (login, whoami) and protected endpoints (sudo) for managing user sessions and access levels within the multi-tenant architecture.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core Endpoints](#core-endpoints)
4. [User Information](#user-information)
5. [Privilege Escalation](#privilege-escalation)
6. [Security Model](#security-model)
7. [Error Handling](#error-handling)
8. [Testing](#testing)
9. [Common Use Cases](#common-use-cases)

## Overview

The Auth API provides comprehensive authentication services for the Monk platform, supporting both user authentication and administrative privilege escalation. It serves as the gateway for user identity management and access control within the multi-tenant architecture.

### Key Capabilities
- **User Authentication**: Secure login and session management
- **User Information**: Retrieve current user context and permissions
- **Privilege Escalation**: Sudo access for administrative operations
- **Multi-tenant Support**: Tenant-isolated authentication with database routing
- **JWT Token Management**: Secure token-based authentication with expiration
- **Audit Integration**: All authentication events logged through observer pipeline

### Base URLs
```
GET  /api/auth/whoami     # Get current user information
POST /api/auth/sudo       # Escalate to root privileges
```

### Related Public Endpoints
```
POST /auth/login          # User login (public, no JWT required)
POST /auth/refresh        # Token refresh (public, no JWT required)
```

## Authentication

All 30-Auth API endpoints (except login/refresh) require valid JWT authentication. The API respects tenant isolation and provides detailed user context information.

```bash
Authorization: Bearer <jwt_token>
```

### Required Permissions
- **Whoami**: Any valid JWT token
- **Sudo**: `admin` or `root` access level required

### Token Types
- **User JWT**: Standard user authentication (1 hour expiration)
- **Root JWT**: Administrative privileges (15 minute expiration)
- **Refresh JWT**: Long-lived token for renewal (30 day expiration)

## Core Endpoints

### GET /api/auth/whoami

Retrieves comprehensive information about the currently authenticated user, including permissions, tenant context, and access levels.

#### Request
```bash
GET /api/auth/whoami
Authorization: Bearer <jwt_token>
```

#### Response
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
    "is_active": true,
    "created_at": "2025-01-01T12:00:00.000Z",
    "last_login": "2025-01-01T11:30:00.000Z"
  }
}
```

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `TOKEN_MISSING` | "Authorization header required" | No Bearer token provided |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Bad JWT signature or expired |
| 401 | `USER_NOT_FOUND` | "User not found or inactive" | User doesn't exist in tenant DB |

## User Information

The whoami endpoint provides detailed user context for authenticated operations, enabling applications to:
- Display current user information
- Validate user permissions before operations
- Implement role-based UI adaptations
- Track user sessions and activity

### Permission Arrays
The response includes four permission arrays that control access to specific records:
- **access_read**: Records the user can view
- **access_edit**: Records the user can modify
- **access_full**: Records the user can delete/manage
- **access_deny**: Records explicitly denied (overrides other permissions)

## Privilege Escalation

### POST /api/auth/sudo

Escalates user privileges to root level for administrative operations. Generates a short-lived root JWT token with enhanced permissions.

#### Request
```bash
POST /api/auth/sudo
Authorization: Bearer <user_jwt_token>
Content-Type: application/json

{
  "reason": "Tenant administration tasks"
}
```

#### Response
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

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `USER_JWT_REQUIRED` | "Valid user JWT required for privilege escalation" | No valid user JWT |
| 403 | `SUDO_ACCESS_DENIED` | "Insufficient privileges for sudo" | User lacks admin/root access |

### Sudo Workflow

The privilege escalation process follows a secure workflow:

1. **User Authentication**: Validate existing user JWT token
2. **Permission Check**: Verify user has admin or root access level
3. **Token Generation**: Create short-lived root JWT with elevated permissions
4. **Audit Logging**: Log escalation request with reason and user context
5. **Token Usage**: Use root JWT for administrative operations

#### Example Usage
```bash
# 1. Request elevated privileges
curl -X POST http://localhost:9001/api/auth/sudo \
  -H "Authorization: Bearer USER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Tenant administration tasks"}'

# 2. Use root JWT for administrative operations
curl -X GET http://localhost:9001/api/root/tenant \
  -H "Authorization: Bearer ROOT_JWT_TOKEN"
```

## Security Model

### Access Level Requirements
- **whoami endpoint**: Any valid user JWT token
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

### Security Features
- **Explicit escalation**: Must actively request root privileges
- **Time-limited**: Root tokens automatically expire after 15 minutes
- **Audit logging**: All sudo requests logged with reason and user context
- **Base requirements**: Only admin/root users can escalate privileges
- **Separate storage**: Keep user and root tokens in different storage mechanisms

### Best Practices
1. **Request sudo only when needed**: Don't preemptively escalate
2. **Provide clear reasons**: Include meaningful audit trail information
3. **Handle expiration**: Root tokens expire quickly - be prepared to re-escalate
4. **Separate storage**: Keep user and root tokens in different storage mechanisms

## Error Handling

### Common Error Responses

#### Authentication Errors
```json
{
  "success": false,
  "error": {
    "type": "AuthenticationError",
    "message": "Authorization header required",
    "code": "TOKEN_MISSING"
  }
}
```

#### Token Validation Errors
```json
{
  "success": false,
  "error": {
    "type": "AuthenticationError",
    "message": "Invalid or expired token",
    "code": "TOKEN_INVALID"
  }
}
```

#### User Not Found
```json
{
  "success": false,
  "error": {
    "type": "AuthenticationError",
    "message": "User not found or inactive",
    "code": "USER_NOT_FOUND"
  }
}
```

#### Sudo Access Denied
```json
{
  "success": false,
  "error": {
    "type": "PermissionError",
    "message": "Insufficient privileges for sudo",
    "code": "SUDO_ACCESS_DENIED"
  }
}
```

#### Missing User JWT
```json
{
  "success": false,
  "error": {
    "type": "AuthenticationError",
    "message": "Valid user JWT required for privilege escalation",
    "code": "USER_JWT_REQUIRED"
  }
}
```

## Testing

For comprehensive testing information and test coverage details, please refer to the test suite documentation:

**[spec/30-auth-api/README.md](../spec/30-auth-api/README.md)**

This includes test scope, focus areas, and testing strategies for authentication endpoints, including:
- WHOAMI endpoint functionality and user context validation
- Sudo privilege escalation and root token generation
- Authentication error handling and security validation
- Token-based authentication verification
- Role and permission validation for protected endpoints

## Common Use Cases

### Basic User Information Retrieval
```bash
# Get current user information
curl -X GET http://localhost:9001/api/auth/whoami \
  -H "Authorization: Bearer USER_JWT_TOKEN"

# Response includes user details, permissions, and tenant context
```

### Administrative Privilege Escalation
```bash
# 1. Request root privileges for administrative tasks
curl -X POST http://localhost:9001/api/auth/sudo \
  -H "Authorization: Bearer USER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Tenant database maintenance"}'

# 2. Use root token for administrative operations
curl -X GET http://localhost:9001/api/root/tenant \
  -H "Authorization: Bearer ROOT_JWT_TOKEN"
```

### Token Management in Applications
```javascript
// Store tokens separately with different lifetimes
const userToken = localStorage.getItem('user_token');     // 1 hour
const rootToken = sessionStorage.getItem('root_token');   // 15 minutes

// Use appropriate token for different operations
const userHeaders = {
  'Authorization': `Bearer ${userToken}`,
  'Content-Type': 'application/json'
};

const rootHeaders = {
  'Authorization': `Bearer ${rootToken}`,
  'Content-Type': 'application/json'
};

// Normal data operations with user token
fetch('/api/data/users', { headers: userHeaders })
  .then(response => response.json());

// Administrative operations with root token
fetch('/api/root/tenant', { headers: rootHeaders })
  .then(response => response.json());
```

### Session Validation
```bash
# Validate current session before sensitive operations
curl -X GET http://localhost:9001/api/auth/whoami \
  -H "Authorization: Bearer USER_JWT_TOKEN" | \
  jq -r '.data.access'

# Check if user has admin privileges before sudo
curl -X GET http://localhost:9001/api/auth/whoami \
  -H "Authorization: Bearer USER_JWT_TOKEN" | \
  jq -r '.data.access' | grep -E "(admin|root)"
```

---

**Next: [31-Meta API Documentation](31-meta-api.md)** - Schema management and metadata operations

**Previous: [API Documentation Overview](API.md)** - Complete API reference