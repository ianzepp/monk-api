/**
 * MCP Tool Handlers
 */

import type { Hono } from 'hono';
import type { McpSession } from './types.js';
import { updateSession } from './sessions.js';

// Reference to the main Hono app for API calls
let honoApp: Hono | null = null;

/**
 * Set the Hono app reference for making API calls.
 */
export function setHonoApp(app: Hono): void {
    honoApp = app;
}

/**
 * Make an API call through the Hono app.
 */
async function callApi(
    session: McpSession,
    method: string,
    path: string,
    query?: Record<string, string>,
    body?: any,
    requireAuth: boolean = true
): Promise<any> {
    if (!honoApp) {
        throw new Error('Hono app not initialized');
    }

    // Build URL with query parameters
    let url = `http://localhost${path}`;
    if (query && Object.keys(query).length > 0) {
        const params = new URLSearchParams(query);
        url += `?${params.toString()}`;
    }

    // Build headers - always use JSON
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };

    if (requireAuth && session.token) {
        headers['Authorization'] = `Bearer ${session.token}`;
    }

    // Build request options
    const init: RequestInit = { method, headers };

    // Add body for POST/PUT/PATCH
    if (!['GET', 'HEAD'].includes(method)) {
        init.body = body ? JSON.stringify(body) : '{}';
    }

    // Call Hono app directly (no network)
    const request = new Request(url, init);
    const response = await honoApp.fetch(request);

    // Parse JSON response
    const data = await response.json();

    if (!response.ok) {
        throw new Error(`API Error (${response.status}): ${JSON.stringify(data)}`);
    }

    return data;
}

/**
 * Handle MonkAuth tool calls.
 */
export async function handleMonkAuth(
    sessionId: string,
    session: McpSession,
    params: Record<string, any>
): Promise<any> {
    const { action } = params;

    switch (action) {
        case 'status':
            return {
                authenticated: !!session.token,
                tenant: session.tenant,
                has_token: !!session.token,
            };

        case 'register': {
            const body = {
                tenant: params.tenant,
                template: params.template,
                username: params.username,
                description: params.description,
                adapter: params.adapter,
            };
            const response = await callApi(session, 'POST', '/auth/register', undefined, body, false);
            if (response.data?.token) {
                session.token = response.data.token;
                session.tenant = response.data.tenant || params.tenant;
                await updateSession(sessionId, session);
            }
            return { ...response, message: 'Token cached' };
        }

        case 'login': {
            const body = {
                tenant: params.tenant,
                username: params.username || 'root',
                password: params.password,
            };
            const response = await callApi(session, 'POST', '/auth/login', undefined, body, false);
            if (response.data?.token) {
                session.token = response.data.token;
                session.tenant = response.data.tenant || params.tenant;
                await updateSession(sessionId, session);
            }
            return { ...response, message: 'Token cached' };
        }

        case 'refresh': {
            const response = await callApi(session, 'POST', '/auth/refresh', undefined, {}, true);
            if (response.data?.token) {
                session.token = response.data.token;
                await updateSession(sessionId, session);
            }
            return response;
        }

        default:
            throw new Error(`Unknown auth action: ${action}`);
    }
}

/**
 * Handle MonkHttp tool calls.
 */
export async function handleMonkHttp(
    session: McpSession,
    params: Record<string, any>
): Promise<any> {
    const { method, path, query, body, requireAuth = true } = params;
    return callApi(session, method, path, query, body, requireAuth);
}

/**
 * Dispatch a tool call to the appropriate handler.
 */
export async function handleToolCall(
    sessionId: string,
    session: McpSession,
    name: string,
    args: Record<string, any>
): Promise<any> {
    switch (name) {
        case 'MonkAuth':
            return handleMonkAuth(sessionId, session, args);
        case 'MonkHttp':
            return handleMonkHttp(session, args);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
