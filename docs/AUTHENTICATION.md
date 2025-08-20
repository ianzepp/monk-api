# Monk API Authentication Flow

This document explains the complete authentication process for the Monk CLI and API system, including how database names are used as authentication domains and how JWT tokens enable multi-tenant database access.

## Overview

The Monk authentication system uses a domain-based approach where the test database name serves as the authentication domain. This enables the Hono server to dynamically route requests to the correct PostgreSQL database based on the JWT token's domain field.

## Authentication Flow

### 1. CLI Side Process (`monk auth login --domain DB_NAME`)

#### Command Structure
```bash
monk auth login --domain monk_api_test_connection_test_20240820_1234
```

#### Authentication Request
- **URL**: `POST ${CLI_BASE_URL}/auth/login` (default: http://localhost:3001)
- **Payload**: `{"domain": "monk_api_test_connection_test_20240820_1234"}`
- **Headers**: `Content-Type: application/json`

#### Response Processing
- **Expected Response**: 
  ```json
  {
    "success": true, 
    "data": {
      "token": "JWT_TOKEN", 
      "user": {
        "id": "test-user",
        "username": "test",
        "email": "test@test.com",
        "domain": "monk_api_test_connection_test_20240820_1234",
        "role": "admin"
      }
    }
  }
  ```
- **Token Extraction**: Extracts JWT from `response.data.token`
- **Token Storage**: Saves JWT to `~/.monk-jwt-token` with 600 permissions
- **Verification**: Optionally tests token with ping request

### 2. Server Side Process (Hono API)

#### Authentication Endpoint (`/auth/login`)
The server processes the authentication request as follows:

1. **Validates domain**: Ensures domain parameter is provided
2. **Creates test user**: Generates a test user object with the provided domain
3. **Generates JWT**: Creates JWT token with 24-hour expiration

#### JWT Payload Structure
```typescript
{
  sub: "test-user",           // User ID
  email: "test@test.com",     // User email
  username: "test",           // Username
  domain: "actual_db_name",   // The database name passed in
  role: "admin",              // User role
  access_read: [],            // ACL read permissions
  access_edit: [],            // ACL edit permissions  
  access_full: [],            // ACL full permissions
  iat: timestamp,             // Issued at
  exp: timestamp + 24h        // Expires in 24 hours
}
```

#### Database Connection Management
- **Domain-based routing**: Uses JWT `domain` field to connect to the correct database
- **Dynamic connections**: Creates database connections on-demand for test databases
- **Connection string**: `postgresql://user@localhost:5432/domain_name`
- **Connection pooling**: Maintains separate pools for each database domain
- **Validation**: Tests database connectivity before creating connection pool

### 3. Subsequent Request Authentication

#### Token Usage in CLI
- **Auto-inclusion**: All non-auth requests automatically include stored JWT
- **Header format**: `Authorization: Bearer JWT_TOKEN`
- **Exclusion**: Auth endpoints (`/auth/*`) do not include JWT headers

#### Server Middleware Chain
For authenticated requests, the server processes them through this middleware chain:

1. **JWT Validation**: Verifies token signature and expiration using Hono's JWT middleware
2. **Database Setup**: `DatabaseManager.setDatabaseForRequest()` connects to database specified in JWT domain field
3. **User Context**: Sets up user permissions and access controls in request context
4. **Request Processing**: Handles API request with correct database context

#### Request Context Variables
The authentication middleware sets these context variables for use in route handlers:

```typescript
c.set('user', user);                    // Complete user object
c.set('userId', payload.sub);           // User ID
c.set('userDomain', payload.domain);    // Database domain
c.set('userRole', payload.role);        // User role
c.set('accessReadIds', payload.access_read || []);  // Read permissions
c.set('accessEditIds', payload.access_edit || []);  // Edit permissions  
c.set('accessFullIds', payload.access_full || []); // Full permissions
c.set('database', db);                  // Database connection
c.set('databaseDomain', domain);        // Database domain name
```

## Database Connection Details

### Connection String Format
The `DatabaseManager` builds connection strings using this logic:

```typescript
private static buildConnectionString(domain: string): string {
    const baseUrl = process.env.DATABASE_URL || 'postgresql://ianzepp@localhost:5432/';
    
    // If domain looks like a full database name, use it directly
    if (domain.includes('monk_api') || domain.includes('test_')) {
        return baseUrl.replace(/\/[^\/]*$/, `/${domain}`);
    }
    
    // Otherwise, prefix with standard naming
    return baseUrl.replace(/\/[^\/]*$/, `/monk_api_${domain}`);
}
```

### Connection Pooling
- **Per-domain pools**: Each database gets its own connection pool (max 5 connections)
- **Caching**: Connections are cached and reused across requests
- **Timeout settings**: 2s connection timeout, 30s idle timeout
- **Health checks**: Connections are tested with `SELECT 1` before caching

### Special Cases
- **Default domain**: `'default'` or `'monk_api_hono_dev'` uses the main application database
- **Test domains**: All other domains create dynamic connections to test databases
- **Error handling**: Connection failures result in 500 errors with descriptive messages

## CLI Token Management

### Token Storage
- **Location**: `~/.monk-jwt-token`
- **Permissions**: 600 (user read/write only)
- **Format**: Raw JWT string

### Token Operations
```bash
monk auth status    # Show authentication status and token info
monk auth token     # Display the raw JWT token
monk auth logout    # Remove stored token
```

### Token Introspection
The `monk auth status` command can decode and display JWT payload information:
- Domain name
- Expiration date
- Token file location

## Security Considerations

### JWT Security
- **Secret**: Configurable via `JWT_SECRET` environment variable
- **Expiration**: 24-hour token lifetime
- **Signing**: HMAC-based signing (Hono JWT implementation)

### Database Security
- **Isolation**: Each test database is completely isolated
- **Dynamic connections**: No pre-shared database connections
- **Connection validation**: Database accessibility is verified before use
- **Pool limits**: Connection pools are limited to prevent resource exhaustion

### File Permissions
- **Token file**: Stored with 600 permissions (user-only access)
- **Automatic cleanup**: Logout removes token file completely

## Error Scenarios

### Authentication Errors
- **Missing domain**: 400 Bad Request with validation error
- **Invalid token**: 401 Unauthorized for subsequent requests
- **Expired token**: 401 Unauthorized, requires re-authentication
- **Database unavailable**: 500 Internal Server Error with database error

### Recovery
- **Re-authentication**: `monk auth login --domain <domain>` to get fresh token
- **Manual cleanup**: Remove `~/.monk-jwt-token` to clear corrupted state
- **Database issues**: Ensure PostgreSQL is running and test database exists

## Integration with Test Infrastructure

### Database Pool Integration
The authentication system integrates with the database pool manager:

1. **Pool allocation**: Database pool manager creates test databases
2. **Authentication**: CLI authenticates using allocated database name as domain
3. **Request routing**: Hono server routes requests to correct database based on JWT
4. **Cleanup**: Database pool manager can clean up test databases independently

### Example Test Workflow
```bash
# 1. Allocate test database
DB_NAME=$(./scripts/db-pool-manager.sh allocate my_test)

# 2. Authenticate with database as domain
monk auth login --domain "$DB_NAME"

# 3. Use authenticated requests
monk meta list schema
monk data create user < test-data.json

# 4. Cleanup
monk auth logout
./scripts/db-pool-manager.sh deallocate "$DB_NAME"
```

## Architecture Benefits

### Multi-Tenancy
- **Database isolation**: Each client/test gets its own database
- **Concurrent testing**: Multiple test suites can run simultaneously
- **Resource management**: Connection pooling prevents database connection exhaustion

### Scalability
- **Dynamic routing**: No pre-configuration needed for new test databases
- **Stateless design**: JWT contains all routing information
- **Connection efficiency**: Pooling and caching optimize database performance

### Development Experience
- **Simple CLI**: Single command authentication with automatic token management
- **Transparent routing**: Developers don't need to manage database connections manually
- **Clear separation**: Test isolation prevents data contamination between test runs

This authentication system enables the Monk API to serve as a true multi-tenant platform where each test suite or client can have complete database isolation while maintaining a simple, unified API interface.