# 39-root-api: Root API Administrative Tests

Tests for root-level sudo operations requiring elevated privileges.

**Scope:**
- Tenant management and administration via /api/root/*
- Root-level system operations (localhost development only)
- Administrative privilege validation
- System-wide tenant lifecycle management

**Test Focus:**
- Tenant CRUD operations (/api/root/tenant)
- Tenant health monitoring (/api/root/tenant/:name/health)
- Root token validation and authorization
- Tenant provisioning and cleanup workflows
- Administrative error handling and security
- Development-only endpoint restrictions
- Cross-tenant sudo operations
