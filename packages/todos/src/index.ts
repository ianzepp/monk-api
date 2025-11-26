/**
 * @monk-app/todos - Todo List Application
 *
 * A simple todo list app demonstrating the app package pattern.
 * Models are defined in models/todos.yaml and loaded automatically.
 */

import { Hono } from 'hono';

/**
 * App context provided by the loader
 */
export interface AppContext {
    client: {
        get<T = any>(path: string, query?: Record<string, string>): Promise<{ success: boolean; data?: T; error?: string }>;
        post<T = any>(path: string, body?: any): Promise<{ success: boolean; data?: T; error?: string }>;
        put<T = any>(path: string, body?: any): Promise<{ success: boolean; data?: T; error?: string }>;
        delete<T = any>(path: string): Promise<{ success: boolean; data?: T; error?: string }>;
    };
    token: string;
    appName: string;
    tenantName: string;
    honoApp: any;
}

/**
 * Create the Todos Hono app.
 */
export function createApp(context: AppContext): Hono {
    const app = new Hono();
    const { client } = context;

    // GET / - List all todos
    app.get('/', async (c) => {
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
        const body = await c.req.json();
        const result = await client.post('/api/data/todos', body);
        return c.json(result, result.success ? 201 : 400);
    });

    // GET /:id - Get a single todo
    app.get('/:id', async (c) => {
        const id = c.req.param('id');
        const result = await client.get(`/api/data/todos/${id}`);
        return c.json(result, result.success ? 200 : 404);
    });

    // PUT /:id - Update a todo
    app.put('/:id', async (c) => {
        const id = c.req.param('id');
        const body = await c.req.json();
        const result = await client.put(`/api/data/todos/${id}`, body);
        return c.json(result, result.success ? 200 : 400);
    });

    // DELETE /:id - Delete a todo
    app.delete('/:id', async (c) => {
        const id = c.req.param('id');
        const result = await client.delete(`/api/data/todos/${id}`);
        return c.json(result, result.success ? 200 : 404);
    });

    // POST /:id/complete - Mark a todo as complete
    app.post('/:id/complete', async (c) => {
        const id = c.req.param('id');
        const result = await client.put(`/api/data/todos/${id}`, {
            status: 'completed',
            completed_at: new Date().toISOString(),
        });
        return c.json(result, result.success ? 200 : 400);
    });

    // POST /:id/reopen - Reopen a completed todo
    app.post('/:id/reopen', async (c) => {
        const id = c.req.param('id');
        const result = await client.put(`/api/data/todos/${id}`, {
            status: 'pending',
            completed_at: null,
        });
        return c.json(result, result.success ? 200 : 400);
    });

    return app;
}
