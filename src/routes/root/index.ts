import { Hono } from 'hono';

// Root API Routes - Localhost Development Only
// 
// These routes provide tenant management capabilities without authentication
// for UIX development convenience. Access is strictly restricted to:
// - NODE_ENV=development 
// - hostname=localhost or 127.0.0.1
//
// Routes are automatically discovered by file structure:
// - POST /api/root/tenant → tenant/POST.ts
// - GET /api/root/tenant → tenant/GET.ts  
// - DELETE /api/root/tenant/:name → tenant/[name]/DELETE.ts (soft delete)
// - PUT /api/root/tenant/:name → tenant/[name]/PUT.ts (restore)

const rootRouter = new Hono();

// Tenant Management Routes
import tenantPOST from './tenant/POST.js';
import tenantGET from './tenant/GET.js';
import tenantDELETE from './tenant/[name]/DELETE.js';
import tenantPUT from './tenant/[name]/PUT.js';

rootRouter.post('/tenant', tenantPOST);
rootRouter.get('/tenant', tenantGET);
rootRouter.delete('/tenant/:name', tenantDELETE);
rootRouter.put('/tenant/:name', tenantPUT);

export { rootRouter };