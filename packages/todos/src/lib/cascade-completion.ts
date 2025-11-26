/**
 * Cascade Completion Observer
 *
 * When a todo is marked as completed, checks if all siblings (todos with same parent)
 * are also completed. If so, marks the parent as completed, which recursively
 * triggers this logic up the tree.
 */

import type { Context } from 'hono';

interface Todo {
    id: string;
    parent_id: string | null;
    status: string;
    completed_at: string | null;
}

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

type ApiClient = {
    get: <T>(path: string, query?: Record<string, string>) => Promise<ApiResponse<T>>;
    put: <T>(path: string, body?: any) => Promise<ApiResponse<T>>;
};

/**
 * Check if all siblings are completed and cascade to parent if so.
 *
 * @param client - API client for making requests
 * @param todo - The todo that was just completed
 */
export async function cascadeCompletion(client: ApiClient, todo: Todo): Promise<void> {
    // Only trigger on completed status
    if (todo.status !== 'completed') {
        return;
    }

    // No parent means top-level todo, nothing to cascade
    if (!todo.parent_id) {
        return;
    }

    // Find all siblings (same parent_id)
    const siblingsResult = await client.get<Todo[]>('/api/data/todos', {
        'where[parent_id]': todo.parent_id,
    });

    if (!siblingsResult.success || !siblingsResult.data) {
        console.warn('Failed to fetch siblings for cascade completion:', siblingsResult.error);
        return;
    }

    const siblings = siblingsResult.data;

    // Check if ALL siblings are completed
    const allCompleted = siblings.every(s => s.status === 'completed');

    if (!allCompleted) {
        return;
    }

    // All siblings completed - mark parent as completed
    // This will trigger the observer recursively for the parent
    console.info(`All children of ${todo.parent_id} completed, marking parent as completed`);

    const updateResult = await client.put<Todo>(`/api/data/todos/${todo.parent_id}`, {
        status: 'completed',
        completed_at: new Date().toISOString(),
    });

    if (!updateResult.success) {
        console.warn('Failed to update parent todo:', updateResult.error);
    }
}

/**
 * Create a client wrapper that can be used with cascadeCompletion
 */
export function createCascadeClient(c: Context, honoApp: any): ApiClient {
    const authHeader = c.req.header('Authorization');

    async function request<T>(method: string, path: string, options: { query?: Record<string, string>; body?: any } = {}): Promise<ApiResponse<T>> {
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
        put: <T>(path: string, body?: any) => request<T>('PUT', path, { body }),
    };
}
