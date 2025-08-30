# Root API Changelog

## Phase 1 Implementation - Tenant Management (2025-08-28)

### ✅ **New Endpoints Added**

| **Endpoint** | **Method** | **Description** | **Status** |
|--------------|------------|-----------------|------------|
| `GET /api/root/tenant/:name` | GET | Get individual tenant details | ✅ Implemented & Tested |
| `PATCH /api/root/tenant/:name` | PATCH | Update tenant properties | ⚠️ Endpoint exists, returns 501 |
| `DELETE /api/root/tenant/:name?force=true` | DELETE | Hard delete tenant with force parameter | ✅ Implemented & Tested |
| `GET /api/root/tenant/:name/health` | GET | Comprehensive tenant health check | ✅ Implemented & Tested |

### 🔧 **Enhanced Existing Endpoints**

| **Endpoint** | **Enhancement** | **Description** |
|--------------|-----------------|-----------------|
| `DELETE /api/root/tenant/:name` | Added force parameter | Now supports both soft delete (default) and hard delete (`?force=true`) |
| `DELETE /api/root/tenant/:name` | Updated validation | Fixed regex pattern to support underscores: `^[a-z0-9_-]+$` |
| `PUT /api/root/tenant/:name` | Updated validation | Fixed regex pattern to support underscores: `^[a-z0-9_-]+$` |

### 🐛 **Bug Fixes**

- **Fixed table name references**: Updated remaining `tenants` → `tenant` in `TenantService.trashTenant()` and `TenantService.restoreTenant()`
- **Fixed validation regex**: All endpoints now consistently use `^[a-z0-9_-]+$` pattern to support new underscore naming convention

### 🧪 **Comprehensive Testing**

All new and updated endpoints have been tested with:

- ✅ **Compilation**: TypeScript compiles without errors
- ✅ **Endpoint availability**: All routes accessible via HTTP
- ✅ **Functionality**: CRUD operations work as expected
- ✅ **Error handling**: Proper HTTP status codes and error messages
- ✅ **Validation**: Input validation works correctly
- ✅ **Database operations**: Soft delete, hard delete, and restore tested

### 📋 **Health Check Details**

The new health endpoint performs comprehensive checks:

1. **Tenant Registry**: Verifies tenant exists in `monk.tenant` table
2. **Database Existence**: Confirms tenant database exists in PostgreSQL
3. **Connectivity**: Tests database connection
4. **Schema Validation**: Verifies `schema` table exists
5. **User Management**: Confirms `users` table exists with root user
6. **Status Classification**: Returns `healthy` | `warning` | `error` status

### 🔀 **Database Architecture Updates**

These endpoints work with the new database architecture:

- **Auth Database**: `monk` → `monk`
- **Auth Table**: `tenants` → `tenant` (singular, with UUID and ACL structure)
- **Tenant Databases**: `tenant_<hashed-name>` → direct tenant names (e.g., `my_app`)
- **Reserved Patterns**: Blocks `test_*` and `monk_*` prefixes

### 📖 **CLI Support**

These endpoints fully support the documented CLI commands in `monk-cli/docs/ROOT.md`:

- `monk root tenant list` → `GET /api/root/tenant`
- `monk root tenant create <name>` → `POST /api/root/tenant`
- `monk root tenant show <name>` → `GET /api/root/tenant/:name`
- `monk root tenant update <name>` → `PATCH /api/root/tenant/:name` ⚠️
- `monk root tenant trash <name>` → `DELETE /api/root/tenant/:name`
- `monk root tenant restore <name>` → `PUT /api/root/tenant/:name`
- `monk root tenant delete <name>` → `DELETE /api/root/tenant/:name?force=true`
- `monk root tenant health <name>` → `GET /api/root/tenant/:name/health`

### ⚠️ **Known Limitations**

- **PATCH endpoint**: Returns 501 (Not Implemented) - requires `TenantService.updateTenant()` method implementation
- **User operations**: Not implemented (user infrastructure not designed)
- **System operations**: Not approved (existing `/ping` & `/health` sufficient)

### 🎯 **Next Steps**

Phase 1 tenant operations are complete and ready for CLI implementation. Future phases not currently approved.