/**
 * @monk/mcp - MCP (Model Context Protocol) Integration
 *
 * Provides JSON-RPC endpoint for MCP protocol, enabling LLM agents
 * to interact with the Monk API.
 */

import { Hono } from 'hono';
import type { JsonRpcRequest, JsonRpcResponse } from './types.js';
import { initSessions, getOrCreateSession } from './sessions.js';
import { setHonoApp, handleToolCall } from './handlers.js';
import { TOOLS } from './tools.js';

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
    honoApp: any; // Hono
}

// Session model definition for registration
const SESSION_MODEL = {
    model_name: 'sessions',
    model_label: 'MCP Sessions',
    fields: [
        { field_name: 'session_id', field_type: 'string', field_label: 'Session ID', is_required: true },
        { field_name: 'user_tenant', field_type: 'string', field_label: 'User Tenant' },
        { field_name: 'user_token', field_type: 'text', field_label: 'User Token' },
    ],
};

// JSON-RPC response helpers
function jsonRpcSuccess(id: string | number | null, result: any): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string, data?: any): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message, data } };
}

// Flag to track if sessions model has been initialized
let sessionsModelInitialized = false;

/**
 * Initialize sessions model on first request (lazy initialization).
 * This avoids making API calls during app creation which would lock the router.
 */
async function ensureSessionsModel(client: AppContext['client']): Promise<void> {
    if (sessionsModelInitialized) return;

    try {
        const describeRes = await client.get('/api/describe/sessions');
        if (!describeRes.success) {
            console.info('Creating sessions model for @monk/mcp');
            await client.post('/api/describe/sessions', {
                model_label: SESSION_MODEL.model_label,
            });
            await client.post('/api/describe/sessions/fields', SESSION_MODEL.fields);
        }
        sessionsModelInitialized = true;
    } catch (error) {
        console.warn('Failed to register sessions model:', error);
    }
}

/**
 * Create the MCP Hono app.
 */
export function createApp(context: AppContext): Hono {
    const app = new Hono();

    // Initialize session storage with API client
    initSessions(context.client);

    // Set reference to main Hono app for API calls
    setHonoApp(context.honoApp);

    // Store client for lazy model initialization
    const client = context.client;

    // POST / - JSON-RPC endpoint
    app.post('/', async (c) => {
        // Lazy initialize sessions model on first request
        await ensureSessionsModel(client);

        // Get or create session from header
        const sessionId = c.req.header('mcp-session-id') || 'default';
        const session = await getOrCreateSession(sessionId);

        let request: JsonRpcRequest;
        try {
            request = await c.req.json();
        } catch {
            return c.json(jsonRpcError(null, -32700, 'Parse error'));
        }

        const { method, params = {}, id } = request;

        try {
            switch (method) {
                case 'initialize':
                    return c.json(jsonRpcSuccess(id, {
                        protocolVersion: params.protocolVersion || '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'monk-api', version: '1.0.0' }
                    }), 200, { 'mcp-session-id': sessionId });

                case 'initialized':
                    return c.json(jsonRpcSuccess(id, {}));

                case 'tools/list':
                    return c.json(jsonRpcSuccess(id, { tools: TOOLS }));

                case 'tools/call': {
                    const { name, arguments: args = {} } = params;
                    const result = await handleToolCall(sessionId, session, name, args);
                    const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                    return c.json(jsonRpcSuccess(id, {
                        content: [{ type: 'text', text: content }]
                    }));
                }

                default:
                    return c.json(jsonRpcError(id, -32601, `Method not found: ${method}`));
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return c.json(jsonRpcSuccess(id, {
                content: [{ type: 'text', text: JSON.stringify({ error: true, message }, null, 2) }],
                isError: true
            }));
        }
    });

    return app;
}

// Re-export types
export type { McpSession, McpTool, JsonRpcRequest, JsonRpcResponse } from './types.js';
