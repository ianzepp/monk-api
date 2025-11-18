import type { Context } from 'hono';
import { InfrastructureService } from '@src/lib/services/infrastructure-service.js';

/**
 * POST /api/sudo/sandboxes - Create sandbox from current tenant or template
 *
 * Creates a new sandbox database for testing. The sandbox is tenant-scoped,
 * so all admins in the tenant can access and manage it.
 *
 * By default, clones the current tenant's database. Optionally, can clone
 * from a template instead by specifying template_name.
 *
 * Request body:
 * - template_name (optional): Template to clone from (if not provided, clones current tenant)
 * - sandbox_name (optional): Custom sandbox name
 * - description (optional): Sandbox description
 * - purpose (optional): Why this sandbox exists
 * - expires_at (optional): Auto-expiration date
 *
 * Requires sudo access.
 */
export default async function (context: Context) {
    const userId = context.get('userId');
    const tenantName = context.get('tenant');
    const body = await context.req.json();

    const sandbox = await InfrastructureService.createSandbox({
        tenant_name: tenantName,
        template_name: body.template_name, // Optional - defaults to cloning current tenant
        sandbox_name: body.sandbox_name,
        description: body.description,
        purpose: body.purpose,
        created_by: userId,
        expires_at: body.expires_at ? new Date(body.expires_at) : undefined,
    });

    return context.json({
        success: true,
        data: sandbox,
    });
}
