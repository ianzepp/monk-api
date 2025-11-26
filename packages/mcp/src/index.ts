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

// Model definitions are in models/sessions.yaml

// JSON-RPC response helpers
function jsonRpcSuccess(id: string | number | null, result: any): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string, data?: any): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message, data } };
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

    // POST / - JSON-RPC endpoint
    app.post('/', async (c) => {
        // Get or create session from header (model already exists from startup)
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
