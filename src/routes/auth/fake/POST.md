# POST /api/auth/fake

Impersonate another user by generating a JWT with their identity and permissions. This is useful for debugging user-specific issues, customer support troubleshooting, and testing user permissions without knowing their credentials.

**Note:** This endpoint is mounted at `/api/auth/fake` (protected route), not `/auth/fake` (public route).

## Security

- **Root access only**: Only users with `access='root'` can use this endpoint
- **Shorter-lived token**: 1 hour expiration (vs 24 hours for normal login)
- **Full audit logging**: JWT includes `is_fake` metadata and originating user info
- **Self-fake prevention**: Cannot fake yourself (use your regular token instead)

## Use Cases

- Debugging user-specific permission issues
- Customer support troubleshooting
- Testing features as different user roles
- Reproducing user-reported bugs
- Verifying ACL configurations

## Request Body

```json
{
  "user_id": "uuid",      // Optional: Target user's ID
  "username": "string"    // Optional: Target user's auth identifier
}
```

**Note**: Either `user_id` or `username` must be provided.

## Success Response (200)

```json
{
  "success": true,
  "data": {
    "fake_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 3600,
    "token_type": "Bearer",
    "target_user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "auth": "john@example.com",
      "access": "full"
    },
    "warning": "Fake token expires in 1 hour",
    "faked_by": {
      "id": "root-user-id",
      "name": "Root Admin"
    }
  }
}
```

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `AUTH_TARGET_USER_MISSING` | "Either user_id or username is required to identify target user" | Neither user_id nor username provided |
| 400 | `AUTH_CANNOT_FAKE_SELF` | "Cannot fake your own user - you are already authenticated as this user" | Trying to fake yourself |
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No valid user JWT |
| 403 | `AUTH_FAKE_ACCESS_DENIED` | "User impersonation requires root access" | User lacks root access |
| 404 | `AUTH_TARGET_USER_NOT_FOUND` | "Target user not found: {identifier}" | User doesn't exist or is deleted |

## JWT Payload for Fake Tokens

The fake token includes special metadata for audit tracking:

```json
{
  "sub": "target-user-id",
  "user_id": "target-user-id",
  "tenant": "my-company",
  "database": "tenant_a1b2c3d4",
  "access": "full",
  "access_read": ["uuid1", "uuid2"],
  "access_edit": ["uuid3"],
  "access_full": ["uuid4"],
  "is_sudo": false,
  "is_fake": true,
  "faked_by_user_id": "root-user-id",
  "faked_by_username": "Root Admin",
  "faked_at": "2025-11-15T10:30:00Z",
  "iat": 1700050200,
  "exp": 1700053800
}
```

## Example Usage

### Fake by User ID

```bash
curl -X POST http://localhost:9001/api/auth/fake \
  -H "Authorization: Bearer ROOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

### Fake by Username

```bash
curl -X POST http://localhost:9001/api/auth/fake \
  -H "Authorization: Bearer ROOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john@example.com"
  }'
```

### Use Fake Token

```bash
# The fake token works like any other JWT
curl -X GET http://localhost:9001/api/data/accounts \
  -H "Authorization: Bearer FAKE_TOKEN"

# Whoami will show the faked user's identity
curl -X GET http://localhost:9001/api/user/whoami \
  -H "Authorization: Bearer FAKE_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john@example.com",
    "tenant": "my-company",
    "access": "full",
    "is_fake": true,
    "faked_by": "Root Admin"
  }
}
```

## Integration Examples

### Support Tool

```javascript
async function impersonateUser(rootToken, targetUsername) {
  try {
    const response = await fetch('/api/auth/fake', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${rootToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username: targetUsername })
    });

    if (!response.ok) {
      throw new Error(`Failed to impersonate: ${response.statusText}`);
    }

    const { data } = await response.json();

    console.log(`Now impersonating: ${data.target_user.name}`);
    console.log(`Token expires in: ${data.expires_in}s`);

    // Store fake token separately from regular token
    sessionStorage.setItem('fake_token', data.fake_token);
    sessionStorage.setItem('fake_user', JSON.stringify(data.target_user));

    return data.fake_token;
  } catch (error) {
    console.error('Impersonation failed:', error);
    throw error;
  }
}

// Use fake token for debugging
const fakeToken = await impersonateUser(rootToken, 'john@example.com');

// Make API calls as the target user
const userDataResponse = await fetch('/api/data/accounts', {
  headers: { 'Authorization': `Bearer ${fakeToken}` }
});
```

### CLI Debug Tool

```bash
#!/bin/bash
# Debug user permissions

ROOT_TOKEN="your-root-token"
TARGET_USER="john@example.com"

# Get fake token
FAKE_TOKEN=$(curl -s -X POST http://localhost:9001/api/auth/fake \
  -H "Authorization: Bearer $ROOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$TARGET_USER\"}" \
  | jq -r '.data.fake_token')

echo "Impersonating: $TARGET_USER"

# Test as user
curl -X GET http://localhost:9001/api/data/accounts \
  -H "Authorization: Bearer $FAKE_TOKEN"
```

## Security Considerations

1. **Audit Trail**: All fake operations are logged with the root user's identity
2. **Time-Limited**: Fake tokens expire after 1 hour to limit exposure window
3. **Metadata Tracking**: JWT includes `is_fake`, `faked_by_user_id`, and `faked_at` fields
4. **Root Only**: Only root users can impersonate - full users cannot
5. **Self-Protection**: Cannot fake your own account (prevents confusion)
6. **Tenant-Scoped**: Can only fake users within the same tenant

## Best Practices

### DO
- ✅ Use for debugging and support purposes only
- ✅ Document the reason for impersonation in support tickets
- ✅ Log out of fake session when finished
- ✅ Store fake tokens separately from regular tokens
- ✅ Notify users of impersonation (if required by policy)

### DON'T
- ❌ Use fake tokens for regular operations
- ❌ Share fake tokens with non-root users
- ❌ Keep fake tokens active longer than necessary
- ❌ Use for unauthorized access or surveillance
- ❌ Fake users for testing in production (use test environments)

## Related Endpoints

- [`GET /api/user/whoami`](../../api/user/whoami/GET.md) - Verify current user identity (shows fake metadata)
- [`POST /api/user/sudo`](../../api/user/sudo/POST.md) - Elevate to sudo access
- [`POST /auth/login`](../login/POST.md) - Normal authentication
