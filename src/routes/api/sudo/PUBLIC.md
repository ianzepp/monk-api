# Sudo API

The Sudo API provides infrastructure management and user administration operations that require explicit privilege escalation through short-lived sudo tokens.

## Base Path
- **Protected routes**: `/api/sudo/*` (sudo token required)

## Endpoint Summary

### Infrastructure Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sudo/templates` | List all templates |
| GET | `/api/sudo/templates/:name` | Get template details |
| GET | `/api/sudo/sandboxes` | List all sandboxes |
| GET | `/api/sudo/sandboxes/:name` | Get sandbox details |
| POST | `/api/sudo/sandboxes` | Create sandbox from template |
| DELETE | `/api/sudo/sandboxes/:name` | Delete sandbox |
| POST | `/api/sudo/sandboxes/:name/extend` | Extend sandbox expiration |
| GET | `/api/sudo/snapshots` | List tenant's snapshots |
| GET | `/api/sudo/snapshots/:name` | Get snapshot details |
| POST | `/api/sudo/snapshots` | Create snapshot (async) |
| DELETE | `/api/sudo/snapshots/:name` | Delete snapshot |

### User Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sudo/users` | Create new user in current tenant |
| PATCH | `/api/sudo/users/:id` | Update existing user |
| DELETE | `/api/sudo/users/:id` | Delete user (soft delete) |

## Content Type
- **Request**: `application/json` or `application/yaml`
- **Response**: `application/json` or `application/yaml`

---

## Authentication

All Sudo API endpoints require a valid **sudo token** obtained from `POST /api/user/sudo`. Regular JWTs, even with `access='root'`, are not sufficient.

```bash
Authorization: Bearer <sudo_token>
```

### Getting a Sudo Token

1. User must have `access='root'` in their base JWT
2. Request sudo token via `POST /api/user/sudo`
3. Sudo token expires after 15 minutes
4. Use sudo token for `/api/sudo/*` operations

---

## Infrastructure Concepts

### Templates
**Immutable database prototypes** used to quickly create tenants and sandboxes.

- **Location**: `monk_template_*` databases
- **Purpose**: Pre-configured models and data for fast tenant provisioning
- **Default**: `system` template (minimal system tables)
- **Examples**: `testing` (with test data), `demo` (with sample data)

### Sandboxes
**Temporary experimental environments** for testing changes without affecting production.

- **Location**: `sandbox_*` databases
- **Purpose**: Safe testing environment with automatic cleanup
- **Lifecycle**: Can have expiration dates
- **Ownership**: Team-scoped (belongs to parent tenant)
- **Source**: Created from templates or tenants

### Snapshots
**Point-in-time backups** of tenant databases for disaster recovery.

- **Location**: `snapshot_*` databases (stored in tenant DB metadata)
- **Purpose**: Backup before migrations, disaster recovery
- **Processing**: Async via observer pipeline (non-blocking)
- **Status**: `pending` → `processing` → `active` or `failed`
- **Immutability**: Read-only after creation
- **Restriction**: Only from tenant databases (not sandboxes)

---

## Infrastructure Management Endpoints

### GET /api/sudo/templates

List all available templates.

#### Request
```bash
GET /api/sudo/templates
Authorization: Bearer <sudo_token>
```

#### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "default",
      "database": "monk_template_system",
      "description": "Minimal system template",
      "is_system": true,
      "model_count": 3,
      "record_count": 1,
      "created_at": "2025-11-13T12:00:00.000Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "testing",
      "database": "monk_template_testing",
      "description": "Test fixture with sample data",
      "parent_template": "default",
      "is_system": false,
      "model_count": 5,
      "record_count": 10,
      "created_at": "2025-11-13T12:05:00.000Z"
    }
  ]
}
```

---

### GET /api/sudo/templates/:name

Get detailed information about a specific template.

#### Request
```bash
GET /api/sudo/templates/testing
Authorization: Bearer <sudo_token>
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "testing",
    "database": "monk_template_testing",
    "description": "Test fixture with sample data",
    "parent_template": "default",
    "is_system": false,
    "model_count": 5,
    "record_count": 10,
    "size_bytes": 2048000,
    "created_at": "2025-11-13T12:05:00.000Z"
  }
}
```

---

### GET /api/sudo/sandboxes

List all sandboxes (tenant-scoped).

#### Request
```bash
GET /api/sudo/sandboxes
Authorization: Bearer <sudo_token>
```

#### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "name": "acme-sandbox-abc123",
      "database": "sandbox_acme_abc123",
      "description": "Testing v3 migration",
      "parent_tenant_id": "550e8400-e29b-41d4-a716-446655440000",
      "parent_template": "default",
      "created_by": "660e8400-e29b-41d4-a716-446655440000",
      "created_at": "2025-11-13T14:00:00.000Z",
      "expires_at": "2025-11-20T14:00:00.000Z",
      "is_active": true
    }
  ]
}
```

---

### POST /api/sudo/sandboxes

Create a new sandbox from a template.

#### Request
```bash
POST /api/sudo/sandboxes
Authorization: Bearer <sudo_token>
Content-Type: application/json

{
  "template": "testing",
  "description": "Testing new feature",
  "expires_in_days": 7
}
```

#### Request Body Fields
- **template** (string, required): Template name to clone
- **description** (string, optional): Purpose of sandbox
- **expires_in_days** (number, optional): Days until auto-expiration (default: 7)

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "name": "acme-sandbox-xyz789",
    "database": "sandbox_acme_xyz789",
    "description": "Testing new feature",
    "parent_tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "parent_template": "testing",
    "created_by": "660e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-11-13T15:00:00.000Z",
    "expires_at": "2025-11-20T15:00:00.000Z",
    "is_active": true
  }
}
```

---

### GET /api/sudo/sandboxes/:name

Get detailed information about a specific sandbox.

#### Request
```bash
GET /api/sudo/sandboxes/acme-sandbox-xyz789
Authorization: Bearer <sudo_token>
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "name": "acme-sandbox-xyz789",
    "database": "sandbox_acme_xyz789",
    "description": "Testing new feature",
    "parent_tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "parent_template": "testing",
    "created_by": "660e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-11-13T15:00:00.000Z",
    "expires_at": "2025-11-20T15:00:00.000Z",
    "last_accessed_at": "2025-11-13T16:30:00.000Z",
    "is_active": true
  }
}
```

---

### DELETE /api/sudo/sandboxes/:name

Delete a sandbox and its database.

#### Request
```bash
DELETE /api/sudo/sandboxes/acme-sandbox-xyz789
Authorization: Bearer <sudo_token>
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "message": "Sandbox 'acme-sandbox-xyz789' deleted successfully"
  }
}
```

---

### POST /api/sudo/sandboxes/:name/extend

Extend sandbox expiration date.

#### Request
```bash
POST /api/sudo/sandboxes/acme-sandbox-xyz789/extend
Authorization: Bearer <sudo_token>
Content-Type: application/json

{
  "days": 14
}
```

#### Request Body Fields
- **days** (number, required): Number of days to extend from now

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "name": "acme-sandbox-xyz789",
    "expires_at": "2025-11-27T15:00:00.000Z"
  }
}
```

---

### GET /api/sudo/snapshots

List all snapshots for the current tenant.

#### Request
```bash
GET /api/sudo/snapshots
Authorization: Bearer <sudo_token>
```

#### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "name": "pre-v3-migration",
      "database": "snapshot_acme_abc123",
      "description": "Backup before v3 model changes",
      "status": "active",
      "snapshot_type": "pre_migration",
      "size_bytes": 5242880,
      "record_count": 150,
      "created_by": "660e8400-e29b-41d4-a716-446655440000",
      "created_at": "2025-11-13T10:00:00.000Z",
      "expires_at": null
    }
  ]
}
```

---

### POST /api/sudo/snapshots

Create a new snapshot (async operation).

**Note**: This operation is non-blocking. The API returns immediately with `status='pending'`, and an async observer processes the snapshot in the background. Poll the GET endpoint to check completion status.

#### Request
```bash
POST /api/sudo/snapshots
Authorization: Bearer <sudo_token>
Content-Type: application/json

{
  "name": "pre-migration-backup",
  "description": "Before v4 migration",
  "snapshot_type": "pre_migration"
}
```

#### Request Body Fields
- **name** (string, optional): Unique snapshot name (auto-generated if omitted)
- **description** (string, optional): Purpose of snapshot
- **snapshot_type** (string, optional): Type - `manual`, `auto`, `pre_migration`, `scheduled` (default: `manual`)
- **expires_in_days** (number, optional): Days until auto-expiration

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "aa0e8400-e29b-41d4-a716-446655440000",
    "name": "pre-migration-backup",
    "database": "snapshot_acme_def456",
    "description": "Before v4 migration",
    "status": "pending",
    "snapshot_type": "pre_migration",
    "created_by": "660e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-11-13T17:00:00.000Z"
  }
}
```

**Workflow:**
1. POST creates snapshot record with `status='pending'` (returns immediately)
2. Async observer detects pending snapshot → updates to `status='processing'`
3. Observer runs `pg_dump` and `pg_restore` in background
4. Observer updates both source and snapshot databases to `status='active'`
5. Observer locks snapshot database as read-only
6. Poll GET `/api/sudo/snapshots/:name` to check `status` field

**Status Values:**
- `pending` - Queued for processing
- `processing` - Background backup in progress
- `active` - Snapshot complete and available
- `failed` - Error occurred (check `error_message` field)

---

### GET /api/sudo/snapshots/:name

Get detailed information about a specific snapshot (poll for status).

#### Request
```bash
GET /api/sudo/snapshots/pre-migration-backup
Authorization: Bearer <sudo_token>
```

#### Success Response (200) - Pending
```json
{
  "success": true,
  "data": {
    "id": "aa0e8400-e29b-41d4-a716-446655440000",
    "name": "pre-migration-backup",
    "database": "snapshot_acme_def456",
    "status": "pending",
    "created_at": "2025-11-13T17:00:00.000Z"
  }
}
```

#### Success Response (200) - Active
```json
{
  "success": true,
  "data": {
    "id": "aa0e8400-e29b-41d4-a716-446655440000",
    "name": "pre-migration-backup",
    "database": "snapshot_acme_def456",
    "description": "Before v4 migration",
    "status": "active",
    "snapshot_type": "pre_migration",
    "size_bytes": 5242880,
    "record_count": 150,
    "created_by": "660e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-11-13T17:00:00.000Z",
    "updated_at": "2025-11-13T17:02:30.000Z"
  }
}
```

#### Success Response (200) - Failed
```json
{
  "success": true,
  "data": {
    "id": "aa0e8400-e29b-41d4-a716-446655440000",
    "name": "pre-migration-backup",
    "status": "failed",
    "error_message": "pg_dump failed: out of disk space",
    "created_at": "2025-11-13T17:00:00.000Z",
    "updated_at": "2025-11-13T17:01:15.000Z"
  }
}
```

---

### DELETE /api/sudo/snapshots/:name

Delete a snapshot and its database.

#### Request
```bash
DELETE /api/sudo/snapshots/pre-migration-backup
Authorization: Bearer <sudo_token>
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "message": "Snapshot 'pre-migration-backup' deleted successfully"
  }
}
```

---

## User Management Endpoints

### POST /api/sudo/users

Create a new user within the current tenant.

#### Request
```bash
POST /api/sudo/users
Authorization: Bearer <sudo_token>
Content-Type: application/json

{
  "name": "John Doe",
  "auth": "john@example.com",
  "access": "full",
  "access_read": [],
  "access_edit": [],
  "access_full": []
}
```

#### Request Body Fields
- **name** (string, required): Display name for the user
- **auth** (string, required): Authentication identifier (username/email), must be unique
- **access** (string, required): Access level - `deny|read|edit|full|root`
- **access_read** (array, optional): Record-level read ACL (UUID array)
- **access_edit** (array, optional): Record-level edit ACL (UUID array)
- **access_full** (array, optional): Record-level full ACL (UUID array)

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "auth": "john@example.com",
    "access": "full",
    "access_read": [],
    "access_edit": [],
    "access_full": [],
    "access_deny": [],
    "created_at": "2025-11-13T12:00:00.000Z",
    "updated_at": "2025-11-13T12:00:00.000Z"
  }
}
```

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `JWT_REQUIRED` | "Valid JWT required for sudo operations" | No JWT provided |
| 403 | `SUDO_TOKEN_REQUIRED` | "Sudo token required - use POST /api/user/sudo to get short-lived sudo access" | Not a sudo token |
| 409 | `DUPLICATE_AUTH` | "User with auth 'john@example.com' already exists" | Username/email already taken |

---

### PATCH /api/sudo/users/:id

Update an existing user in the current tenant.

#### Request
```bash
PATCH /api/sudo/users/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <sudo_token>
Content-Type: application/json

{
  "access": "edit",
  "name": "Jane Doe (Updated)"
}
```

#### Request Body
Any user fields to update (partial update supported):
- `name`, `access`, `access_read`, `access_edit`, `access_full`, etc.

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Jane Doe (Updated)",
    "access": "edit",
    // ... other fields
  }
}
```

---

### DELETE /api/sudo/users/:id

Delete a user from the current tenant (soft delete by default).

#### Request
```bash
DELETE /api/sudo/users/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <sudo_token>
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "trashed_at": "2025-11-13T12:05:00.000Z"
  }
}
```

---

## Security Model

### Sudo Token Requirements
- Must have `access='root'` in base JWT
- Must request sudo token via `POST /api/user/sudo`
- Sudo token contains `is_sudo: true` flag
- Sudo token expires after 15 minutes
- Each dangerous operation requires fresh sudo token

### Why Explicit Sudo?
Even users with `access='root'` must explicitly escalate because:
1. **Audit Trail**: Logs when dangerous operations are requested
2. **Time-Limited**: Reduces window for accidental operations
3. **Explicit Intent**: Forces conscious decision for user management
4. **Security**: Long-lived root JWTs cannot directly modify users

### Tenant Isolation
All `/api/sudo/*` operations are **tenant-scoped**:
- Can only manage users within your own tenant
- Cannot see or modify users in other tenants
- No cross-tenant sudo operations
- Maintains proper multi-tenant security boundaries

---

## Common Use Cases

### Creating a New Team Member
```bash
# 1. Get sudo token (15 min)
SUDO_TOKEN=$(curl -X POST http://localhost:9001/api/user/sudo \
  -H "Authorization: Bearer $ROOT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Adding new team member"}' | jq -r '.data.root_token')

# 2. Create user
curl -X POST http://localhost:9001/api/sudo/users \
  -H "Authorization: Bearer $SUDO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Smith",
    "auth": "alice@company.com",
    "access": "edit"
  }'
```

### Updating User Access Level
```bash
# 1. Get sudo token
SUDO_TOKEN=$(curl -X POST http://localhost:9001/api/user/sudo \
  -H "Authorization: Bearer $ROOT_JWT" \
  -d '{"reason": "Promoting user to full access"}' | jq -r '.data.root_token')

# 2. Update user
curl -X PATCH http://localhost:9001/api/sudo/users/$USER_ID \
  -H "Authorization: Bearer $SUDO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"access": "full"}'
```

### Removing a User
```bash
# 1. Get sudo token
SUDO_TOKEN=$(curl -X POST http://localhost:9001/api/user/sudo \
  -H "Authorization: Bearer $ROOT_JWT" \
  -d '{"reason": "Removing inactive user"}' | jq -r '.data.root_token')

# 2. Delete user (soft delete)
curl -X DELETE http://localhost:9001/api/sudo/users/$USER_ID \
  -H "Authorization: Bearer $SUDO_TOKEN"
```

---

## Common Infrastructure Workflows

### Creating a Test Sandbox

```bash
# 1. Get sudo token
SUDO_TOKEN=$(curl -X POST http://localhost:9001/api/user/sudo \
  -H "Authorization: Bearer $ROOT_JWT" \
  -d '{"reason": "Creating test sandbox"}' | jq -r '.data.root_token')

# 2. Create sandbox from testing template
SANDBOX=$(curl -X POST http://localhost:9001/api/sudo/sandboxes \
  -H "Authorization: Bearer $SUDO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "testing",
    "description": "Testing v3 API changes",
    "expires_in_days": 7
  }')

SANDBOX_NAME=$(echo $SANDBOX | jq -r '.data.name')
echo "Sandbox created: $SANDBOX_NAME"

# 3. Use sandbox (switch tenant context)
# Login to sandbox as you would a normal tenant
```

---

### Pre-Migration Snapshot Workflow

```bash
# 1. Get sudo token
SUDO_TOKEN=$(curl -X POST http://localhost:9001/api/user/sudo \
  -H "Authorization: Bearer $ROOT_JWT" \
  -d '{"reason": "Creating pre-migration snapshot"}' | jq -r '.data.root_token')

# 2. Create snapshot (async, returns immediately)
SNAPSHOT=$(curl -X POST http://localhost:9001/api/sudo/snapshots \
  -H "Authorization: Bearer $SUDO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "pre-v4-migration",
    "description": "Before v4 model migration",
    "snapshot_type": "pre_migration"
  }')

SNAPSHOT_NAME=$(echo $SNAPSHOT | jq -r '.data.name')
echo "Snapshot queued: $SNAPSHOT_NAME"

# 3. Poll for completion (check every 5 seconds)
while true; do
  STATUS=$(curl -s http://localhost:9001/api/sudo/snapshots/$SNAPSHOT_NAME \
    -H "Authorization: Bearer $SUDO_TOKEN" | jq -r '.data.status')
  
  echo "Snapshot status: $STATUS"
  
  if [ "$STATUS" = "active" ]; then
    echo "Snapshot completed successfully"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Snapshot failed"
    curl -s http://localhost:9001/api/sudo/snapshots/$SNAPSHOT_NAME \
      -H "Authorization: Bearer $SUDO_TOKEN" | jq '.data.error_message'
    exit 1
  fi
  
  sleep 5
done

# 4. Run migration
echo "Running migration..."
# ... run your migration ...

# 5. If migration succeeds, keep snapshot for retention policy
# If migration fails, restore from snapshot (future feature)
```

---

### Sandbox Testing Before Production Deployment

```bash
# 1. Get sudo token
SUDO_TOKEN=$(curl -X POST http://localhost:9001/api/user/sudo \
  -H "Authorization: Bearer $ROOT_JWT" \
  -d '{"reason": "Testing production changes"}' | jq -r '.data.root_token')

# 2. Create snapshot of production tenant
curl -X POST http://localhost:9001/api/sudo/snapshots \
  -H "Authorization: Bearer $SUDO_TOKEN" \
  -d '{"name": "before-feature-test", "snapshot_type": "manual"}'

# 3. Create sandbox from production template
SANDBOX=$(curl -X POST http://localhost:9001/api/sudo/sandboxes \
  -H "Authorization: Bearer $SUDO_TOKEN" \
  -d '{
    "template": "default",
    "description": "Testing feature before prod deployment",
    "expires_in_days": 3
  }')

SANDBOX_NAME=$(echo $SANDBOX | jq -r '.data.name')

# 4. Test changes in sandbox
# Login to sandbox and test your changes

# 5. If successful, apply to production
# If failed, delete sandbox (production unchanged)
curl -X DELETE http://localhost:9001/api/sudo/sandboxes/$SANDBOX_NAME \
  -H "Authorization: Bearer $SUDO_TOKEN"
```

---

### Extending Sandbox Expiration

```bash
# 1. Get sudo token
SUDO_TOKEN=$(curl -X POST http://localhost:9001/api/user/sudo \
  -H "Authorization: Bearer $ROOT_JWT" \
  -d '{"reason": "Extending sandbox"}' | jq -r '.data.root_token')

# 2. Extend sandbox by 14 days
curl -X POST http://localhost:9001/api/sudo/sandboxes/my-sandbox-abc123/extend \
  -H "Authorization: Bearer $SUDO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": 14}'
```

---

## Infrastructure Security Model

### Tenant Isolation
- **Templates**: Global read access, used by all tenants
- **Sandboxes**: Tenant-scoped (team members can access parent tenant's sandboxes)
- **Snapshots**: Tenant-scoped (stored in tenant database, not central registry)

### Access Control
All infrastructure operations require:
1. Valid JWT with `access='root'`
2. Sudo token (explicit escalation via `/api/user/sudo`)
3. Sudo token expires after 15 minutes

### Sandbox Ownership Model
Sandboxes belong to the **parent tenant**, not individual users:
- All team members with sudo access can manage tenant's sandboxes
- `created_by` field tracks creator for audit purposes only
- Supports team collaboration and handoff scenarios

### Snapshot Restrictions
- **Source**: Only tenant databases (not sandboxes)
- **Scope**: Tenant-scoped (can't see other tenants' snapshots)
- **Immutability**: Read-only after creation (`default_transaction_read_only = on`)
- **Storage**: Metadata in tenant database, physical DB separate

---

## Best Practices

### Template Usage
- Use `system` template for production tenants (minimal overhead)
- Use `testing` template for development/test environments
- Create custom templates for specific use cases

### Sandbox Management
- **Short-lived**: Set realistic expiration dates (7-14 days)
- **Cleanup**: Delete sandboxes when testing complete
- **Naming**: Use descriptive names (purpose, feature, ticket number)
- **Extend conservatively**: Only extend if actively using

### Snapshot Strategy
- **Pre-migration**: Always snapshot before model changes
- **Scheduled**: Consider daily/weekly snapshots for critical tenants
- **Retention**: Delete old snapshots to save disk space
- **Polling**: Check status every 5-10 seconds (snapshots can take minutes)
- **Naming**: Use meaningful names with dates or versions

### Performance Considerations
- **Template cloning**: Fast (~0.1s regardless of size)
- **Snapshot creation**: Slow (proportional to database size, async)
- **Disk space**: Snapshots consume significant storage
- **Cleanup**: Regular deletion prevents disk exhaustion

---

## Error Handling

### Common Errors

| Status | Error Code | Message | Solution |
|--------|------------|---------|----------|
| 401 | `JWT_REQUIRED` | "Valid JWT required" | Provide JWT token |
| 403 | `SUDO_TOKEN_REQUIRED` | "Sudo token required" | Get sudo token via `/api/user/sudo` |
| 404 | `TEMPLATE_NOT_FOUND` | "Template 'xyz' not found" | Check template name, use `/api/sudo/templates` to list |
| 404 | `SANDBOX_NOT_FOUND` | "Sandbox 'xyz' not found" | Verify sandbox exists in current tenant |
| 404 | `SNAPSHOT_NOT_FOUND` | "Snapshot 'xyz' not found" | Verify snapshot exists in current tenant |
| 409 | `DUPLICATE_NAME` | "Sandbox/Snapshot already exists" | Use unique name or delete existing |
| 422 | `INVALID_SOURCE` | "Cannot snapshot from sandbox" | Snapshots only from tenant databases |

### Snapshot Failure Handling

If snapshot creation fails (`status='failed'`):

1. **Check error message**: `GET /api/sudo/snapshots/:name` → `error_message` field
2. **Common causes**:
   - Insufficient disk space
   - Database too large for timeout
   - Connection issues during pg_dump
   - Permission errors
3. **Recovery**: Delete failed snapshot, fix issue, retry

---

**Related**: [Auth API Documentation](auth/PUBLIC.md) - Public authentication and sudo token acquisition
