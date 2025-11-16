# Monk API

**Ultra-lightweight PaaS backend** built with Hono and TypeScript, featuring schema-first development, multi-tenant architecture, and innovative filesystem-like data access for building high-performance SaaS applications.

## API Architecture

### Public Routes (No Authentication Required)
| API | Endpoints | Purpose |
|-----|-----------|---------|
| **Health Check** | `/health` | System health status and uptime |
| **Public Auth** | `/auth/*` | Token acquisition (login, register, refresh) |
| **Documentation** | `/docs/*` | Self-documenting API reference |

### Protected Routes (JWT Authentication Required)
| API | Endpoints | Purpose |
|-----|-----------|---------|
| **Auth API** | `/api/auth/*` | User account management and privilege escalation |
| **Data API** | `/api/data/:schema[/:record]` | CRUD operations for schema records |
| **Describe API** | `/api/describe/:schema` | JSON Schema definition management |
| **File API** | `/api/file/*` | Filesystem-like interface to data and metadata |
| **Bulk API** | `/api/bulk` | Batch operations across multiple schemas |
| **Find API** | `/api/find/:schema` | Advanced search and filtering |

### Administrative Routes (Sudo Token Required)
| API | Endpoints | Purpose |
|-----|-----------|---------|
| **Sudo API** | `/api/sudo/*` | User management (tenant-scoped, requires sudo token) |

## Key Features

- **Schema-First Development**: Define data models with JSON Schema validation and automatic PostgreSQL table generation
- **Multi-Tenant Architecture**: Isolated tenant databases with JWT-based routing and security
- **Filesystem Data Interface**: Intuitive file/directory metaphor for complex data exploration and manipulation
- **Privilege Escalation**: Enterprise-grade sudo model with time-limited root access for sudo operations
- **Observer System**: Ring-based business logic execution (0-9 rings) for extensible data processing
- **Advanced Filtering**: 25+ filter operators with complex logical operations and ACL integration

## Authentication Model

### Three-Tier Security
1. **Public Access**: Token acquisition and documentation (no authentication)
2. **User Access**: Standard API operations with user-level JWT tokens
3. **Root Access**: Administrative operations requiring elevated privileges via sudo

### Token Types
- **User JWT**: Standard operations (1 hour expiration)
- **Root JWT**: Administrative operations (15 minutes expiration, obtained via sudo)
- **Refresh Token**: Long-lived token renewal (configurable expiration)

## API Discovery

Use the root endpoint to discover all available APIs and their documentation:

```bash
curl http://localhost:9001/

# Response includes complete API catalog:
{
  "success": true,
  "data": {
    "name": "Monk API (Hono)",
    "version": "2.0.0-rc2",
    "endpoints": {
      "home": "/ (public)",
      "health": "/health (public)",
      "public_auth": "/auth/* (public - token acquisition)",
      "docs": "/docs[/:api] (public)",
      "auth": "/api/auth/* (protected - user management)",
      "data": "/api/data/:schema[/:record] (protected)",
      "describe": "/api/describe/:schema (protected)",
      "file": "/api/file/* (protected)",
      "bulk": "/api/bulk (protected)",
      "find": "/api/find/:schema (protected)",
      "sudo": "/api/sudo/* (restricted, requires sudo token)"
    },
    "documentation": {
      "auth": ["/docs/auth", "/docs/public-auth"],
      "data": ["/docs/data"],
      "describe": ["/docs/describe"],
      "file": ["/docs/file"],
      "bulk": ["/docs/bulk"],
      "find": ["/docs/find"],
      "root": ["/docs/root"]
    }
  }
}
```

## Documentation Guide

### Getting Started Documentation
- **Token Operations**: `/docs/public-auth` - Login, register, refresh workflows
- **User Management**: `/docs/auth` - Account management and privilege escalation

### Core API Documentation
- **Data Management**: `/docs/data` - CRUD operations and record management
- **Schema Management**: `/docs/describe` - JSON Schema definition and validation
- **File Interface**: `/docs/file` - Filesystem-like data access and exploration

### Advanced Operations
- **Batch Processing**: `/docs/bulk` - Multi-schema transaction operations
- **Complex Search**: `/docs/find` - Advanced filtering with 25+ operators
- **Administration**: `/docs/root` - Tenant management and system operations

## Quick Start Workflow

1. **Health Check**: `GET /health` to verify system status
2. **Explore APIs**: `GET /` to discover available endpoints and documentation
3. **Authentication**: Follow `/docs/public-auth` to obtain JWT tokens
4. **Schema Setup**: Use `/docs/describe` to define your data structures
5. **Data Operations**: Use `/docs/data` for standard CRUD operations
6. **Advanced Features**: Explore `/docs/file`, `/docs/bulk`, `/docs/find` for sophisticated data access

## Response Format

All endpoints return consistent JSON responses:

```json
// Success responses
{"success": true, "data": { /* response data */ }}

// Error responses
{"success": false, "error": "message", "error_code": "CODE"}
```

## Architecture Highlights

- **Ultra-Fast Performance**: Hono framework with ~50KB footprint and multi-runtime support
- **Schema-Driven**: JSON Schema validation with automatic database DDL generation
- **Multi-Tenant**: Automatic tenant isolation with dedicated PostgreSQL databases
- **Self-Documenting**: Complete API reference served via HTTP endpoints
- **Enterprise Security**: Sophisticated authentication with privilege escalation
- **Innovative Interface**: Filesystem metaphor for intuitive data manipulation

For detailed implementation examples, request/response formats, and integration guidance, visit the specific API documentation endpoints listed above.
