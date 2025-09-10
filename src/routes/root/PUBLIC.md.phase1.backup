# Root API

The Root API provides administrative operations for tenant management and system administration. All Root API endpoints require elevated root-level JWT tokens obtained through privilege escalation.

## Authentication Requirements

Root API endpoints require **elevated root access** that must be explicitly requested:

1. **Authenticate** with normal user JWT (admin/root access level required)
2. **Escalate privileges** using the Auth API sudo endpoint
3. **Use root JWT** for administrative operations (15-minute time limit)

### Privilege Escalation Process

```bash
# 1. Login with admin/root user credentials
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant": "my-company", "username": "admin-user"}'

# Response includes user JWT
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {"access": "admin", "tenant": "my-company"}
  }
}

# 2. Request elevated root privileges
curl -X POST http://localhost:9001/api/auth/sudo \
  -H "Authorization: Bearer USER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Tenant administration"}'

# Response includes short-lived root JWT
{
  "success": true,
  "data": {
    "root_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 900,
    "access_level": "root",
    "warning": "Root token expires in 15 minutes"
  }
}

# 3. Use root JWT for administrative operations
curl -X GET http://localhost:9001/api/root/tenant \
  -H "Authorization: Bearer ROOT_JWT_TOKEN"
```

## Available Endpoints

| Endpoint | Method | Description | Purpose |
|----------|--------|-------------|---------|
| `/api/root/tenant` | GET | List all tenants | Tenant discovery and monitoring |
| `/api/root/tenant` | POST | Create new tenant | Tenant provisioning |
| `/api/root/tenant/:name` | GET | Get tenant details | Tenant inspection |
| `/api/root/tenant/:name` | DELETE | Delete tenant | Tenant cleanup |
| `/api/root/tenant/:name/health` | GET | Tenant health check | System monitoring |

## Tenant Management

### List All Tenants
```bash
curl -X GET http://localhost:9001/api/root/tenant \
  -H "Authorization: Bearer ROOT_JWT_TOKEN"

# Response
{
  "success": true,
  "data": {
    "tenants": [
      {
        "name": "acme-corp",
        "database": "tenant_a1b2c3d4",
        "host": "localhost",
        "is_active": true,
        "created_at": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

### Create New Tenant
```bash
curl -X POST http://localhost:9001/api/root/tenant \
  -H "Authorization: Bearer ROOT_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "new-company",
    "description": "New company tenant"
  }'

# Response
{
  "success": true,
  "data": {
    "tenant": "new-company",
    "database": "tenant_e5f6g7h8",
    "created": true
  }
}
```

### Tenant Health Check
```bash
curl -X GET http://localhost:9001/api/root/tenant/acme-corp/health \
  -H "Authorization: Bearer ROOT_JWT_TOKEN"

# Response
{
  "success": true,
  "data": {
    "tenant": "acme-corp",
    "status": "healthy",
    "database_connected": true,
    "schema_count": 15,
    "user_count": 42,
    "last_activity": "2024-01-15T14:30:00Z"
  }
}
```

## Security Model

### Access Control
- **Base requirement**: User must have `admin` or `root` access level
- **Privilege escalation**: Must explicitly request root JWT via sudo
- **Time limitation**: Root tokens expire after 15 minutes
- **Audit logging**: All root operations logged for security compliance

### Token Management
```typescript
// Client-side token storage strategy
localStorage.setItem('user_token', userJwt);        // Long-lived (1 hour)
sessionStorage.setItem('root_token', rootJwt);     // Short-lived (15 minutes)
localStorage.setItem('refresh_token', refreshJwt); // Very long-lived (30 days)

// Use appropriate token for different operations
const userHeaders = { 'Authorization': `Bearer ${userToken}` };    // Normal operations
const rootHeaders = { 'Authorization': `Bearer ${rootToken}` };    // Administrative operations
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `TOKEN_MISSING` | "Authorization header required" | No Bearer token |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Bad JWT signature |
| 403 | `ROOT_ACCESS_REQUIRED` | "Root privileges required" | User JWT used for root endpoint |
| 403 | `SUDO_ACCESS_DENIED` | "Insufficient privileges for sudo" | User lacks admin/root access |

## Best Practices

### Privilege Escalation
1. **Request sudo only when needed**: Don't preemptively escalate privileges
2. **Provide clear reason**: Include meaningful reason for audit trail
3. **Time awareness**: Root tokens expire quickly - handle expiration gracefully
4. **Separate storage**: Keep user and root tokens in different storage mechanisms

### Operational Security
```bash
# Good: Escalate for specific administrative task
POST /api/auth/sudo → Get root token
POST /api/root/tenant → Use root token immediately
# Let root token expire naturally

# Bad: Long-running elevated sessions
POST /api/auth/sudo → Get root token
# ... long pause ...
POST /api/root/tenant → Token may have expired
```

### Error Handling
```javascript
// Handle root token expiration gracefully
try {
  const response = await fetch('/api/root/tenant', { 
    headers: { 'Authorization': `Bearer ${rootToken}` }
  });
} catch (error) {
  if (error.status === 403 && error.error_code === 'ROOT_ACCESS_REQUIRED') {
    // Root token expired - request new elevation
    const sudoResponse = await fetch('/api/auth/sudo', {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    const { root_token } = await sudoResponse.json();
    // Retry with new root token
  }
}
```

## Administrative Operations

The Root API enables comprehensive tenant lifecycle management including provisioning, monitoring, and cleanup operations. All operations require explicit privilege escalation and are subject to comprehensive audit logging.

For complete endpoint documentation and request/response formats, see the individual route handlers and system documentation.