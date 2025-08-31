# Monk API

**Ultra-lightweight PaaS backend** built with Hono and TypeScript, featuring schema-first development, multi-tenant architecture, and ring-based observer system for building high-performance SaaS applications.

## Available APIs

| API | Endpoints | Authentication | Purpose |
|-----|-----------|----------------|---------|
| **Auth** | `/auth/*` | None | User authentication and JWT token management |
| **Data** | `/api/data/:schema[/:record]` | Required | CRUD operations for schema records |
| **Meta** | `/api/meta/:schema` | Required | Schema definition management |
| **Bulk** | `/api/bulk` | Required | Batch operations across multiple schemas |
| **Find** | `/api/find/:schema` | Required | Advanced search and filtering |
| **FTP** | `/ftp/*` | Required | Filesystem-like data access interface |

## Quick Start

### 1. Authentication
```bash
# Login to get JWT token
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant": "my-company", "username": "john.doe"}'

# Response includes access token
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { "username": "john.doe", "tenant": "my-company" }
  }
}
```

### 2. Create Schema
```bash
# Define data structure
curl -X POST http://localhost:9001/api/meta/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "users",
    "properties": {
      "name": {"type": "string", "minLength": 1},
      "email": {"type": "string", "format": "email"},
      "role": {"type": "string", "enum": ["admin", "user"]}
    },
    "required": ["name", "email"]
  }'
```

### 3. Create Records
```bash
# Add data to schema
curl -X POST http://localhost:9001/api/data/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"name": "John Doe", "email": "john@example.com", "role": "admin"},
    {"name": "Jane Smith", "email": "jane@example.com", "role": "user"}
  ]'
```

### 4. Query Records
```bash
# List all users
curl -X GET http://localhost:9001/api/data/users \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get specific user by ID
curl -X GET http://localhost:9001/api/data/users/USER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Key Features

- **Schema-First**: Define data models with JSON Schema validation
- **Multi-Tenant**: Isolated databases per tenant with JWT-based routing
- **Observer System**: Ring-based business logic execution (0-9 rings)
- **RESTful Design**: Consistent array/object patterns across all endpoints
- **Ultra-Fast**: Hono framework with ~50KB footprint and multi-runtime support

## Response Format

All endpoints return consistent JSON responses:

```json
// Success
{
  "success": true,
  "data": { /* response data */ }
}

// Error
{
  "success": false,
  "error": "Human-readable error message",
  "error_code": "MACHINE_READABLE_CODE"
}
```

## Documentation

Get detailed API documentation for each service:

- **Authentication**: `GET /docs/AUTH`
- **Data Operations**: `GET /docs/DATA`
- **Error Handling**: `GET /docs/ERRORS`

## Getting Started

1. **Install**: Clone the repository and run `npm run autoinstall --force`
2. **Start**: Run `npm run start:dev` for development server
3. **Authenticate**: Use the Auth API to get JWT tokens
4. **Explore**: Use the Meta API to create schemas, Data API for records

Visit the documentation endpoints above for complete API references, request/response formats, and integration examples.