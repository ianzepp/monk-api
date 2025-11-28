/**
 * MCP Server
 *
 * Standalone MCP (Model Context Protocol) server using regular HTTP.
 * Provides JSON-RPC endpoint for LLM agents to interact with the Monk API.
 */

import type { Hono } from 'hono';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// =============================================================================
// Types
// =============================================================================

interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, any>;
    id: string | number;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

interface McpSession {
    token: string | null;
    tenant: string | null;
}

interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOLS: McpTool[] = [
    {
        name: 'MonkAuth',
        description:
            'Authentication for Monk API. Actions: register (create new tenant), login (authenticate), refresh (renew token), status (check auth state).',
        inputSchema: {
            type: 'object' as const,
            properties: {
                action: {
                    type: 'string',
                    enum: ['register', 'login', 'refresh', 'status'],
                    description: 'Auth action to perform',
                },
                tenant: {
                    type: 'string',
                    description: 'Tenant name (required for register/login)',
                },
                username: { type: 'string', description: 'Username (defaults to "root")' },
                password: { type: 'string', description: 'Password (required for login)' },
                description: {
                    type: 'string',
                    description: 'Human-readable tenant description (register only)',
                },
                template: {
                    type: 'string',
                    description: 'Template name (register only, defaults to "system")',
                },
                adapter: {
                    type: 'string',
                    enum: ['postgresql', 'sqlite'],
                    description: 'Database adapter (register only, defaults to "postgresql")',
                },
            },
            required: ['action'],
        },
    },
    {
        name: 'MonkHttp',
        description:
            'HTTP requests to Monk API. Automatically injects JWT token (if authenticated). **Start here: GET /docs (no auth required) returns full API documentation.** Key endpoints: /auth/* (login/register), /api/data/:model (CRUD), /api/find/:model (queries), /api/describe/:model (schema), /api/aggregate/:model (analytics).',
        inputSchema: {
            type: 'object' as const,
            properties: {
                method: {
                    type: 'string',
                    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                    description: 'HTTP method',
                },
                path: {
                    type: 'string',
                    description: 'API path (e.g., /api/data/users, /docs)',
                },
                query: { type: 'object', description: 'URL query parameters (optional)' },
                body: { description: 'Request body (optional)' },
                requireAuth: {
                    type: 'boolean',
                    description: 'Include JWT token (default: true)',
                },
            },
            required: ['method', 'path'],
        },
    },
];

// =============================================================================
// Session Management (file-backed)
// =============================================================================

const SESSION_FILE = process.env.MCP_SESSION_FILE || '.data/mcp-sessions.json';

// In-memory cache backed by file
let sessionCache: Map<string, McpSession> | null = null;

function loadSessions(): Map<string, McpSession> {
    if (sessionCache) return sessionCache;

    try {
        if (existsSync(SESSION_FILE)) {
            const data = readFileSync(SESSION_FILE, 'utf-8');
            const parsed = JSON.parse(data) as Record<string, McpSession>;
            sessionCache = new Map(Object.entries(parsed));
            console.info(`MCP: Loaded ${sessionCache.size} session(s) from ${SESSION_FILE}`);
        } else {
            sessionCache = new Map();
        }
    } catch (error) {
        console.warn(`MCP: Failed to load sessions from ${SESSION_FILE}:`, error);
        sessionCache = new Map();
    }

    return sessionCache;
}

function saveSessions(): void {
    if (!sessionCache) return;

    try {
        const dir = dirname(SESSION_FILE);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        const data = Object.fromEntries(sessionCache);
        writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.warn(`MCP: Failed to save sessions to ${SESSION_FILE}:`, error);
    }
}

function getOrCreateSession(sessionId: string): McpSession {
    const sessions = loadSessions();
    const cached = sessions.get(sessionId);
    if (cached) return cached;

    const newSession: McpSession = { token: null, tenant: null };
    sessions.set(sessionId, newSession);
    return newSession;
}

function updateSession(sessionId: string, session: McpSession): void {
    const sessions = loadSessions();
    sessions.set(sessionId, session);
    saveSessions();
}

// =============================================================================
// API Caller
// =============================================================================

async function callApi(
    honoApp: Hono,
    session: McpSession,
    method: string,
    path: string,
    query?: Record<string, string>,
    body?: any,
    requireAuth: boolean = true
): Promise<any> {
    // Build URL with query parameters
    let url = `http://localhost${path}`;
    if (query && Object.keys(query).length > 0) {
        const params = new URLSearchParams(query);
        url += `?${params.toString()}`;
    }

    // Build headers
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };

    if (requireAuth && session.token) {
        headers['Authorization'] = `Bearer ${session.token}`;
    }

    // Build request
    const init: RequestInit = { method, headers };

    if (!['GET', 'HEAD'].includes(method)) {
        init.body = body ? JSON.stringify(body) : '{}';
    }

    // Call Hono app directly (no network)
    const request = new Request(url, init);
    const response = await honoApp.fetch(request);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(`API Error (${response.status}): ${JSON.stringify(data)}`);
    }

    return data;
}

// =============================================================================
// Tool Handlers
// =============================================================================

async function handleMonkAuth(
    honoApp: Hono,
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
            const response = await callApi(
                honoApp,
                session,
                'POST',
                '/auth/register',
                undefined,
                body,
                false
            );
            if (response.data?.token) {
                session.token = response.data.token;
                session.tenant = response.data.tenant || params.tenant;
                updateSession(sessionId, session);
            }
            return { ...response, message: 'Token cached' };
        }

        case 'login': {
            const body = {
                tenant: params.tenant,
                username: params.username || 'root',
                password: params.password,
            };
            const response = await callApi(
                honoApp,
                session,
                'POST',
                '/auth/login',
                undefined,
                body,
                false
            );
            if (response.data?.token) {
                session.token = response.data.token;
                session.tenant = response.data.tenant || params.tenant;
                updateSession(sessionId, session);
            }
            return { ...response, message: 'Token cached' };
        }

        case 'refresh': {
            const response = await callApi(
                honoApp,
                session,
                'POST',
                '/auth/refresh',
                undefined,
                {},
                true
            );
            if (response.data?.token) {
                session.token = response.data.token;
                updateSession(sessionId, session);
            }
            return response;
        }

        default:
            throw new Error(`Unknown auth action: ${action}`);
    }
}

async function handleMonkHttp(
    honoApp: Hono,
    session: McpSession,
    params: Record<string, any>
): Promise<any> {
    const { method, path, query, body, requireAuth = true } = params;
    return callApi(honoApp, session, method, path, query, body, requireAuth);
}

async function handleToolCall(
    honoApp: Hono,
    sessionId: string,
    session: McpSession,
    name: string,
    args: Record<string, any>
): Promise<any> {
    switch (name) {
        case 'MonkAuth':
            return handleMonkAuth(honoApp, sessionId, session, args);
        case 'MonkHttp':
            return handleMonkHttp(honoApp, session, args);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// =============================================================================
// JSON-RPC Helpers
// =============================================================================

function jsonRpcSuccess(id: string | number | null, result: any): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(
    id: string | number | null,
    code: number,
    message: string,
    data?: any
): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message, data } };
}

// =============================================================================
// Request Handler
// =============================================================================

async function handleRequest(honoApp: Hono, request: Request): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id',
            },
        });
    }

    // Only accept POST requests
    if (request.method !== 'POST') {
        return Response.json(jsonRpcError(null, -32600, 'Only POST requests supported'), {
            status: 405,
        });
    }

    // Get or create session
    const sessionId = request.headers.get('mcp-session-id') || 'default';
    const session = getOrCreateSession(sessionId);

    // Parse request body
    let rpcRequest: JsonRpcRequest;
    try {
        rpcRequest = (await request.json()) as JsonRpcRequest;
    } catch {
        return Response.json(jsonRpcError(null, -32700, 'Parse error'));
    }

    const { method, params = {}, id } = rpcRequest;

    try {
        switch (method) {
            case 'initialize':
                return Response.json(
                    jsonRpcSuccess(id, {
                        protocolVersion: params.protocolVersion || '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'monk-api', version: '1.0.0' },
                    }),
                    {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'mcp-session-id': sessionId,
                            'Access-Control-Allow-Origin': '*',
                        },
                    }
                );

            case 'initialized':
                return Response.json(jsonRpcSuccess(id, {}));

            case 'tools/list':
                return Response.json(jsonRpcSuccess(id, { tools: TOOLS }));

            case 'tools/call': {
                const { name, arguments: args = {} } = params;
                const result = await handleToolCall(honoApp, sessionId, session, name, args);
                const content =
                    typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                return Response.json(
                    jsonRpcSuccess(id, {
                        content: [{ type: 'text', text: content }],
                    })
                );
            }

            default:
                return Response.json(jsonRpcError(id, -32601, `Method not found: ${method}`));
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json(
            jsonRpcSuccess(id, {
                content: [{ type: 'text', text: JSON.stringify({ error: true, message }, null, 2) }],
                isError: true,
            })
        );
    }
}

// =============================================================================
// Server Handle
// =============================================================================

export interface McpServerHandle {
    stop: () => void;
}

export interface McpServerConfig {
    port?: number;
    host?: string;
}

/**
 * Start the MCP server
 *
 * @param honoApp - The main Hono app instance for making API calls
 * @param config - Server configuration
 * @returns Server handle with stop() method
 */
export function startMcpServer(honoApp: Hono, config?: McpServerConfig): McpServerHandle {
    const port = config?.port ?? Number(process.env.MCP_PORT || 3001);
    const hostname = config?.host ?? process.env.MCP_HOST ?? '0.0.0.0';

    const server = Bun.serve({
        hostname,
        port,
        fetch: (request) => handleRequest(honoApp, request),
    });

    console.info(`MCP server listening on ${hostname}:${port}`);

    return {
        stop: () => {
            server.stop();
            console.info('MCP server stopped');
        },
    };
}
