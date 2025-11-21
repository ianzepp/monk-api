# GET /auth/templates

List all available tenant templates (personal mode only). Templates are pre-configured database schemas that can be cloned when creating new tenants via the register endpoint.

**Security Note**: This endpoint is only available when the server is running in `TENANT_NAMING_MODE=personal`. In enterprise mode, it returns a 403 error.

## Request Body

None - GET request with no body.

## Success Response (200)

```json
{
  "success": true,
  "data": [
    {
      "name": "system",
      "description": "Default empty template with base schemas",
      "is_default": true
    },
    {
      "name": "saas-starter",
      "description": "SaaS application with user management and billing schemas",
      "is_default": false
    },
    {
      "name": "e-commerce",
      "description": "E-commerce platform with products, orders, and inventory",
      "is_default": false
    }
  ]
}
```

## Response Fields

- **name** (string): Template identifier used in register requests
- **description** (string|null): Human-readable description of the template
- **is_default** (boolean): Whether this is the default template used when no template specified

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 403 | `AUTH_TEMPLATE_LIST_NOT_AVAILABLE` | "Template listing is only available in personal mode" | Server is in enterprise mode |

## Template System

Templates allow administrators to provision new tenants with pre-configured:
- Database schemas (users, products, orders, etc.)
- Initial configuration data
- Sample records for testing
- Custom relationships and constraints

When a tenant is registered with a specific template, the entire template database is cloned, giving the new tenant an immediate working environment.

## Example Usage

### List Available Templates

```bash
curl -X GET http://localhost:9001/auth/templates
```

### Register with Specific Template

```bash
# First, list templates to see what's available
curl -X GET http://localhost:9001/auth/templates

# Then register with chosen template
curl -X POST http://localhost:9001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "my-saas-app",
    "template": "saas-starter",
    "username": "admin"
  }'
```

## Integration Examples

### JavaScript Template Selector

```javascript
async function loadTemplates() {
  try {
    const response = await fetch('/auth/templates');

    if (!response.ok) {
      if (response.status === 403) {
        console.log('Template listing not available in enterprise mode');
        return null;
      }
      throw new Error('Failed to load templates');
    }

    const { data } = await response.json();

    return data.map(template => ({
      value: template.name,
      label: template.description || template.name,
      isDefault: template.is_default
    }));
  } catch (error) {
    console.error('Error loading templates:', error);
    return null;
  }
}

// Use in registration form
const templates = await loadTemplates();
if (templates) {
  renderTemplateSelector(templates);
}
```

### CLI Template Info

```bash
#!/bin/bash
# Show detailed template information

echo "Available Templates:"
echo "==================="

curl -s http://localhost:9001/auth/templates | jq -r '.data[] |
  "\nName: \(.name)" +
  "\nDescription: \(.description // "No description")" +
  "\nDefault: \(.is_default)" +
  "\n---"
'
```

## Default Template

If no template is specified during registration, the default template (usually "system") is used:

```bash
# Uses default template (system)
curl -X POST http://localhost:9001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "my-tenant",
    "username": "admin"
  }'

# Explicitly specify template
curl -X POST http://localhost:9001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "my-tenant",
    "template": "saas-starter",
    "username": "admin"
  }'
```

## Personal vs Enterprise Mode

### Personal Mode (TENANT_NAMING_MODE=personal)
- ✅ Endpoint available
- Shows all available templates
- Useful for personal PaaS with multiple use cases
- Admin can create custom templates

### Enterprise Mode (TENANT_NAMING_MODE=enterprise)
- ❌ Endpoint blocked (403 error)
- Templates are server-managed
- Default template used for all registrations
- Simplifies multi-tenant SaaS operations

## Related Endpoints

- [`POST /auth/register`](../register/POST.md) - Create tenant from template
- [`GET /auth/tenants`](../tenants/GET.md) - List existing tenants (personal mode)
