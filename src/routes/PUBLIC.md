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
| **Describe API** | `/api/describe/:schema[/:column]` | JSON Schema definition and column management |
| **Find API** | `/api/find/:schema` | Advanced search and filtering with 25+ operators |
| **Aggregate API** | `/api/aggregate/:schema` | Data aggregation and analytics operations |
| **Bulk API** | `/api/bulk` | Batch operations across multiple schemas |
| **ACLs API** | `/api/acls/:schema/:record` | Access control list management for records |
| **Stat API** | `/api/stat/:schema/:record` | Record metadata (timestamps, etag, size) |
| **History API** | `/api/history/:schema/:record[/:change]` | Change tracking and audit trails |

### Administrative Routes (Sudo Token Required)
| API | Endpoints | Purpose |
|-----|-----------|---------|
| **Sudo API** | `/api/sudo/*` | User management (tenant-scoped, requires sudo token) |

## Key Features

- **Schema-First Development**: Define data models with JSON Schema validation and automatic PostgreSQL table generation
- **Multi-Tenant Architecture**: Isolated tenant databases with JWT-based routing and security
- **Advanced Filtering**: 25+ filter operators with complex logical operations and ACL integration
- **Change Tracking**: Comprehensive audit trails with history tracking for all record modifications
- **Privilege Escalation**: Enterprise-grade sudo model with time-limited root access for administrative operations
- **Observer System**: Ring-based business logic execution (0-9 rings) for extensible data processing
- **Access Control**: Fine-grained ACL management at the record level for security and permissions

## Authentication Model

### Three-Tier Security
1. **Public Access**: Token acquisition and documentation (no authentication)
2. **User Access**: Standard API operations with user-level JWT tokens
3. **Root Access**: Administrative operations requiring elevated privileges via sudo

### Token Types
- **User JWT**: Standard operations (1 hour expiration)
- **Root JWT**: Administrative operations (15 minutes expiration, obtained via sudo)
- **Refresh Token**: Long-lived token renewal (configurable expiration)

### JWT Token Structure

All JWT tokens contain the following payload:

```json
{
  "tenant": "tenant_name",
  "database": "tenant_12345678",
  "access": "user_access_level",
  "user": "username",
  "exp": 1234567890
}
```

### Authentication Header

Include the JWT token in all protected API requests:

```bash
Authorization: Bearer <jwt_token>
```

## API Discovery

Use the root endpoint to discover all available APIs and their documentation:

```bash
curl http://localhost:9001/

# Response includes complete API catalog:
{
  "success": true,
  "data": {
    "name": "Monk API (Hono)",
    "version": "3.1.0",
    "endpoints": {
      "home": ["/ (public)", "/health (public)"],
      "docs": ["/README.md (public)", "/docs/:api (public)"],
      "auth": ["/auth/* (public)", "/api/auth/* (protected)"],
      "describe": ["/api/describe[/:schema[/:column]] (protected)"],
      "data": ["/api/data/:schema[/:record[/:relationship[/:child]]] (protected)"],
      "find": ["/api/find/:schema (protected)"],
      "aggregate": ["/api/aggregate/:schema (protected)"],
      "bulk": ["/api/bulk (protected)"],
      "acls": ["/api/acls/:schema/:record (protected)"],
      "stat": ["/api/stat/:schema/:record (protected)"],
      "history": ["/api/history/:schema/:record[/:change] (protected)"],
      "sudo": ["/api/sudo/* (sudo token required)"]
    },
    "documentation": {
      "auth": ["/docs/auth"],
      "describe": ["/docs/describe"],
      "data": ["/docs/data"],
      "find": ["/docs/find"],
      "aggregate": ["/docs/aggregate"],
      "bulk": ["/docs/bulk"],
      "acls": ["/docs/acls"],
      "stat": ["/docs/stat"],
      "history": ["/docs/history"],
      "sudo": ["/docs/sudo"]
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
- **Schema Management**: `/docs/describe` - JSON Schema definition and column management
- **Access Control**: `/docs/acls` - Record-level ACL management and permissions
- **Metadata Access**: `/docs/stat` - Record metadata without user data

### Advanced Operations
- **Complex Search**: `/docs/find` - Advanced filtering with 25+ operators
- **Data Aggregation**: `/docs/aggregate` - Analytics and aggregation operations
- **Batch Processing**: `/docs/bulk` - Multi-schema transaction operations
- **Change Tracking**: `/docs/history` - Audit trails and change history
- **Administration**: `/docs/sudo` - User management and administrative operations

## Quick Start Workflow

1. **Health Check**: `GET /health` to verify system status
2. **Explore APIs**: `GET /` to discover available endpoints and documentation
3. **Authentication**: Follow `/docs/auth` to obtain JWT tokens
4. **Schema Setup**: Use `/docs/describe` to define your data structures
5. **Data Operations**: Use `/docs/data` for standard CRUD operations
6. **Advanced Features**: Explore `/docs/find`, `/docs/aggregate`, `/docs/bulk` for sophisticated data access
7. **Security & Auditing**: Use `/docs/acls` for permissions and `/docs/history` for audit trails

## Response Format

All endpoints return consistent JSON responses:

```json
// Success responses
{"success": true, "data": { /* response data */ }}

// Error responses
{"success": false, "error": "message", "error_code": "CODE"}
```

### Response Customization

All API endpoints support query parameters for customizing response format and content:

#### Format Selection (`?format=`)

Choose response encoding format to optimize for different use cases:

**Supported Formats:**
- `json` (default) - Standard JSON with 2-space indentation
- `toon` - Compact human-readable format (30-40% fewer tokens for LLMs)
- `yaml` - YAML format for human readability
- `toml` - TOML configuration format (explicit typing, clean syntax)
- `csv` - CSV tabular data (response-only, auto-unwraps, array of objects only)
- `msgpack` - Binary format (30-50% smaller, base64-encoded for HTTP)
- `brainfuck` - Novelty format (response-only)
- `morse` - Morse code encoding
- `qr` - QR code ASCII art (response-only)
- `markdown` - Markdown tables and formatting (response-only)

**Examples:**
```bash
# Get response in TOON format (compact for LLMs)
curl http://localhost:9001/api/auth/whoami?format=toon

# Get response as TOML (great for config files)
curl http://localhost:9001/api/auth/whoami?format=toml

# Get response as MessagePack binary (efficient)
curl http://localhost:9001/api/data/users?format=msgpack

# Get response as Markdown table
curl http://localhost:9001/api/describe?format=markdown

# Export user list as CSV (auto-unwraps data)
curl http://localhost:9001/api/find/users?format=csv > users.csv
```

**Alternative Methods:**
1. Query parameter: `?format=toon` (highest priority)
2. Accept header: `Accept: application/toon`
3. JWT preference: Set `format` during login (persists for session)

#### Field Extraction (`?unwrap` and `?select=`)

Extract specific fields server-side, eliminating the need for client-side processing:

**Unwrap (Remove Envelope):**
```bash
# Standard response with envelope
curl /api/auth/whoami
# → {"success": true, "data": {"id": "...", "name": "...", ...}}

# Unwrapped response (just the data)
curl /api/auth/whoami?unwrap
# → {"id": "...", "name": "...", ...}
```

**Select Specific Fields:**
```bash
# Extract single field (returns plain text)
curl /api/auth/whoami?select=id
# → c81d0a9b-8d9a-4daf-9f45-08eb8bc3805c

# Extract multiple fields (returns JSON object)
curl /api/auth/whoami?select=id,name,access
# → {"id": "...", "name": "...", "access": "..."}

# Nested field extraction
curl /api/data/users/123?select=profile.email
# → user@example.com
```

**Combined Usage:**
```bash
# Extract fields AND format output
curl /api/auth/whoami?select=id,name&format=toon
# → id: c81d0a9b...
#   name: Demo User

# Extract field and get as MessagePack
TOKEN=$(curl /auth/login?select=token -d '{"tenant":"demo","username":"root"}')
```

**Benefits:**
- **No client-side parsing**: Eliminates `| jq` piping in shell scripts
- **Bandwidth optimization**: Return only needed fields
- **Simplified automation**: Direct value extraction for CI/CD
- **Format compatible**: Works with all response formats

**Processing Order:**
1. Route executes and returns full data
2. Field extraction filters data (if `?select=` or `?unwrap` present)
3. Response formatter encodes to requested format (if `?format=` specified)
4. Response encryption encrypts output (if `?encrypt=` specified)

### Response Encryption (`?encrypt=pgp`)

Encrypt API responses for secure transmission using AES-256-GCM with keys derived from your JWT token.

**Encryption Model:**
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Source**: Derived from your JWT token via PBKDF2
- **Output**: PGP-style ASCII armor format
- **Purpose**: Transport security (ephemeral, not long-term storage)

**Usage:**
```bash
# Encrypt any response
curl /api/auth/whoami?encrypt=pgp \
  -H "Authorization: Bearer $JWT" > encrypted.txt

# Decrypt with same JWT
node scripts/decrypt.js "$JWT" < encrypted.txt

# Combine with formatting and field selection
curl /api/find/users?select=id,email&format=csv&encrypt=pgp \
  -H "Authorization: Bearer $JWT"
```

**ASCII Armor Output:**
```
-----BEGIN MONK ENCRYPTED MESSAGE-----
Version: Monk-API/3.0
Cipher: AES-256-GCM

<base64-encoded encrypted data>
-----END MONK ENCRYPTED MESSAGE-----
```

**Security Model (Ephemeral Encryption):**

✅ **Good for:**
- Secure transmission over untrusted networks
- Additional defense-in-depth layer
- Preventing data logging in proxies

⚠️ **Important Limitations:**
- JWT token IS the decryption key
- JWT expiry means old messages become undecryptable
- NOT suitable for long-term storage
- Decrypt immediately or data may be lost

**Composability:**
```bash
# Select → Format → Encrypt (all in one request)
curl /api/find/users?select=id,name,email&format=csv&encrypt=pgp

# Any format can be encrypted
curl /api/data/users?format=yaml&encrypt=pgp
curl /api/describe?format=markdown&encrypt=pgp
```

## Integration Examples

### JavaScript/Node.js

```javascript
// Login with field extraction (get token directly)
const loginResponse = await fetch('https://api.example.com/auth/login?select=token', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    tenant: 'my_tenant',
    username: 'user',
    password: 'pass'
  })
});

// Token is returned directly (not wrapped in envelope)
const token = await loginResponse.text();

// Create a record
const response = await fetch('https://api.example.com/api/data/users', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Jane Smith',
    email: 'jane@example.com'
  })
});

const result = await response.json();
if (result.success) {
  console.log('Created user:', result.data);
} else {
  console.error('Error:', result.error_code, result.error);
}

// Get data in TOON format (compact for LLM processing)
const toonResponse = await fetch('https://api.example.com/api/data/users?format=toon', {
  headers: {'Authorization': `Bearer ${token}`}
});
const toonData = await toonResponse.text();  // TOON-formatted string

// Extract specific fields only
const userResponse = await fetch('https://api.example.com/api/data/users/123?select=email,name', {
  headers: {'Authorization': `Bearer ${token}`}
});
const userInfo = await userResponse.json();  // {"email": "...", "name": "..."}
```

### Python

```python
import requests

# Login with field extraction (get token directly)
login_response = requests.post(
    'https://api.example.com/auth/login?select=token',
    json={
        'tenant': 'my_tenant',
        'username': 'user',
        'password': 'pass'
    }
)

# Token is returned directly (not wrapped in envelope)
token = login_response.text

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# Create a record
data = {
    'name': 'John Doe',
    'email': 'john@example.com'
}

response = requests.post(
    'https://api.example.com/api/data/users',
    headers=headers,
    json=data
)

result = response.json()
if result['success']:
    print('Created user:', result['data'])
else:
    print('Error:', result['error_code'], result['error'])

# Advanced query with filtering
query = {
    'where': {'status': 'active', 'age': {'$gte': 18}},
    'limit': 50,
    'order': ['created_at desc']
}

response = requests.post(
    'https://api.example.com/api/find/users',
    headers=headers,
    json=query
)

results = response.json()

# Get data in TOON format (compact for LLM processing)
response = requests.post(
    'https://api.example.com/api/find/users?format=toon',
    headers=headers,
    json=query
)

toon_results = response.text  # Returns TOON-formatted string

# Extract specific fields only
response = requests.get(
    'https://api.example.com/api/data/users/123?select=email,name',
    headers=headers
)

user_info = response.json()  # Returns {"email": "...", "name": "..."}
```

### cURL

```bash
# Get authentication token (with field extraction - no jq needed!)
TOKEN=$(curl -X POST https://api.example.com/auth/login?select=token \
  -H "Content-Type: application/json" \
  -d '{"tenant":"my_tenant","username":"user","password":"pass"}')

# Create a record
curl -X POST https://api.example.com/api/data/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'

# Query with filtering
curl -X POST https://api.example.com/api/find/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "where": {"status": "active"},
    "limit": 10,
    "order": ["created_at desc"]
  }'

# Query with TOON format (compact for LLM processing)
curl -X POST https://api.example.com/api/find/users?format=toon \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"where": {"status": "active"}, "limit": 10}'

# Get specific field from user record
USER_EMAIL=$(curl https://api.example.com/api/data/users/123?select=email \
  -H "Authorization: Bearer $TOKEN")

# Bulk operations
curl -X POST https://api.example.com/api/bulk \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "operation": "create-all",
        "schema": "users",
        "data": [{"name": "User 1"}, {"name": "User 2"}]
      }
    ]
  }'
```

## Error Handling

### Error Response Format

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "error_code": "MACHINE_READABLE_ERROR_CODE",
  "data": {
    // Optional additional error context
  }
}
```

#### Response Fields

**`success`**
- **Type**: `boolean`
- **Value**: Always `false` for error responses
- **Purpose**: Distinguishes error responses from successful responses

**`error`**
- **Type**: `string`
- **Purpose**: Human-readable error message for display to end users
- **Language**: English
- **Format**: Clear, actionable description of what went wrong

**`error_code`**
- **Type**: `string`
- **Purpose**: Machine-readable error identifier for programmatic handling
- **Format**: `SUBJECT_FIRST` naming (e.g., `SCHEMA_NOT_FOUND`, `TENANT_MISSING`)
- **Stability**: Error codes are stable across API versions

**`data`** (Optional)
- **Type**: `object`
- **Purpose**: Additional structured error context
- **Development Mode**: Includes stack traces and debugging information

### HTTP Status Codes

| Status | Category | Description | Common Error Codes |
|--------|----------|-------------|-------------------|
| `400` | Bad Request | Invalid input, missing fields, malformed requests | `VALIDATION_ERROR`, `JSON_PARSE_ERROR`, `SCHEMA_ERROR` |
| `401` | Unauthorized | Authentication required or failed | `UNAUTHORIZED`, `TOKEN_EXPIRED` |
| `403` | Forbidden | Insufficient permissions | `FORBIDDEN`, `SCHEMA_PROTECTED`, `ACCESS_DENIED` |
| `404` | Not Found | Resource does not exist | `NOT_FOUND`, `SCHEMA_NOT_FOUND`, `RECORD_NOT_FOUND` |
| `405` | Method Not Allowed | HTTP method not supported | `UNSUPPORTED_METHOD` |
| `409` | Conflict | Request conflicts with current state | `CONFLICT`, `DEPENDENCY_ERROR` |
| `413` | Request Too Large | Request body exceeds size limit | `REQUEST_BODY_TOO_LARGE` |
| `415` | Unsupported Media | Content-Type not supported | `UNSUPPORTED_CONTENT_TYPE` |
| `422` | Unprocessable Entity | Well-formed but semantically invalid | `UNPROCESSABLE_ENTITY` |
| `500` | Internal Server Error | Unexpected server error | `INTERNAL_ERROR`, `DATABASE_ERROR` |

### Error Code Reference

#### Schema Management Errors
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `SCHEMA_NOT_FOUND` | Requested schema does not exist | 404 |
| `SCHEMA_PROTECTED` | Cannot modify system-protected schema | 403 |
| `SCHEMA_INVALID_FORMAT` | Schema definition has invalid format | 400 |
| `SCHEMA_MISSING_FIELDS` | Schema missing required fields | 400 |
| `SCHEMA_EXISTS` | Schema already exists (conflict) | 409 |

#### Authentication & Authorization Errors
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `UNAUTHORIZED` | Missing or invalid authentication | 401 |
| `TOKEN_EXPIRED` | JWT token has expired | 401 |
| `FORBIDDEN` | Insufficient permissions | 403 |
| `ACCESS_DENIED` | Access denied to resource | 403 |
| `TENANT_MISSING` | Tenant not found or invalid | 401 |

#### Request Validation Errors
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `VALIDATION_ERROR` | General validation failure | 400 |
| `JSON_PARSE_ERROR` | Invalid JSON format | 400 |
| `MISSING_CONTENT_TYPE` | Content-Type header missing | 400 |
| `UNSUPPORTED_CONTENT_TYPE` | Content-Type not supported | 415 |
| `REQUEST_BODY_TOO_LARGE` | Request exceeds 10MB limit | 413 |

#### Data Operation Errors
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `RECORD_NOT_FOUND` | Requested record does not exist | 404 |
| `RECORD_ALREADY_EXISTS` | Record exists (unique constraint) | 409 |
| `DEPENDENCY_ERROR` | Conflicts with dependencies | 409 |
| `DATABASE_ERROR` | Database operation failed | 500 |

### Error Code Naming Convention

Error codes follow `SUBJECT_FIRST` pattern for logical grouping:

- **Schema errors**: `SCHEMA_NOT_FOUND`, `SCHEMA_PROTECTED`
- **Record errors**: `RECORD_NOT_FOUND`, `RECORD_ALREADY_EXISTS`
- **Auth errors**: `TENANT_MISSING`, `TOKEN_EXPIRED`
- **Request errors**: `JSON_PARSE_ERROR`, `MISSING_CONTENT_TYPE`

This enables:
- **Logical grouping**: All schema errors start with `SCHEMA_*`
- **Easy filtering**: `errorCode.startsWith('SCHEMA_')`
- **Consistent sorting**: Related errors group alphabetically

### Client Error Handling Example

```javascript
try {
  const response = await fetch('/api/describe/users', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(schemaData)
  });

  const result = await response.json();

  if (!result.success) {
    // Handle specific error codes
    switch (result.error_code) {
      case 'SCHEMA_NOT_FOUND':
        console.error('Schema does not exist:', result.error);
        break;
      case 'JSON_PARSE_ERROR':
        console.error('Invalid JSON:', result.data?.details);
        break;
      case 'SCHEMA_PROTECTED':
        console.error('Cannot modify protected schema');
        break;
      default:
        console.error('API Error:', result.error_code, result.error);
    }
  }
} catch (error) {
  console.error('Network or parsing error:', error);
}
```

### Error Handling Best Practices

1. **Check HTTP status code** for error category
2. **Use `error_code`** for specific error handling logic
3. **Display `error` message** to users when appropriate
4. **Process `data` field** for additional context
5. **Implement retry logic** for transient errors (5xx)
6. **Log errors** with correlation IDs for debugging

## Architecture Highlights

- **Ultra-Fast Performance**: Hono framework with ~50KB footprint and multi-runtime support
- **Schema-Driven**: JSON Schema validation with automatic database DDL generation
- **Multi-Tenant**: Automatic tenant isolation with dedicated PostgreSQL databases
- **Self-Documenting**: Complete API reference served via HTTP endpoints
- **Enterprise Security**: Sophisticated authentication with privilege escalation and ACL management
- **Audit Ready**: Comprehensive change tracking and history for compliance requirements
- **Advanced Querying**: Powerful filtering, aggregation, and batch operations

For detailed implementation examples, request/response formats, and integration guidance, visit the specific API documentation endpoints listed above.
