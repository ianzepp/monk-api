# 39-Root API Documentation

> **System Administration and Tenant Management**
>
> The Root API provides administrative endpoints for tenant lifecycle management, system health monitoring, and root-level operations. It requires elevated privileges and is primarily intended for development and administrative use cases.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core Endpoints](#core-endpoints)
4. [Tenant Management](#tenant-management)
5. [Health Monitoring](#health-monitoring)
6. [System Operations](#system-operations)
7. [Development Restrictions](#development-restrictions)
8. [Error Handling](#error-handling)
9. [Testing](#testing)
10. [Common Use Cases](#common-use-cases)

## Overview

The Root API provides administrative functionality for managing the multi-tenant system architecture. It enables creation, management, and monitoring of tenant databases with proper isolation and security controls.

### Key Capabilities
- **Tenant Lifecycle Management**: Create, update, delete, and restore tenants
- **Health Monitoring**: Comprehensive system health checks
- **Database Management**: Automatic database provisioning and cleanup
- **Security Controls**: Root-level authentication and authorization
- **Development Support**: Localhost-restricted administrative operations
- **System Integration**: Integration with observer pipeline for audit logging

### Base URLs
```
POST /api/root/tenant              # Create new tenant
GET  /api/root/tenant              # List all tenants
GET  /api/root/tenant/:name        # Get tenant details
GET  /api/root/tenant/:name/health # Tenant health check
PUT  /api/root/tenant/:name        # Update/restore tenant
DELETE /api/root/tenant/:name      # Delete tenant (soft/hard)
```

## Authentication

All Root API endpoints require root-level authentication. The API enforces strict security controls and is typically restricted to localhost access in development environments.

```bash
Authorization: Bearer <root_jwt_token>
```

### Required Permissions
- **Root Access**: `root` or `admin` access level required
- **Localhost Restriction**: Many endpoints restricted to localhost in production
- **Tenant Isolation**: Operations respect tenant boundaries

## Core Endpoints

### POST /api/root/tenant

Creates a new tenant with automatic database provisioning and initialization.

```bash
POST /api/root/tenant
Content-Type: application/json
Authorization: Bearer <root_token>

{
  "name": "My Amazing App! 🚀",
  "host": "localhost"
}
```

**Response:**
```json
{
  "success": true,
  "tenant": "My Amazing App! 🚀",
  "database": "tenant_a1b2c3d4e5f6789a",
  "host": "localhost",
  "created_at": "2025-01-01T12:00:00.000Z",
  "root_user_created": true,
  "schema_initialized": true
}
```

### GET /api/root/tenant

Lists all tenants with optional filtering for different states.

```bash
# Active tenants only
GET /api/root/tenant
Authorization: Bearer <root_token>

# Include soft-deleted tenants
GET /api/root/tenant?include_trashed=true
Authorization: Bearer <root_token>

# Include hard-deleted tenants
GET /api/root/tenant?include_deleted=true
Authorization: Bearer <root_token>
```

**Response:**
```json
{
  "success": true,
  "tenants": [
    {
      "name": "My Amazing App! 🚀",
      "database": "tenant_a1b2c3d4e5f6789a",
      "host": "localhost",
      "status": "active",
      "created_at": "2025-01-01T12:00:00.000Z",
      "updated_at": "2025-01-01T12:00:00.000Z",
      "trashed_at": null,
      "deleted_at": null
    }
  ],
  "count": 1
}
```

## Development Restrictions

### Localhost-Only Operations

Many Root API endpoints are restricted to localhost access in production environments:

```json
{
  "error": {
    "type": "AccessDeniedError",
    "message": "Root API restricted to localhost access",
    "code": "LOCALHOST_ONLY"
  }
}
```

### Security Considerations

- **Development Focus**: Primarily intended for development and staging environments
- **Administrative Access**: Requires root-level authentication
- **Audit Logging**: All operations logged through observer pipeline
- **Rate Limiting**: Protected against abuse and excessive requests

## Error Handling

### Common Error Responses

#### Root Access Required
```json
{
  "success": false,
  "error": {
    "type": "PermissionError",
    "message": "Root access required for this operation",
    "code": "ROOT_ACCESS_REQUIRED"
  }
}
```

#### Tenant Already Exists
```json
{
  "success": false,
  "error": {
    "type": "ConflictError",
    "message": "Tenant 'my_tenant' already exists",
    "code": "TENANT_EXISTS"
  }
}
```

#### Database Creation Failed
```json
{
  "success": false,
  "error": {
    "type": "DatabaseError",
    "message": "Failed to create tenant database",
    "code": "DATABASE_CREATION_FAILED",
    "details": {
      "database": "tenant_a1b2c3d4e5f6789a",
      "error": "Connection timeout"
    }
  }
}
```

## Testing

The Root API includes comprehensive test coverage for administrative operations. See the [test README](../spec/39-root-api/README.md) for detailed test coverage information.

## Common Use Cases

### Development Environment Setup
```bash
# Create development tenant
curl -X POST http://localhost:9001/api/root/tenant \
  -H "Authorization: Bearer $ROOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "dev_environment", "host": "localhost"}'
```

### Multi-Tenant Application
```bash
# Create tenants for different customers
for customer in "acme_corp" "tech_startup" "enterprise_client"; do
  curl -X POST http://localhost:9001/api/root/tenant \
    -H "Authorization: Bearer $ROOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$customer\", \"host\": \"localhost\"}"
done
```

### Health Monitoring Integration
```bash
# Monitor tenant health
for tenant in $(curl -s -H "Authorization: Bearer $ROOT_TOKEN" \
  http://localhost:9001/api/root/tenant | jq -r '.tenants[].name'); do
  
  health=$(curl -s -H "Authorization: Bearer $ROOT_TOKEN" \
    http://localhost:9001/api/root/tenant/$tenant/health)
  
  status=$(echo $health | jq -r '.health.status')
  echo "Tenant $tenant: $status"
done
```

### Cleanup Operations
```bash
# Remove old development tenants
curl -X GET "http://localhost:9001/api/root/tenant?include_trashed=true" \
  -H "Authorization: Bearer $ROOT_TOKEN" | \
  jq -r '.tenants[] | select(.trashed_at != null) | .name' | \
  while read tenant; do
    curl -X DELETE "http://localhost:9001/api/root/tenant/$tenant?force=true" \
      -H "Authorization: Bearer $ROOT_TOKEN"
  done
```

---

**Previous: [38-ACLs API Documentation](38-acls-api.md)** - Access control lists management

**Back to: [API Documentation Overview](API.md)** - Complete API reference