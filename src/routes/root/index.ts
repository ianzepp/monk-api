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
// - GET /api/root/tenant/:name → tenant/:name/GET.ts (show details)
// - PATCH /api/root/tenant/:name → tenant/:name/PATCH.ts (update properties)
// - DELETE /api/root/tenant/:name → tenant/:name/DELETE.ts (soft/hard delete)
// - PUT /api/root/tenant/:name → tenant/:name/PUT.ts (restore)
// - GET /api/root/tenant/:name/health → tenant/:name/health/GET.ts (health check)

const rootRouter = new Hono();

// Tenant Management Routes
import tenantPOST from '@src/routes/root/tenant/POST.js';
import tenantGET from '@src/routes/root/tenant/GET.js';
import tenantShowGET from '@src/routes/root/tenant/:name/GET.js';
import tenantPATCH from '@src/routes/root/tenant/:name/PATCH.js';
import tenantDELETE from '@src/routes/root/tenant/:name/DELETE.js';
import tenantPUT from '@src/routes/root/tenant/:name/PUT.js';
import tenantHealthGET from '@src/routes/root/tenant/:name/health/GET.js';

rootRouter.post('/tenant', tenantPOST);
rootRouter.get('/tenant', tenantGET);
rootRouter.get('/tenant/:name', tenantShowGET);
rootRouter.patch('/tenant/:name', tenantPATCH);
rootRouter.delete('/tenant/:name', tenantDELETE);
rootRouter.put('/tenant/:name', tenantPUT);
rootRouter.get('/tenant/:name/health', tenantHealthGET);

export { rootRouter };