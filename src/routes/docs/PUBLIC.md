# Monk API

**Ultra-lightweight PaaS backend** built with Hono and TypeScript, featuring model-first development, multi-tenant architecture, and innovative filesystem-like data access for building high-performance SaaS applications.

## API Architecture

### Public Routes (No Authentication Required)
| API | Endpoints | Purpose |
|-----|-----------|---------|
| **Health Check** | `/health` | System health status and uptime |
| **Public Auth** | `/auth/*` | Auth0-backed tenant provisioning and Monk token issuance |
| **Documentation** | `/docs/*` | Self-documenting API reference |

### Protected Routes (Monk Bearer Token or API Key Required)
| API | Endpoints | Purpose |
|-----|-----------|---------|
| **User API** | `/api/user/*` | User identity and tenant user management |
| **Data API** | `/api/data/:model[/:id]` | CRUD operations for model records |
| **Describe API** | `/api/describe/:model[/fields[/:field]]` | Model definition and field management |
| **Find API** | `/api/find/:model` | Advanced search and filtering with 25+ operators |
| **Aggregate API** | `/api/aggregate/:model` | Data aggregation and analytics operations |
| **Bulk API** | `/api/bulk` | Batch operations across multiple models |
| **ACLs API** | `/api/acls/:model/:id` | Access control list management for records |
| **Stat API** | `/api/stat/:model/:id` | Record metadata (timestamps, etag, size) |
| **Tracked API** | `/api/tracked/:model/:id[/:change]` | Change tracking and audit trails |
| **Trashed API** | `/api/trashed/*` | Soft-delete inspection, restore, and purge workflows |
| **Cron API** | `/api/cron/*` | Scheduled process management |
| **Filesystem API** | `/fs/*` | Tenant-scoped virtual filesystem access |

## Key Features

- **Model-First Development**: Define data models with in-house validation and automatic PostgreSQL table generation
- **Multi-Tenant Architecture**: Schema-isolated tenants with Monk-owned tenant routing and authorization
- **Advanced Filtering**: 25+ filter operators with complex logical operations and ACL integration
- **Change Tracking**: Comprehensive audit trails with field-level tracking for all record modifications
- **Privilege Escalation**: Enterprise-grade sudo model with time-limited root access for administrative operations
- **Observer System**: Ring-based business logic execution (0-9 rings) for extensible data processing
- **Access Control**: Fine-grained ACL management at the record level for security and permissions

## Authentication Model

### Production Auth
1. **Public Access**: Documentation and tenant provisioning boundary (`/auth/register`)
2. **Protected Access**: Monk bearer token minted by Monk or supported API key flow
3. **Authorization Source**: Monk tenant registry and tenant-local user state

### Auth Flow
- Clients send tenant-scoped credentials to Monk on `/auth/register` or `/auth/login`.
- Monk uses Auth0 as the upstream identity and secrets broker for registration and password verification.
- Monk provisions or resolves Monk-local tenant and user state, then mints the bearer token used on protected Monk routes.
- Protected Monk routes authorize against Monk-owned tenant routing, access, ACL arrays, and sudo state rather than trusting upstream role claims.

### Authentication Header

Include the bearer token in protected API requests:

```bash
Authorization: Bearer <monk_bearer_token>
```

## API Discovery

Use the root endpoint to discover all available APIs and their documentation:

```bash
curl http://localhost:9001/

# Response is the human-facing HTML root page.
# For the agent-facing markdown entrypoint, use /llms.txt.
# Start from the docs links on the root page.
```

## LLM Navigation Notes

When exploring docs, prefer the exact router-shaped paths below instead of guessing shorter forms.
If a guessed path 404s, use the overview page listed here and then follow the links.

### Overview pages
- `/docs` → API discovery
- `/docs/auth` → authentication
- `/docs/api/data` → data API
- `/docs/api/describe` → describe API
- `/docs/api/find` → find API
- `/docs/api/aggregate` → aggregate API
- `/docs/api/bulk` → bulk API
- `/docs/api/acls` → ACLs API
- `/docs/api/stat` → stat API
- `/docs/api/tracked` → tracked API
- `/docs/api/trashed` → trashed API
- `/docs/api/user` → user API
- `/docs/api/cron` → cron API
- `/docs/fs` → filesystem API

### Endpoint docs examples
- `/docs/api/describe/GET`
- `/docs/api/describe/model/GET`
- `/docs/api/describe/model/POST`
- `/docs/api/describe/model/PUT`
- `/docs/api/describe/model/DELETE`
- `/docs/api/describe/model/fields/GET`
- `/docs/api/describe/model/fields/POST`
- `/docs/api/describe/model/fields/PUT`
- `/docs/api/describe/model/fields/field/GET`
- `/docs/api/describe/model/fields/field/POST`
- `/docs/api/describe/model/fields/field/PUT`
- `/docs/api/describe/model/fields/field/DELETE`
- `/docs/api/find/model/POST`
- `/docs/api/find/model/target/GET`
- `/docs/api/cron/GET`
- `/docs/api/cron/POST`
- `/docs/api/cron/pid/GET`
- `/docs/api/cron/pid/PATCH`
- `/docs/api/cron/pid/DELETE`
- `/docs/api/cron/pid/enable/POST`
- `/docs/api/cron/pid/disable/POST`

---

## Documentation Navigation

This API is fully self-documenting with three levels of documentation depth.

**You are here**: `/docs` (API Discovery - Level 1)

This page lists all available APIs. See the `documentation` section above for API-specific documentation URLs.

### Next: Explore API Overviews (Level 2)

Navigate to `/docs/api/{api}` for protected APIs or `/docs/auth` for authentication to see:
- Complete endpoint table with all operations
- Request/response formats and examples
- Authentication requirements
- Quick start guides

**Available API Documentation**:
- `/docs/api/describe` - Model and field management
- `/docs/api/data` - CRUD operations on records
- `/docs/api/find` - Advanced querying with filters
- `/docs/api/aggregate` - Data aggregation and analytics
- `/docs/api/bulk` - Batch operations across models
- `/docs/api/acls` - Access control management
- `/docs/api/stat` - Record metadata access
- `/docs/api/tracked` - Change tracking and audit trails
- `/docs/auth` - Authentication and tenant provisioning
- `/docs/api/user` - User account management
- `/docs/api/trashed` - Trashed record management
- `/docs/api/cron` - Scheduled process management
- `/docs/fs` - Tenant-scoped filesystem access

### Then: Access Endpoint-Specific Docs (Level 3)

From an API overview page, you'll see an endpoint table like:

```
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/describe/:model | Get model metadata |
```

To get detailed documentation for a specific endpoint, construct the URL:

**Mapping Rules**:
1. Take the API endpoint: `GET /api/describe/:model`
2. Replace parameter placeholders with literal names:
   - `:model` → `model`
   - `:field` → `field`
   - `:id` → `id`
   - `:relationship` → `relationship`
   - `:child` → `child`
3. Append HTTP method: `api/describe/model/GET`
4. Add `/docs/` prefix: `/docs/api/describe/model/GET`

**Examples**:
```
API Endpoint                              → Documentation URL
----------------------------------------- → ----------------------------------
GET    /api/describe                      → /docs/api/describe/GET
GET    /api/describe/:model              → /docs/api/describe/model/GET
POST   /api/describe/:model              → /docs/api/describe/model/POST
GET    /api/describe/:model/fields      → /docs/api/describe/model/fields/GET
GET    /api/describe/:model/fields/:field      → /docs/api/describe/model/fields/field/GET
DELETE /api/describe/:model/fields/:field      → /docs/api/describe/model/fields/field/DELETE

GET    /api/data/:model                  → /docs/api/data/model/GET
POST   /api/data/:model                  → /docs/api/data/model/POST
GET    /api/data/:model/:id              → /docs/api/data/model/id/GET
GET    /api/data/:model/:id/:relationship → /docs/api/data/model/id/relationship/GET

GET    /auth/login                        → /docs/auth/login/GET
POST   /auth/login                        → /docs/auth/login/POST
POST   /auth/register                     → /docs/auth/register/POST
```

**Exploration Workflow**:
1. **(You are here)** Read `/docs` to discover available APIs
2. Navigate to `/docs/api/describe` to see Describe API endpoint table
3. Find endpoint: `GET /api/describe/:model`
4. Apply mapping rules → `/docs/api/describe/model/GET`
5. Access `/docs/api/describe/model/GET` for complete endpoint documentation with examples, error codes, and use cases

## Documentation Guide

### Getting Started Documentation
- **Token Operations**: `/docs/auth` - Login, register, refresh workflows
- **User Management**: `/docs/api/user` - Account management and privilege escalation

### Core API Documentation
- **Data Management**: `/docs/api/data` - CRUD operations and record management
- **Model Management**: `/docs/api/describe` - Model definition and field management
- **Access Control**: `/docs/api/acls` - Record-level ACL management and permissions
- **Metadata Access**: `/docs/api/stat` - Record metadata without user data

### Advanced Operations
- **Complex Search**: `/docs/api/find` - Advanced filtering with 25+ operators
- **Data Aggregation**: `/docs/api/aggregate` - Analytics and aggregation operations
- **Batch Processing**: `/docs/api/bulk` - Multi-model transaction operations
- **Change Tracking**: `/docs/api/tracked` - Audit trails and change history
- **Deleted Records**: `/docs/api/trashed` - Restore and purge workflows
- **Scheduled Jobs**: `/docs/api/cron` - Cron job management and scheduling

## Common Operations Quick Reference

| Task | Endpoint | Method | Notes |
|------|----------|--------|-------|
| **Create one record** | `/api/data/:model` | POST | Single object body |
| **Create many records** | `/api/data/:model` | POST | Array body |
| **Read one record** | `/api/data/:model/:id` | GET | |
| **Read all records** | `/api/data/:model` | GET | |
| **Update one record** | `/api/data/:model/:id` | PUT | |
| **Update many records** | `/api/data/:model` | PUT | Array of `{id, ...fields}` |
| **Update by filter** | `/api/bulk` | POST | `operation: "update-any"` with `filter` and `data` |
| **Delete one record** | `/api/data/:model/:id` | DELETE | Soft delete |
| **Delete many records** | `/api/data/:model` | DELETE | Array of `{id}` |
| **Delete by filter** | `/api/bulk` | POST | `operation: "delete-any"` with `filter` |
| **Search with filters** | `/api/find/:model` | POST | 25+ filter operators |
| **Aggregate/Analytics** | `/api/aggregate/:model` | POST | `$sum`, `$avg`, `$count`, `$min`, `$max` with `groupBy` |
| **View change history** | `/api/tracked/:model/:id` | GET | Requires field tracking enabled |
| **Cross-model transaction** | `/api/bulk` | POST | Multiple operations, single transaction |

## Quick Start Workflow

1. **Health Check**: `GET /health` to verify system status
2. **Explore APIs**: `GET /` to discover available endpoints and documentation
3. **Authentication**: Follow `/docs/auth` to provision a tenant and mint a Monk bearer token for protected routes
4. **Model Setup**: Use `/docs/api/describe` to define your data structures
5. **Data Operations**: Use `/docs/api/data` for standard CRUD operations
6. **Advanced Features**: Explore `/docs/api/find`, `/docs/api/aggregate`, `/docs/api/bulk` for sophisticated data access
7. **Security & Auditing**: Use `/docs/api/acls` for permissions and `/docs/api/tracked` for audit trails

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
- `csv` - CSV tabular data (response-only, auto-unwraps, array of objects only)
- `msgpack` - Binary format (30-50% smaller, base64-encoded for HTTP)
- `markdown` - Markdown tables and formatting (response-only)
- `grid-compact` - Compact Grid API format (60% smaller, Grid API only, response-only)

**Examples:**
```bash
# Get response in TOON format (compact for LLMs)
curl http://localhost:9001/api/user/me?format=toon

# Get response as MessagePack binary (efficient)
curl http://localhost:9001/api/data/users?format=msgpack

# Get response as Markdown table
curl http://localhost:9001/api/describe?format=markdown

# Export user list as CSV (auto-unwraps data)
curl http://localhost:9001/api/find/users?format=csv > users.csv

# Get Grid app response in compact format (Grid app only, 60% smaller)
curl http://localhost:9001/app/grids/abc123/A1:Z100?format=grid-compact
```

**Alternative Methods:**
1. Query parameter: `?format=toon` (highest priority)
2. Accept header: `Accept: application/toon`

#### Field Extraction (`?unwrap` and `?select=`)

Extract specific fields server-side, eliminating the need for client-side processing:

**Unwrap (Remove Envelope):**
```bash
# Standard response with envelope
curl /api/user/me
# → {"success": true, "data": {"id": "...", "name": "...", ...}}

# Unwrapped response (just the data)
curl /api/user/me?unwrap
# → {"id": "...", "name": "...", ...}
```

**Select Specific Fields:**
```bash
# Extract single field (returns plain text)
curl /api/user/me?select=id
# → c81d0a9b-8d9a-4daf-9f45-08eb8bc3805c

# Extract multiple fields (returns JSON object)
curl /api/user/me?select=id,name,access
# → {"id": "...", "name": "...", "access": "..."}

# Nested field extraction
curl /api/data/users/123?select=profile.email
# → user@example.com
```

**Combined Usage:**
```bash
# Extract fields AND format output
curl /api/user/me?select=id,name&format=toon
# → id: c81d0a9b...
#   name: Demo User

# Extract a field and encode it as MessagePack
curl /api/user/me?select=id&format=msgpack \
  -H "Authorization: Bearer $MONK_TOKEN"
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

Encrypt API responses for secure transmission using AES-256-GCM with keys derived from the presented bearer token.

**Encryption Model:**
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Source**: Derived from the presented bearer token via PBKDF2
- **Output**: PGP-style ASCII armor format
- **Purpose**: Transport security (ephemeral, not long-term storage)

**Usage:**
```bash
# Encrypt any response
curl /api/user/me?encrypt=pgp \
  -H "Authorization: Bearer $MONK_TOKEN" > encrypted.txt

# Decrypt with the same bearer token material
tsx scripts/decrypt.ts "$MONK_TOKEN" < encrypted.txt

# Combine with formatting and field selection
curl /api/find/users?select=id,email&format=csv&encrypt=pgp \
  -H "Authorization: Bearer $MONK_TOKEN"
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
- Bearer token material IS the decryption key
- Token rotation/expiry means old messages become undecryptable
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
// Monk bearer token minted by /auth/login or /auth/register
const token = process.env.MONK_TOKEN;

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

# Monk bearer token minted by /auth/login or /auth/register
token = 'MONK_TOKEN'

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
# Monk bearer token minted by /auth/login or /auth/register
TOKEN=$MONK_TOKEN

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

# Bulk operations - batch create
curl -X POST https://api.example.com/api/bulk \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "operation": "create-all",
        "model": "users",
        "data": [{"name": "User 1"}, {"name": "User 2"}]
      }
    ]
  }'

# Bulk operations - batch update (update multiple records by ID)
curl -X POST https://api.example.com/api/bulk \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "operation": "update-all",
        "model": "products",
        "data": [
          {"id": "prod_1", "price": 29.99},
          {"id": "prod_2", "price": 39.99},
          {"id": "prod_3", "price": 49.99}
        ]
      }
    ]
  }'

# Bulk operations - batch update by filter (update all matching records)
curl -X POST https://api.example.com/api/bulk \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "operation": "update-any",
        "model": "orders",
        "filter": {"where": {"status": "pending"}},
        "data": {"status": "processing"}
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
- **Format**: `SUBJECT_FIRST` naming (e.g., `MODEL_NOT_FOUND`, `TENANT_MISSING`)
- **Stability**: Error codes are stable across API versions

**`data`** (Optional)
- **Type**: `object`
- **Purpose**: Additional structured error context
- **Development Mode**: Includes stack traces and debugging information

### HTTP Status Codes

| Status | Category | Description | Common Error Codes |
|--------|----------|-------------|-------------------|
| `400` | Bad Request | Invalid input, missing fields, malformed requests | `VALIDATION_ERROR`, `JSON_PARSE_ERROR`, `MODEL_ERROR` |
| `401` | Unauthorized | Authentication required or failed | `AUTH_TOKEN_REQUIRED`, `AUTH_TOKEN_EXPIRED`, `AUTH0_TOKEN_*` |
| `403` | Forbidden | Insufficient permissions | `FORBIDDEN`, `MODEL_PROTECTED`, `ACCESS_DENIED` |
| `404` | Not Found | Resource does not exist | `NOT_FOUND`, `MODEL_NOT_FOUND`, `RECORD_NOT_FOUND` |
| `405` | Method Not Allowed | HTTP method not supported | `UNSUPPORTED_METHOD` |
| `409` | Conflict | Request conflicts with current state | `CONFLICT`, `DEPENDENCY_ERROR` |
| `413` | Request Too Large | Request body exceeds size limit | `BODY_TOO_LARGE` |
| `415` | Unsupported Media | Content-Type not supported | `UNSUPPORTED_CONTENT_TYPE` |
| `422` | Unprocessable Entity | Well-formed but semantically invalid | `UNPROCESSABLE_ENTITY` |
| `500` | Internal Server Error | Unexpected server error | `INTERNAL_ERROR`, `DATABASE_ERROR` |

### Error Code Reference

#### Model Management Errors
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `MODEL_NOT_FOUND` | Requested model does not exist | 404 |
| `MODEL_PROTECTED` | Cannot modify system-protected model | 403 |
| `MODEL_INVALID_FORMAT` | Model definition has invalid format | 400 |
| `MODEL_MISSING_FIELDS` | Model missing required fields | 400 |
| `MODEL_EXISTS` | Model already exists (conflict) | 409 |

#### Authentication & Authorization Errors
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `UNAUTHORIZED` | Missing or invalid authentication | 401 |
| `AUTH_TOKEN_EXPIRED`, `AUTH0_TOKEN_EXPIRED` | Auth token has expired | 401 |
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
| `BODY_TOO_LARGE` | Request exceeds 10MB limit | 413 |

#### Data Operation Errors
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `RECORD_NOT_FOUND` | Requested record does not exist | 404 |
| `RECORD_ALREADY_EXISTS` | Record exists (unique constraint) | 409 |
| `DEPENDENCY_ERROR` | Conflicts with dependencies | 409 |
| `DATABASE_ERROR` | Database operation failed | 500 |

### Error Code Naming Convention

Error codes follow `SUBJECT_FIRST` pattern for logical grouping:

- **Model errors**: `MODEL_NOT_FOUND`, `MODEL_PROTECTED`
- **Record errors**: `RECORD_NOT_FOUND`, `RECORD_ALREADY_EXISTS`
- **Auth errors**: `AUTH_TOKEN_REQUIRED`, `AUTH_TOKEN_EXPIRED`, `AUTH0_TOKEN_*`
- **Request errors**: `JSON_PARSE_ERROR`, `MISSING_CONTENT_TYPE`

This enables:
- **Logical grouping**: All model errors start with `MODEL_*`
- **Easy filtering**: `errorCode.startsWith('MODEL_')`
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
    body: JSON.stringify(modelData)
  });

  const result = await response.json();

  if (!result.success) {
    // Handle specific error codes
    switch (result.error_code) {
      case 'MODEL_NOT_FOUND':
        console.error('Model does not exist:', result.error);
        break;
      case 'JSON_PARSE_ERROR':
        console.error('Invalid JSON:', result.data?.details);
        break;
      case 'MODEL_PROTECTED':
        console.error('Cannot modify protected model');
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
- **Model-Driven**: Field-based validation with automatic database DDL generation
- **Multi-Tenant**: Automatic tenant isolation via PostgreSQL schemas or SQLite files
- **Self-Documenting**: Complete API reference served via HTTP endpoints
- **Enterprise Security**: Sophisticated authentication with privilege escalation and ACL management
- **Audit Ready**: Comprehensive change tracking and history for compliance requirements
- **Advanced Querying**: Powerful filtering, aggregation, and batch operations

For detailed implementation examples, request/response formats, and integration guidance, visit the specific API documentation endpoints listed above.
