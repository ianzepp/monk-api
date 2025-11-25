# 38-acls-api: Access Control Lists

**Priority**: MODERATE
**Coverage**: 60% (Create/update tested, retrieval missing)
**Status**: Write operations covered, read operations untested

## Critical / Smoke Tests

### Existing Tests (3)
- POST /api/acls/:model/:record - Create ACL for individual record (create-acl.test.sh)
- POST /api/acls/:model/:record - Append ACL entries to existing list (append-acls.test.sh)
- PUT /api/acls/:model/:record - Update ACL entries (update-acls.test.sh)

## Additional Tests

### Existing Coverage
- Individual record ACL creation
- ACL list management (access_read, access_edit, access_full, access_deny)
- Appending ACL entries
- ACL entry updates
- Full and root privilege validation for ACL operations

### Missing Tests (2)
- GET /api/acls/:model/:record - Retrieve ACLs for record (no read operation tests)
- DELETE /api/acls/:model/:record - Remove ACLs from record (no delete operation tests)

### Missing Coverage
- Bulk ACL operations with filters (/api/acls/:model)
- ACL inheritance and permission cascading
- Cross-record ACL consistency validation
- Permission enforcement validation (do ACLs actually restrict access?)

## Notes

- Write operations (create, update, append) well-tested
- Missing read/delete operations makes testing incomplete
- Should validate that ACLs actually enforce permissions
- Bulk ACL operations would be valuable for administration
