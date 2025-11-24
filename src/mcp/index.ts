/**
 * MCP (Model Context Protocol) HTTP Server Integration
 *
 * Integrates the MCP server into the main Hono API server at /mcp endpoint.
 * Uses StreamableHTTPServerTransport for modern MCP protocol support.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

// ============================================
// CONFIGURATION
// ============================================

// API base URL - when running integrated, this is the same server
const getApiBaseUrl = () => process.env.MCP_API_URL || `http://localhost:${process.env.PORT || 9001}`;

// ============================================
// SESSION STATE
// ============================================

// Each MCP session maintains its own auth state
interface SessionState {
    token: string | null;
    tenant: string | null;
    format: string;
    transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, SessionState>();

// ============================================
// TOOL DEFINITIONS
// ============================================

const TOOLS = [
    {
        name: 'MonkAuth',
        description: 'Authentication for Monk API. Actions: register (create new tenant), login (authenticate), refresh (renew token), status (check auth state). Sets response_format preference (toon/yaml/json). Default format is "toon" for optimal LLM token efficiency.',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['register', 'login', 'refresh', 'status'],
                    description: 'Auth action to perform'
                },
                tenant: {
                    type: 'string',
                    description: 'Tenant name (required for register/login)'
                },
                username: {
                    type: 'string',
                    description: 'Username (defaults to "root")'
                },
                password: {
                    type: 'string',
                    description: 'Password (required for login)'
                },
                description: {
                    type: 'string',
                    description: 'Human-readable tenant description (register only)'
                },
                template: {
                    type: 'string',
                    description: 'Template name for database model (register only, defaults to "system")'
                },
                format: {
                    type: 'string',
                    enum: ['toon', 'yaml', 'json'],
                    description: 'Response format preference (defaults to "toon" for LLM efficiency)'
                }
            },
            required: ['action']
        }
    },
    {
        name: 'MonkHttp',
        description: 'HTTP requests to Monk API. Automatically injects JWT token (if authenticated) and Accept header for response format. **Start here: GET /docs (no auth required) returns full API documentation with all endpoints, examples, and usage patterns.** Key endpoints: /auth/* (login/register), /api/data/:model (CRUD), /api/find/:model (queries), /api/describe/:model (schema), /api/aggregate/:model (analytics). Supports all HTTP methods (GET, POST, PUT, DELETE, PATCH). Returns TOON format by default (40% fewer tokens than JSON).',
        inputSchema: {
            type: 'object',
            properties: {
                method: {
                    type: 'string',
                    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                    description: 'HTTP method'
                },
                path: {
                    type: 'string',
                    description: 'API path (e.g., /api/data/users, /api/find/orders, /docs)'
                },
                query: {
                    type: 'object',
                    description: 'URL query parameters (optional)',
                    additionalProperties: { type: 'string' }
                },
                body: {
                    description: 'Request body (optional, not allowed for GET/HEAD). Can be object or array.'
                },
                requireAuth: {
                    type: 'boolean',
                    description: 'Whether to include JWT token (default: true). Set false for public endpoints like /docs.'
                },
                headers: {
                    type: 'object',
                    description: 'Custom HTTP headers (optional)',
                    additionalProperties: { type: 'string' }
                }
            },
            required: ['method', 'path']
        }
    }
];

// ============================================
// TOOL HANDLERS
// ============================================

async function monkHttp(
    session: SessionState,
    method: string,
    path: string,
    query?: Record<string, string>,
    body?: any,
    requireAuth: boolean = true,
    customHeaders?: Record<string, string>
): Promise<any> {
    const headers: Record<string, string> = {
        Accept: `application/${session.format}`,
        ...customHeaders,
    };

    if (requireAuth && session.token) {
        headers['Authorization'] = `Bearer ${session.token}`;
    }

    // Build URL with query parameters
    let url = `${getApiBaseUrl()}${path}`;
    if (query && Object.keys(query).length > 0) {
        const params = new URLSearchParams(query);
        url += `?${params.toString()}`;
    }

    const options: RequestInit = {
        method,
        headers,
    };

    // Only add body for non-GET/HEAD requests
    if (body && !['GET', 'HEAD'].includes(method)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // Return text (TOON/YAML) or JSON based on content-type
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

async function monkAuth(session: SessionState, action: string, params: any): Promise<any> {
    let endpoint: string;
    let body: any;

    // Set format preference
    if (params.format) {
        session.format = params.format;
    }

    switch (action) {
        case 'register':
            endpoint = '/auth/register';
            body = {
                tenant: params.tenant,
                template: params.template,
                username: params.username,
                description: params.description,
                preferences: {
                    response_format: session.format,
                },
            };
            break;

        case 'login':
            endpoint = '/auth/login';
            body = {
                tenant: params.tenant,
                username: params.username || 'root',
                password: params.password,
                preferences: {
                    response_format: session.format,
                },
            };
            break;

        case 'refresh':
            endpoint = '/auth/refresh';
            body = {};
            break;

        case 'status':
            return {
                authenticated: !!session.token,
                tenant: session.tenant,
                format: session.format,
                has_token: !!session.token,
            };

        default:
            throw new Error(`Unknown auth action: ${action}`);
    }

    // Auth responses should always be JSON for proper token extraction
    const response = await monkHttp(session, 'POST', endpoint, undefined, body, false, { Accept: 'application/json' });

    // Cache token for subsequent requests
    if (response.data?.token) {
        session.token = response.data.token;
        session.tenant = response.data.tenant || params.tenant;
        return {
            ...response,
            message: `Authentication token cached. Response format: ${session.format}`,
        };
    }

    return response;
}

// ============================================
// MCP SERVER FACTORY
// ============================================

function createMcpServer(sessionId: string): Server {
    const server = new Server(
        {
            name: 'monk-api',
            version: '1.0.0',
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools: TOOLS };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const toolArgs = (args || {}) as Record<string, any>;

        // Get or create session state
        let session = sessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        try {
            let result: any;

            switch (name) {
                case 'MonkAuth':
                    result = await monkAuth(session, toolArgs.action, toolArgs);
                    break;

                case 'MonkHttp':
                    result = await monkHttp(
                        session,
                        toolArgs.method,
                        toolArgs.path,
                        toolArgs.query,
                        toolArgs.body,
                        toolArgs.requireAuth ?? true,
                        toolArgs.headers
                    );
                    break;

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }

            // Return result as text
            const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

            return {
                content: [{ type: 'text', text: resultText }],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: true,
                            message: error instanceof Error ? error.message : String(error),
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    });

    return server;
}

// ============================================
// HTTP HANDLER FOR HONO
// ============================================

/**
 * Handle MCP requests via Hono
 * This needs access to raw Node.js req/res objects
 */
export async function handleMcpRequest(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    // For stateless mode, create a new transport per request
    // For stateful mode, we'd need to track sessions

    const sessionId = randomUUID();

    // Create session state
    const sessionState: SessionState = {
        token: null,
        tenant: null,
        format: 'toon',
        transport: null as any, // Will be set below
    };

    // Create transport in stateless mode (no session management)
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        onsessioninitialized: (id) => {
            sessions.set(id, sessionState);
            console.info('MCP session initialized:', id);
        },
        onsessionclosed: (id) => {
            sessions.delete(id!);
            console.info('MCP session closed:', id);
        },
    });

    sessionState.transport = transport;

    // Create MCP server for this session
    const server = createMcpServer(sessionId);

    // Connect server to transport
    await server.connect(transport);

    // Handle the request
    await transport.handleRequest(req, res);
}

/**
 * Get the raw Node.js request/response from Hono context
 * This is needed because MCP SDK expects Node.js http objects
 */
export function getMcpHandler() {
    return async (nodeReq: IncomingMessage, nodeRes: ServerResponse) => {
        await handleMcpRequest(nodeReq, nodeRes);
    };
}
