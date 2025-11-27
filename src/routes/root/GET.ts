import type { Context } from 'hono';
import packageJson from '@pkg';

/**
 * GET / - API root endpoint
 *
 * Returns API information and available endpoints.
 * Public endpoint, no authentication required.
 */
export default function (context: Context) {
    return context.json({
        success: true,
        data: {
            name: 'Monk API',
            version: packageJson.version,
            description: 'Lightweight PaaS backend API',
            endpoints: {
                health: ['/health'],
                docs: [
                    '/docs',
                    '/docs/auth',
                    '/docs/describe',
                    '/docs/data',
                    '/docs/find',
                    '/docs/aggregate',
                    '/docs/bulk',
                    '/docs/user',
                    '/docs/acls',
                    '/docs/stat',
                    '/docs/history',
                    '/docs/sudo',
                ],
                auth: [
                    '/auth/login',
                    '/auth/register',
                    '/auth/refresh',
                    '/auth/tenants'
                ],
                describe: [
                    '/api/describe',
                    '/api/describe/:model',
                    '/api/describe/:model/fields',
                    '/api/describe/:model/fields/:field'
                ],
                data: [
                    '/api/data/:model',
                    '/api/data/:model/:record',
                    '/api/data/:model/:record/:relationship',
                    '/api/data/:model/:record/:relationship/:child'
                ],
                find: [
                    '/api/find/:model'
                ],
                aggregate: [
                    '/api/aggregate/:model'
                ],
                bulk: [
                    '/api/bulk'
                ],
                user: [
                    '/api/user/whoami',
                    '/api/user/sudo',
                    '/api/user/fake',
                    '/api/user/profile',
                    '/api/user/deactivate'
                ],
                acls: [
                    '/api/acls/:model/:record'
                ],
                stat: [
                    '/api/stat/:model/:record'
                ],
                history: [
                    '/api/history/:model/:record',
                    '/api/history/:model/:record/:change'
                ],
                sudo: [
                    '/api/sudo/sandboxes/',
                    '/api/sudo/sandboxes/:name',
                    '/api/sudo/sandboxes/:name/extend',
                    '/api/sudo/snapshots/',
                    '/api/sudo/snapshots/:name',
                    '/api/sudo/templates/',
                    '/api/sudo/templates/:name',
                    '/api/sudo/users/',
                    '/api/sudo/users/:id',
                ],
                grids: [
                    '/api/grids/:id/:range',
                    '/api/grids/:id/cells'
                ]
            }
        }
    });
}
