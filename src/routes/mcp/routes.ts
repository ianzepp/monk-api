/**
 * MCP (Model Context Protocol) Routes
 *
 * Simple JSON-RPC implementation for MCP protocol.
 * Calls Hono app.fetch() directly instead of network requests.
 */

import type { Context } from 'hono';
import type { Hono } from 'hono';
import { DatabaseConnection } from '@src/lib/database-connection.js';

// ============================================
// TYPES
// ============================================

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
    format: string;
}

// ============================================
// SESSION STORAGE (Database-backed with in-memory cache)
// ============================================

// In-memory cache for performance (avoids DB hit on every request)
const sessionCache = new Map<string, McpSession>();

async function loadSessionFromDb(sessionId: string): Promise<McpSession | null> {
    try {
        const pool = DatabaseConnection.getMainPool();
        const result = await pool.query(
            'SELECT tenant, token, format FROM mcp_sessions WHERE id = $1',
            [sessionId]
        );
        if (result.rows.length > 0) {
            const row = result.rows[0];
            return {
                tenant: row.tenant,
                token: row.token,
                format: row.format || 'toon'
            };
        }
    } catch (error) {
        // Log but don't fail - fall back to empty session
        console.warn('Failed to load MCP session from DB:', error);
    }
    return null;
}

async function saveSessionToDb(sessionId: string, session: McpSession): Promise<void> {
    try {
        const pool = DatabaseConnection.getMainPool();
        await pool.query(
            `INSERT INTO mcp_sessions (id, tenant, token, format)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE SET
                tenant = EXCLUDED.tenant,
                token = EXCLUDED.token,
                format = EXCLUDED.format,
                updated_at = CURRENT_TIMESTAMP`,
            [sessionId, session.tenant, session.token, session.format]
        );
    } catch (error) {
        console.warn('Failed to save MCP session to DB:', error);
    }
}

async function getOrCreateSession(sessionId: string): Promise<McpSession> {
    // Check cache first
    const cached = sessionCache.get(sessionId);
    if (cached) {
        return cached;
    }

    // Try loading from database
    const fromDb = await loadSessionFromDb(sessionId);
    if (fromDb) {
        sessionCache.set(sessionId, fromDb);
        return fromDb;
    }

    // Create new session
    const newSession: McpSession = { token: null, tenant: null, format: 'toon' };
    sessionCache.set(sessionId, newSession);
    return newSession;
}

async function updateSession(sessionId: string, session: McpSession): Promise<void> {
    sessionCache.set(sessionId, session);
    await saveSessionToDb(sessionId, session);
}

// ============================================
// TOOL DEFINITIONS
// ============================================

const TOOLS = [
    {
        name: 'MonkAuth',
        description: 'Authentication for Monk API. Actions: register (create new tenant), login (authenticate), refresh (renew token), status (check auth state). Sets response_format preference (toon/yaml/json). Default format is "toon" for optimal LLM token efficiency.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                action: {
                    type: 'string',
                    enum: ['register', 'login', 'refresh', 'status'],
                    description: 'Auth action to perform'
                },
                tenant: { type: 'string', description: 'Tenant name (required for register/login)' },
                username: { type: 'string', description: 'Username (defaults to "root")' },
                password: { type: 'string', description: 'Password (required for login)' },
                description: { type: 'string', description: 'Human-readable tenant description (register only)' },
                template: { type: 'string', description: 'Template name (register only, defaults to "system")' },
                adapter: { type: 'string', enum: ['postgresql', 'sqlite'], description: 'Database adapter (register only, defaults to "postgresql")' },
                format: { type: 'string', enum: ['toon', 'yaml', 'json'], description: 'Response format preference' }
            },
            required: ['action']
        }
    },
    {
        name: 'MonkHttp',
        description: 'HTTP requests to Monk API. Automatically injects JWT token (if authenticated). **Start here: GET /docs (no auth required) returns full API documentation.** Key endpoints: /auth/* (login/register), /api/data/:model (CRUD), /api/find/:model (queries), /api/describe/:model (schema), /api/aggregate/:model (analytics). Returns TOON format by default (40% fewer tokens than JSON).',
        inputSchema: {
            type: 'object' as const,
            properties: {
                method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], description: 'HTTP method' },
                path: { type: 'string', description: 'API path (e.g., /api/data/users, /docs)' },
                query: { type: 'object', description: 'URL query parameters (optional)' },
                body: { description: 'Request body (optional)' },
                requireAuth: { type: 'boolean', description: 'Include JWT token (default: true)' }
            },
            required: ['method', 'path']
        }
    }
];

// ============================================
// TOOL HANDLERS
// ============================================

// Reference to the Hono app (set during route registration)
let honoApp: Hono | null = null;

export function setHonoApp(app: Hono) {
    honoApp = app;
}

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

    // Build headers
    const headers: Record<string, string> = {
        'Accept': `application/${session.format}`,
    };

    if (requireAuth && session.token) {
        headers['Authorization'] = `Bearer ${session.token}`;
    }

    // Build request options
    const init: RequestInit = { method, headers };

    // Always set Content-Type for POST/PUT/PATCH (middleware requires it)
    if (!['GET', 'HEAD'].includes(method)) {
        headers['Content-Type'] = 'application/json';
        init.body = body ? JSON.stringify(body) : '{}';
    }

    // Call Hono app directly (no network)
    const request = new Request(url, init);
    const response = await honoApp.fetch(request);

    // Parse response
    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    if (!response.ok) {
        throw new Error(`API Error (${response.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }

    return data;
}

async function handleMonkAuth(sessionId: string, session: McpSession, params: Record<string, any>): Promise<any> {
    const { action, format } = params;

    // Update format preference
    if (format) {
        session.format = format;
    }

    switch (action) {
        case 'status':
            return {
                authenticated: !!session.token,
                tenant: session.tenant,
                format: session.format,
                has_token: !!session.token,
            };

        case 'register': {
            const body = {
                tenant: params.tenant,
                template: params.template,
                username: params.username,
                description: params.description,
                adapter: params.adapter,
                preferences: { response_format: session.format },
            };
            // Auth endpoints need JSON response for token extraction
            const response = await callApi(
                { ...session, format: 'json' },
                'POST',
                '/auth/register',
                undefined,
                body,
                false
            );
            if (response.data?.token) {
                session.token = response.data.token;
                session.tenant = response.data.tenant || params.tenant;
                await updateSession(sessionId, session);
            }
            return { ...response, message: `Token cached. Format: ${session.format}` };
        }

        case 'login': {
            const body = {
                tenant: params.tenant,
                username: params.username || 'root',
                password: params.password,
                preferences: { response_format: session.format },
            };
            const response = await callApi(
                { ...session, format: 'json' },
                'POST',
                '/auth/login',
                undefined,
                body,
                false
            );
            if (response.data?.token) {
                session.token = response.data.token;
                session.tenant = response.data.tenant || params.tenant;
                await updateSession(sessionId, session);
            }
            return { ...response, message: `Token cached. Format: ${session.format}` };
        }

        case 'refresh': {
            const response = await callApi(
                { ...session, format: 'json' },
                'POST',
                '/auth/refresh',
                undefined,
                {},
                true
            );
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

async function handleMonkHttp(session: McpSession, params: Record<string, any>): Promise<any> {
    const { method, path, query, body, requireAuth = true } = params;
    return callApi(session, method, path, query, body, requireAuth);
}

async function handleToolCall(sessionId: string, session: McpSession, name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
        case 'MonkAuth':
            return handleMonkAuth(sessionId, session, args);
        case 'MonkHttp':
            return handleMonkHttp(session, args);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ============================================
// JSON-RPC RESPONSE HELPERS
// ============================================

function jsonRpcSuccess(id: string | number | null, result: any): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string, data?: any): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message, data } };
}

// ============================================
// ROUTE HANDLER
// ============================================

export async function McpPost(c: Context) {
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
                // Client acknowledgment - no response needed
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
}
