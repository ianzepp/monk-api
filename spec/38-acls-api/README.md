# 38-acls-api: Access Control Lists API Tests

Tests for ACL management operations allowing administrators to control record-level permissions.

**Scope:**
- ACL management via /api/acls/:schema[/:record] (future implementation)
- Record-level permission administration
- Bulk ACL updates with filtering
- Administrative access control validation

**Test Focus:**
- Individual record ACL updates (/api/acls/:schema/:record)
- Bulk ACL operations with filters (/api/acls/:schema)
- Access list management (access_read, access_edit, access_full, access_deny)
- Admin and root privilege validation for ACL operations
- ACL inheritance and permission cascading
- Batch permission updates and rollback scenarios
- Cross-record ACL consistency validation