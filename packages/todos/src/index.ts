/**
 * @monk-app/todos - Todo List Application
 *
 * A tenant-scoped app: models are installed in the user's tenant,
 * and data belongs to the user. Requires JWT authentication.
 *
 * Models are defined in models/todos.yaml and loaded automatically.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';

/**
 * App context provided by the loader
 */
export interface AppContext {
    client: any; // Not used for tenant-scoped apps
    token: string;
    appName: string;
    tenantName: string;
    honoApp: any; // Main Hono app for in-process routing
}

/**
 * Simple in-process client that forwards requests to the main app.
 * Uses the Authorization header from the current request context.
 */
function createClient(c: Context, honoApp: any) {
    const authHeader = c.req.header('Authorization');

    async function request<T>(method: string, path: string, options: { query?: Record<string, string>; body?: any } = {}): Promise<{ success: boolean; data?: T; error?: string }> {
        let url = `http://internal${path}`;
        if (options.query && Object.keys(options.query).length > 0) {
            const params = new URLSearchParams(options.query);
            url += `?${params.toString()}`;
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (authHeader) {
            headers['Authorization'] = authHeader;
        }

        const init: RequestInit = { method, headers };
        if (options.body !== undefined && !['GET', 'HEAD'].includes(method)) {
            init.body = JSON.stringify(options.body);
        }

        const req = new Request(url, init);
        const res = await honoApp.fetch(req);
        return res.json();
    }

    return {
        get: <T>(path: string, query?: Record<string, string>) => request<T>('GET', path, { query }),
        post: <T>(path: string, body?: any) => request<T>('POST', path, { body }),
        put: <T>(path: string, body?: any) => request<T>('PUT', path, { body }),
        delete: <T>(path: string) => request<T>('DELETE', path),
    };
}

/**
 * Create the Todos Hono app.
 *
 * This is a tenant-scoped app - the client is created per-request
 * using the user's Authorization header, not a pre-bound app token.
 */
export function createApp(context: AppContext): Hono {
    const app = new Hono();
    const { honoApp } = context;

    // GET / - List all todos
    app.get('/', async (c) => {
        const client = createClient(c, honoApp);
        const status = c.req.query('status');
        const query: Record<string, string> = {};
        if (status) {
            query['where[status]'] = status;
        }
        const result = await client.get('/api/data/todos', query);
        return c.json(result);
    });

    // POST / - Create a new todo
    app.post('/', async (c) => {
        const client = createClient(c, honoApp);
        const body = await c.req.json();
        const result = await client.post('/api/data/todos', body);
        return c.json(result, result.success ? 201 : 400);
    });

    // GET /:id - Get a single todo
    app.get('/:id', async (c) => {
        const client = createClient(c, honoApp);
        const id = c.req.param('id');
        const result = await client.get(`/api/data/todos/${id}`);
        return c.json(result, result.success ? 200 : 404);
    });

    // PUT /:id - Update a todo
    app.put('/:id', async (c) => {
        const client = createClient(c, honoApp);
        const id = c.req.param('id');
        const body = await c.req.json();
        const result = await client.put(`/api/data/todos/${id}`, body);
        return c.json(result, result.success ? 200 : 400);
    });

    // DELETE /:id - Delete a todo
    app.delete('/:id', async (c) => {
        const client = createClient(c, honoApp);
        const id = c.req.param('id');
        const result = await client.delete(`/api/data/todos/${id}`);
        return c.json(result, result.success ? 200 : 404);
    });

    // POST /:id/complete - Mark a todo as complete
    app.post('/:id/complete', async (c) => {
        const client = createClient(c, honoApp);
        const id = c.req.param('id');
        const result = await client.put(`/api/data/todos/${id}`, {
            status: 'completed',
            completed_at: new Date().toISOString(),
        });
        return c.json(result, result.success ? 200 : 400);
    });

    // POST /:id/reopen - Reopen a completed todo
    app.post('/:id/reopen', async (c) => {
        const client = createClient(c, honoApp);
        const id = c.req.param('id');
        const result = await client.put(`/api/data/todos/${id}`, {
            status: 'pending',
            completed_at: null,
        });
        return c.json(result, result.success ? 200 : 400);
    });

    return app;
}
