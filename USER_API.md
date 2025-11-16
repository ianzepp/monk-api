# User API Design Document

## Overview

The User API provides high-level user management operations with built-in business logic, security controls, and workflow automation. Unlike the generic Data API which provides direct CRUD access to the users table, the User API offers specialized endpoints for common user management tasks.

## Rationale

### Why a Dedicated User API?

1. **Self-Service Operations**: Users should update their own profiles without requiring sudo access
2. **Security Boundaries**: Prevent privilege escalation (users can't change their own access level)
3. **Business Logic**: Password hashing, email validation, uniqueness checks, etc.
4. **Audit Trail**: Track who changed access levels, with reasons and timestamps
5. **Workflows**: User invitations, password resets, account activation/deactivation
6. **Convenience**: Simplified operations for common user management tasks

### Comparison: Data API vs User API

| Feature | Data API (`/api/data/users`) | User API (`/api/user/*`) |
|---------|------------------------------|--------------------------|
| **Access Model** | All operations require sudo (table has `sudo=true`) | Self-service ops don't require sudo |
| **Purpose** | Generic CRUD operations | User-specific workflows |
| **Business Logic** | None - raw database operations | Built-in validation and rules |
| **Self-Update** | ❌ Can't update own profile without sudo | ✅ Can update own profile |
| **Access Control** | ❌ No protection against privilege escalation | ✅ Protected - can't change own access level |
| **Password Management** | Manual hashing required | Automatic hashing, validation |
| **Audit Logging** | Generic operation logs | Detailed user-specific audit trail |
| **Use Case** | Direct database manipulation | User management workflows |

## Architecture

### Base Path
- `/api/user/*` - Protected routes requiring JWT authentication

### Authentication Requirements

| Endpoint Category | JWT Required | Sudo Required | Access Level |
|------------------|--------------|---------------|--------------|
| Self-Service | ✅ Yes | ❌ No | Any authenticated user |
| Admin Read | ✅ Yes | ✅ Yes | root or full (with sudo) |
| Admin Write | ✅ Yes | ✅ Yes | root or full (with sudo) |

### Design Principles

1. **Principle of Least Privilege**: Self-service operations don't need sudo
2. **Audit Everything**: All admin operations logged with user, timestamp, reason
3. **Immutable Access Changes**: Access level changes require sudo and reason
4. **Safe Defaults**: New users start with limited access
5. **Self-Service First**: Common operations available without admin intervention

---

## Endpoint Specifications

## Self-Service Endpoints

Users can manage their own profiles without requiring sudo access.

### GET /api/user/profile

Get the authenticated user's profile.

**Authentication**: JWT required
**Authorization**: Any authenticated user
**Sudo**: Not required

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "auth": "john@example.com",
    "access": "full",
    "access_read": ["uuid1", "uuid2"],
    "access_edit": ["uuid3"],
    "access_full": ["uuid4"],
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z"
  }
}
```

---

### PUT /api/user/profile

Update the authenticated user's profile (name and auth identifier only).

**Authentication**: JWT required
**Authorization**: Any authenticated user
**Sudo**: Not required

**Request Body**:
```json
{
  "name": "Jane Doe",           // Optional: Update display name
  "auth": "jane@example.com"    // Optional: Update auth identifier (username/email)
}
```

**Validation**:
- `name`: 2-100 characters
- `auth`: 2-255 characters, must be unique across tenant
- Cannot update: `access`, `access_read`, `access_edit`, `access_full` (admin only)

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Jane Doe",
    "auth": "jane@example.com",
    "access": "full",
    "updated_at": "2025-01-15T11:00:00Z"
  }
}
```

**Errors**:
- `400 VALIDATION_ERROR`: Invalid name or auth format
- `409 AUTH_CONFLICT`: Auth identifier already exists

---

### POST /api/user/deactivate

Deactivate your own account (soft delete). Requires confirmation.

**Authentication**: JWT required
**Authorization**: Any authenticated user
**Sudo**: Not required

**Request Body**:
```json
{
  "confirm": true,           // Required: Must be true
  "reason": "Leaving team"   // Optional: Reason for audit log
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "message": "Account deactivated successfully",
    "deactivated_at": "2025-01-15T11:30:00Z"
  }
}
```

**Notes**:
- Sets `trashed_at` to current timestamp
- User can no longer authenticate
- Admin can reactivate using admin endpoints

---

## Admin Endpoints

Administrative user management operations requiring sudo access.

### GET /api/user

List all users in the tenant.

**Authentication**: JWT required with `is_sudo=true`
**Authorization**: root or full (with sudo)
**Sudo**: Required

**Query Parameters**:
- `limit` (number, default: 50, max: 100): Number of results per page
- `offset` (number, default: 0): Pagination offset
- `access` (string): Filter by access level (root, full, edit, read, deny)
- `active` (boolean): Filter active users (trashed_at IS NULL)

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "John Doe",
        "auth": "john@example.com",
        "access": "full",
        "created_at": "2025-01-15T10:30:00Z",
        "updated_at": "2025-01-15T10:30:00Z",
        "trashed_at": null
      }
    ],
    "pagination": {
      "total": 42,
      "limit": 50,
      "offset": 0,
      "has_more": false
    }
  }
}
```

---

### GET /api/user/:id

Get detailed information about a specific user.

**Authentication**: JWT required with `is_sudo=true`
**Authorization**: root or full (with sudo)
**Sudo**: Required

**Path Parameters**:
- `id` (uuid): User ID

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "auth": "john@example.com",
    "access": "full",
    "access_read": ["uuid1", "uuid2"],
    "access_edit": ["uuid3"],
    "access_full": ["uuid4"],
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z",
    "trashed_at": null
  }
}
```

**Errors**:
- `404 USER_NOT_FOUND`: User doesn't exist

---

### POST /api/user

Create a new user (invitation flow).

**Authentication**: JWT required with `is_sudo=true`
**Authorization**: root or full (with sudo)
**Sudo**: Required

**Request Body**:
```json
{
  "name": "Jane Smith",             // Required: Display name
  "auth": "jane@example.com",       // Required: Auth identifier (username/email)
  "access": "edit",                 // Required: Access level (deny/read/edit/full/root)
  "reason": "New team member"       // Optional: Reason for audit log
}
```

**Validation**:
- `name`: 2-100 characters
- `auth`: 2-255 characters, must be unique
- `access`: One of: deny, read, edit, full, root

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "id": "new-user-uuid",
    "name": "Jane Smith",
    "auth": "jane@example.com",
    "access": "edit",
    "created_at": "2025-01-15T12:00:00Z",
    "created_by": {
      "id": "admin-user-id",
      "name": "Admin User"
    }
  }
}
```

**Errors**:
- `400 VALIDATION_ERROR`: Invalid input
- `409 AUTH_CONFLICT`: Auth identifier already exists

**Notes**:
- Future enhancement: Send invitation email with temporary password

---

### PUT /api/user/:id

Update user profile (admin operation).

**Authentication**: JWT required with `is_sudo=true`
**Authorization**: root or full (with sudo)
**Sudo**: Required

**Path Parameters**:
- `id` (uuid): User ID

**Request Body**:
```json
{
  "name": "Jane Smith Updated",     // Optional: Update name
  "auth": "jane.new@example.com",   // Optional: Update auth identifier
  "reason": "Name change request"   // Optional: Reason for audit log
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "name": "Jane Smith Updated",
    "auth": "jane.new@example.com",
    "access": "edit",
    "updated_at": "2025-01-15T12:30:00Z",
    "updated_by": {
      "id": "admin-user-id",
      "name": "Admin User"
    }
  }
}
```

**Notes**:
- Cannot update `access` level via this endpoint (use PUT /api/user/:id/access)
- Prevents accidental privilege escalation

---

### PUT /api/user/:id/access

Change user's access level (privileged operation).

**Authentication**: JWT required with `is_sudo=true`
**Authorization**: root or full (with sudo)
**Sudo**: Required

**Path Parameters**:
- `id` (uuid): User ID

**Request Body**:
```json
{
  "access": "full",                     // Required: New access level
  "reason": "Promoted to team lead"     // Required: Reason for audit trail
}
```

**Validation**:
- `access`: One of: deny, read, edit, full, root
- `reason`: Required, 1-500 characters

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "name": "Jane Smith",
    "access": "full",
    "previous_access": "edit",
    "updated_at": "2025-01-15T13:00:00Z",
    "updated_by": {
      "id": "admin-user-id",
      "name": "Admin User"
    },
    "reason": "Promoted to team lead"
  }
}
```

**Audit Log**:
```json
{
  "action": "access_level_change",
  "user_id": "user-uuid",
  "previous_access": "edit",
  "new_access": "full",
  "changed_by": "admin-user-id",
  "reason": "Promoted to team lead",
  "timestamp": "2025-01-15T13:00:00Z"
}
```

**Errors**:
- `400 MISSING_REASON`: Reason is required for access level changes
- `400 INVALID_ACCESS_LEVEL`: Invalid access level
- `403 CANNOT_CHANGE_SELF`: Cannot change your own access level

**Security**:
- Cannot change your own access level (prevents privilege escalation)
- Requires explicit reason for audit trail
- Logged with timestamp, actor, and reason

---

### DELETE /api/user/:id

Soft delete a user (deactivate account).

**Authentication**: JWT required with `is_sudo=true`
**Authorization**: root or full (with sudo)
**Sudo**: Required

**Path Parameters**:
- `id` (uuid): User ID

**Request Body**:
```json
{
  "reason": "User left company"     // Optional: Reason for audit log
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "name": "Jane Smith",
    "trashed_at": "2025-01-15T13:30:00Z",
    "deleted_by": {
      "id": "admin-user-id",
      "name": "Admin User"
    }
  }
}
```

**Notes**:
- Soft delete only (sets `trashed_at`)
- User can no longer authenticate
- Can be reactivated using POST /api/user/:id/activate

---

### POST /api/user/:id/activate

Reactivate a deactivated user account.

**Authentication**: JWT required with `is_sudo=true`
**Authorization**: root or full (with sudo)
**Sudo**: Required

**Path Parameters**:
- `id` (uuid): User ID

**Request Body**:
```json
{
  "reason": "User rejoined company"     // Optional: Reason for audit log
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "name": "Jane Smith",
    "trashed_at": null,
    "activated_by": {
      "id": "admin-user-id",
      "name": "Admin User"
    }
  }
}
```

**Notes**:
- Clears `trashed_at` timestamp
- User can authenticate again

---

## Error Handling

All endpoints follow the standard Monk API error format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "error_code": "MACHINE_READABLE_CODE",
  "details": {
    "field": "Additional context"
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `USER_NOT_FOUND` | 404 | User ID doesn't exist |
| `AUTH_CONFLICT` | 409 | Auth identifier already exists |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `MISSING_REASON` | 400 | Reason required for audit trail |
| `CANNOT_CHANGE_SELF` | 403 | Cannot modify your own access level |
| `SUDO_REQUIRED` | 403 | Operation requires sudo access |
| `INVALID_ACCESS_LEVEL` | 400 | Invalid access level value |

---

## Security Model

### Self-Service Operations

- **No Sudo Required**: Users can manage their own profiles
- **Limited Scope**: Can only update `name` and `auth` fields
- **Cannot Escalate**: Cannot modify own `access` level
- **Safe Operations**: Profile updates, account deactivation

### Admin Operations

- **Sudo Required**: All admin operations require `is_sudo=true` in JWT
- **Audit Logged**: All operations logged with actor, timestamp, reason
- **Reason Required**: Access level changes must include reason
- **Self-Protection**: Cannot change your own access level
- **Tenant Scoped**: Operations limited to current tenant

### Access Level Changes

Access level changes are privileged operations with special handling:

1. **Explicit Endpoint**: Separate endpoint (`PUT /api/user/:id/access`) for clarity
2. **Mandatory Reason**: Must provide reason for audit trail
3. **No Self-Change**: Cannot change your own access level
4. **Full Audit**: Logged with previous/new values, actor, reason, timestamp
5. **Sudo Required**: Requires elevated privileges

---

## Implementation Plan

### Phase 1: Core Self-Service (Priority: High)
- [ ] `GET /api/user/profile` - View own profile
- [ ] `PUT /api/user/profile` - Update own profile
- [ ] `POST /api/user/deactivate` - Deactivate own account

### Phase 2: Admin Read Operations (Priority: High)
- [ ] `GET /api/user` - List users
- [ ] `GET /api/user/:id` - Get user details

### Phase 3: Admin Write Operations (Priority: High)
- [ ] `POST /api/user` - Create user
- [ ] `PUT /api/user/:id` - Update user
- [ ] `PUT /api/user/:id/access` - Change access level
- [ ] `DELETE /api/user/:id` - Deactivate user
- [ ] `POST /api/user/:id/activate` - Reactivate user

### Phase 4: Enhanced Features (Priority: Medium)
- [ ] Password management endpoints
- [ ] Email verification flow
- [ ] Invitation email system
- [ ] Password reset tokens
- [ ] Session management
- [ ] Multi-factor authentication

---

## Database Schema

The User API operates on the existing `users` table:

```sql
CREATE TABLE "users" (
  -- System fields
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "access_read" uuid[] DEFAULT '{}'::uuid[],
  "access_edit" uuid[] DEFAULT '{}'::uuid[],
  "access_full" uuid[] DEFAULT '{}'::uuid[],
  "access_deny" uuid[] DEFAULT '{}'::uuid[],
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "trashed_at" timestamp,
  "deleted_at" timestamp,

  -- User fields
  "name" text NOT NULL,
  "auth" text NOT NULL,  -- Username/email identifier
  "access" text CHECK ("access" IN ('root', 'full', 'edit', 'read', 'deny')) NOT NULL,

  CONSTRAINT "users_auth_unique" UNIQUE("auth")
);
```

**Notes**:
- `auth` is the authentication identifier (username/email)
- Password storage is not currently implemented (future enhancement)
- `trashed_at` IS NOT NULL indicates deactivated account
- Access levels: deny < read < edit < full < root

---

## Future Enhancements

### Password Management
- Password hashing (bcrypt/argon2)
- Password strength validation
- Password change endpoint
- Password reset flow with tokens

### Invitation System
- Email invitation templates
- Temporary passwords
- First-time login flow
- Email verification

### Advanced Features
- Session management (list active sessions, revoke)
- Multi-factor authentication (TOTP, SMS)
- Account lockout after failed attempts
- IP-based access controls
- User groups/teams
- Role-based permissions beyond access levels

### Audit Enhancements
- Detailed audit log table
- Access history tracking
- Login history
- Failed login attempts
- Export audit logs

---

## Open Questions

1. **Password Storage**: Should we add password fields to users table, or use external auth provider?
2. **Email System**: Do we need email sending capabilities for invitations/resets?
3. **Access Control**: Should full users be able to manage edit/read users, or only root?
4. **Bulk Operations**: Do we need endpoints like `POST /api/user/bulk` for bulk user creation?
5. **User Search**: Should `GET /api/user` support full-text search on name/auth?
6. **Profile Fields**: Should we support custom profile fields (phone, avatar, bio, etc.)?
7. **Deactivation**: Should deactivated users be completely hidden, or visible to admins?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-11-15 | Self-service operations don't require sudo | Users should manage own profiles without admin intervention |
| 2025-11-15 | Separate endpoint for access level changes | Prevents accidental privilege escalation, enforces audit trail |
| 2025-11-15 | Cannot change own access level | Prevents privilege escalation attack vector |
| 2025-11-15 | Soft delete only (trashed_at) | Allows account recovery and maintains audit history |
| 2025-11-15 | Require reason for access changes | Mandatory audit trail for privileged operations |

---

## Compatibility

### Backwards Compatibility

- **Data API** (`/api/data/users`) continues to work
- User API provides higher-level abstractions, doesn't replace Data API
- Existing sudo protection on users table remains
- No breaking changes to authentication or authorization

### Migration Path

1. Implement User API alongside existing Data API
2. Update clients to use User API for user management
3. Keep Data API for direct database operations when needed
4. No forced migration - both APIs coexist

---

## Summary

The User API provides a secure, convenient, and auditable interface for user management:

✅ **Self-Service**: Users manage own profiles without sudo
✅ **Secure**: Prevents privilege escalation, enforces access controls
✅ **Auditable**: All admin operations logged with reason
✅ **Convenient**: Simplified operations for common tasks
✅ **Extensible**: Foundation for password management, invitations, MFA

**Next Steps**: Review this design, provide feedback, approve implementation phases.
