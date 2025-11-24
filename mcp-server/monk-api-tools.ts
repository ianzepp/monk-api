#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:9001';

// Authentication state (cached in memory for session)
let currentToken: string | null = null;
let currentTenant: string | null = null;
let currentFormat: string = 'toon'; // Response format preference (toon, yaml, json)

// ============================================
// TOOL DEFINITION TYPES
// ============================================
interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

// ============================================
// LOAD TOOL DEFINITIONS FROM JSON FILES
// ============================================
function loadToolDefinitions(): ToolDefinition[] {
    const toolsDir = join(__dirname, 'tools');
    const toolFiles = readdirSync(toolsDir).filter(file => file.endsWith('.json'));

    return toolFiles.map(file => {
        const toolPath = join(toolsDir, file);
        const toolContent = readFileSync(toolPath, 'utf-8');
        const tool = JSON.parse(toolContent);
        // Convert inputModel to inputSchema for MCP protocol
        return {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputModel || tool.inputSchema,
        };
    });
}

// ============================================
// CORE HELPER: Low-level HTTP requests
// ============================================
async function monkHttp(
    method: string,
    path: string,
    query?: Record<string, string>,
    body?: any,
    requireAuth: boolean = true,
    customHeaders?: Record<string, string>
): Promise<any> {
    const headers: Record<string, string> = {
        Accept: `application/${currentFormat}`, // Request TOON/YAML/JSON based on preference
        ...customHeaders, // Allow overriding any headers
    };

    if (requireAuth && currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
    }

    // Build URL with query parameters
    let url = `${API_BASE_URL}${path}`;
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

// ============================================
// SEMANTIC WRAPPERS: Higher-level operations
// ============================================
async function monkAuth(action: string, params: any): Promise<any> {
    let endpoint: string;
    let body: any;

    // Set format preference (default to 'toon')
    if (params.format) {
        currentFormat = params.format;
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
                    response_format: currentFormat,
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
                    response_format: currentFormat,
                },
            };
            break;

        case 'refresh':
            endpoint = '/auth/refresh';
            body = {};
            break;

        case 'status':
            return {
                authenticated: !!currentToken,
                tenant: currentTenant,
                format: currentFormat,
                has_token: !!currentToken,
            };

        default:
            throw new Error(`Unknown auth action: ${action}`);
    }

    // Auth responses should always be JSON for proper token extraction
    const response = await monkHttp('POST', endpoint, undefined, body, false, { Accept: 'application/json' });

    // Cache token for subsequent requests
    if (response.data?.token) {
        currentToken = response.data.token;
        currentTenant = response.data.tenant || params.tenant;
        return {
            ...response,
            message: `Authentication token cached. Response format: ${currentFormat}`,
        };
    }

    return response;
}


// ============================================
// TOOL HANDLERS
// ============================================
type ToolHandler = (args: Record<string, any>) => Promise<any>;

const toolHandlers: Record<string, ToolHandler> = {
    MonkAuth: async args => {
        return monkAuth(args.action, args);
    },

    MonkHttp: async args => {
        return monkHttp(args.method, args.path, args.query, args.body, args.requireAuth ?? true, args.headers);
    },
};

// ============================================
// MCP SERVER SETUP
// ============================================
const server = new Server(
    {
        name: 'monk-api-tools',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List available tools (loaded from JSON files)
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: loadToolDefinitions(),
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;

    try {
        const handler = toolHandlers[name];
        if (!handler) {
            throw new Error(`Unknown tool: ${name}`);
        }

        const result = await handler(args || {});

        // Return result as text (handles TOON/YAML/JSON)
        const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

        return {
            content: [
                {
                    type: 'text',
                    text: resultText,
                },
            ],
        };
    } catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            error: true,
                            message: error instanceof Error ? error.message : String(error),
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
});

// Start server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Monk API MCP Server running on stdio');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
