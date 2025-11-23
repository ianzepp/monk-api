#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestModel, ListToolsRequestModel } from '@modelcontextprotocol/sdk/types.js';
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
// LOAD TOOL DEFINITIONS
// ============================================
function loadToolDefinitions(): any[] {
    const toolsDir = join(__dirname, 'tools');
    const toolFiles = readdirSync(toolsDir).filter(file => file.endsWith('.json'));

    return toolFiles.map(file => {
        const toolPath = join(toolsDir, file);
        const toolContent = readFileSync(toolPath, 'utf-8');
        return JSON.parse(toolContent);
    });
}

// ============================================
// CORE HELPER: Low-level HTTP requests
// ============================================
async function monkHttp(method: string, path: string, query?: Record<string, string>, body?: any, requireAuth: boolean = true, customHeaders?: Record<string, string>): Promise<any> {
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
    const response = await monkHttp('POST', endpoint, undefined, body, false, { 'Accept': 'application/json' });

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

/**
 * MonkData - High-level data operations mirroring database.ts methods
 * Operations: selectAny, selectOne, select404, createAll, updateAll, deleteAll, count, aggregate
 */
async function monkData(operation: string, model: string, params: any = {}): Promise<any> {
    if (!currentToken) {
        throw new Error('Not authenticated. Use MonkAuth with action "register" or "login" first.');
    }

    switch (operation) {
        // SELECT operations
        case 'selectAny':
        case 'selectOne':
        case 'select404':
            // Use Find API for flexible queries
            const findResult = await monkHttp('POST', `/api/find/${model}`, undefined, params);
            if (operation === 'selectOne' || operation === 'select404') {
                // Return single record or throw
                if (typeof findResult === 'string') {
                    // TOON/YAML response - return as-is
                    return findResult;
                }
                if (!findResult.data || findResult.data.length === 0) {
                    if (operation === 'select404') {
                        throw new Error('Record not found');
                    }
                    return null;
                }
                return findResult.data[0];
            }
            return findResult;

        // CREATE operations
        case 'createAll':
            // params should be array of records
            return monkHttp('POST', `/api/data/${model}`, undefined, params);

        // UPDATE operations
        case 'updateAll':
            // params should be array of updates with id field
            return monkHttp('PUT', `/api/data/${model}`, undefined, params);

        // DELETE operations
        case 'deleteAll':
            // params should be array of {id: ...} objects
            return monkHttp('DELETE', `/api/data/${model}`, undefined, params);

        // ANALYTICS operations
        case 'count':
            return monkHttp('POST', `/api/find/${model}`, undefined, {
                where: params.where,
                select: ['count(*)'],
            });

        case 'aggregate':
            return monkHttp('POST', `/api/aggregate/${model}`, undefined, params);

        default:
            throw new Error(`Unknown MonkData operation: ${operation}. Supported: selectAny, selectOne, select404, createAll, updateAll, deleteAll, count, aggregate`);
    }
}

/**
 * MonkDescribe - Model operations
 * Operations: list, get, create, update, delete, addField, updateField, deleteField
 */
async function monkDescribe(operation: string, model?: string, params: any = {}): Promise<any> {
    if (!currentToken) {
        throw new Error('Not authenticated. Use MonkAuth first.');
    }

    switch (operation) {
        case 'list':
            // List all models
            return monkHttp('GET', '/api/model');

        case 'get':
            // Get specific model
            if (!model) throw new Error('model parameter required for "get" operation');
            return monkHttp('GET', `/api/model/${model}`);

        case 'create':
            // Create new model
            if (!model) throw new Error('model parameter required for "create" operation');
            return monkHttp('POST', `/api/describe/${model}`, undefined, params);

        case 'update':
            // Update model metadata
            if (!model) throw new Error('model parameter required for "update" operation');
            return monkHttp('PUT', `/api/describe/${model}`, undefined, params);

        case 'delete':
            // Delete model
            if (!model) throw new Error('model parameter required for "delete" operation');
            return monkHttp('DELETE', `/api/describe/${model}`);

        case 'addField':
            // Add field to model
            if (!model) throw new Error('model parameter required for "addField" operation');
            if (!params.field_name) throw new Error('params.field_name required for "addField" operation');
            return monkHttp('POST', `/api/describe/${model}/fields/${params.field_name}`, undefined, params);

        case 'updateField':
            // Update field definition
            if (!model) throw new Error('model parameter required for "updateField" operation');
            if (!params.field_name) throw new Error('params.field_name required for "updateField" operation');
            return monkHttp('PUT', `/api/describe/${model}/fields/${params.field_name}`, undefined, params);

        case 'deleteField':
            // Delete field
            if (!model) throw new Error('model parameter required for "deleteField" operation');
            if (!params.field_name) throw new Error('params.field_name required for "deleteField" operation');
            return monkHttp('DELETE', `/api/describe/${model}/fields/${params.field_name}`);

        default:
            throw new Error(`Unknown MonkDescribe operation: ${operation}. Supported: list, get, create, update, delete, addField, updateField, deleteField`);
    }
}

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

// Define tools
server.setRequestHandler(ListToolsRequestModel, async () => {
    return {
        tools: loadToolDefinitions(),
    };
});

// LEGACY: Old hardcoded definitions (replaced by JSON files in tools/)
// Keeping this comment as reference for the structure
/*
const LEGACY_TOOLS = [
      {
        name: 'MonkHttp',
        description: 'Make a raw HTTP request to the Monk API. Low-level tool for custom requests.',
        inputModel: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              description: 'HTTP method (GET, POST, PUT, DELETE, etc.)',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            },
            path: {
              type: 'string',
              description: 'API path (e.g., /api/data/users or /auth/register)',
            },
            body: {
              type: 'object',
              description: 'Request body as JSON object (optional)',
            },
            requireAuth: {
              type: 'boolean',
              description: 'Whether to include JWT token in Authorization header (default: true)',
            },
          },
          required: ['method', 'path'],
        },
      },
      {
        name: 'MonkAuthRegister',
        description: 'Register a new tenant and get JWT token. Convenience wrapper for MonkAuth action=register.',
        inputModel: {
          type: 'object',
          properties: {
            tenant: {
              type: 'string',
              description: 'Tenant name',
            },
            template: {
              type: 'string',
              description: 'Template name (defaults to "system")',
            },
            username: {
              type: 'string',
              description: 'Admin username (defaults to "root")',
            },
            description: {
              type: 'string',
              description: 'Tenant description (optional)',
            },
          },
          required: ['tenant'],
        },
      },
      {
        name: 'MonkAuthLogin',
        description: 'Login to existing tenant and get JWT token. Convenience wrapper for MonkAuth action=login.',
        inputModel: {
          type: 'object',
          properties: {
            tenant: {
              type: 'string',
              description: 'Tenant name',
            },
            username: {
              type: 'string',
              description: 'Username (defaults to "root")',
            },
            password: {
              type: 'string',
              description: 'Password',
            },
          },
          required: ['tenant', 'password'],
        },
      },
      {
        name: 'MonkAuth',
        description: 'Generic authentication tool. Use MonkAuthRegister/MonkAuthLogin for common operations. Supports refresh and status actions.',
        inputModel: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Auth action to perform',
              enum: ['register', 'login', 'refresh', 'status'],
            },
            tenant: {
              type: 'string',
              description: 'Tenant name (required for register/login)',
            },
            template: {
              type: 'string',
              description: 'Template name for new tenant (register only, defaults to "system")',
            },
            username: {
              type: 'string',
              description: 'Username (defaults to "root")',
            },
            password: {
              type: 'string',
              description: 'Password (required for login)',
            },
            description: {
              type: 'string',
              description: 'Tenant description (register only)',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'MonkApiData',
        description: 'Generic CRUD operations on data models. Requires authentication.',
        inputModel: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              description: 'HTTP method for the operation',
              enum: ['GET', 'POST', 'PUT', 'DELETE'],
            },
            model: {
              type: 'string',
              description: 'Model/table name',
            },
            record_id: {
              type: 'string',
              description: 'Record ID (required for GET/PUT/DELETE of single record)',
            },
            data: {
              type: 'object',
              description: 'Record data for POST/PUT operations',
            },
            options: {
              type: 'object',
              description: 'Query options (limit, offset for pagination)',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Max records to return',
                },
                offset: {
                  type: 'number',
                  description: 'Offset for pagination',
                },
              },
            },
          },
          required: ['method', 'model'],
        },
      },
      {
        name: 'MonkApiDescribe',
        description: 'Get model information. Returns all models or details for a specific model.',
        inputModel: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              description: 'Model name (optional - omit to list all models)',
            },
          },
        },
      },
      {
        name: 'MonkDocs',
        description: 'Get API documentation. Returns available endpoints and their documentation.',
        inputModel: {
          type: 'object',
          properties: {
            endpoint: {
              type: 'string',
              description: 'Specific endpoint to get docs for (optional)',
            },
          },
        },
      },
      {
        name: 'MonkApiFind',
        description: 'Advanced search and filtering for records across models. Execute complex queries with sophisticated filtering, sorting, and aggregation operations. Use this when basic Data API filtering is insufficient or when you need analytics-style queries without writing SQL. Supports boolean logic, nested filters, field projection (select), ordering, and pagination.',
        inputModel: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              description: 'Model/table name to search',
            },
            query: {
              type: 'object',
              description: 'Query specification',
              properties: {
                select: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Field names to return (optional - omit for all fields)',
                },
                where: {
                  type: 'object',
                  description: 'Filter conditions with complex operators (optional)',
                },
                order: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Sort order, e.g., ["created_at desc", "name asc"] (optional)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of records to return (optional)',
                },
                offset: {
                  type: 'number',
                  description: 'Number of records to skip for pagination (optional)',
                },
              },
            },
          },
          required: ['model', 'query'],
        },
      },
      {
        name: 'MonkApiAggregate',
        description: 'Perform aggregation queries with optional GROUP BY support. Use for analytics, reporting, and statistical analysis. Supports aggregation functions: $count (count records), $sum (sum values), $avg (average), $min (minimum), $max (maximum), $distinct (count unique values). Can combine multiple aggregations in a single query and group results by one or more fields.',
        inputModel: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              description: 'Model/table name to aggregate',
            },
            query: {
              type: 'object',
              description: 'Aggregation query specification',
              properties: {
                where: {
                  type: 'object',
                  description: 'Filter conditions to apply before aggregation (optional)',
                },
                aggregate: {
                  type: 'object',
                  description: 'Aggregation functions, e.g., {"total": {"$count": "*"}, "avg_amount": {"$avg": "amount"}}',
                },
                groupBy: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Fields to group by (optional)',
                },
              },
              required: ['aggregate'],
            },
          },
          required: ['model', 'query'],
        },
      },
      {
        name: 'MonkApiStat',
        description: 'Get record metadata without fetching full record data. Returns only system metadata fields: id, created_at, updated_at, trashed_at (soft delete status), etag (for HTTP caching), and size. Use cases: cache invalidation (check updated_at without fetching full record), existence checks, modification tracking for sync operations, checking if record is soft-deleted.',
        inputModel: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              description: 'Model/table name',
            },
            record_id: {
              type: 'string',
              description: 'Record ID',
            },
          },
          required: ['model', 'record_id'],
        },
      },
      {
        name: 'MonkApiHistory',
        description: 'Access audit trails for tracked field changes. When fields are marked with tracked=true, all create, update, and delete operations are captured with field-level deltas, user attribution, and timestamps. Provides field-level tracking with old/new values for each changed field. Returns history entries ordered by change_id descending (newest first). Optionally retrieve a specific history entry by change_id.',
        inputModel: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              description: 'Model/table name',
            },
            record_id: {
              type: 'string',
              description: 'Record ID',
            },
            change_id: {
              type: 'string',
              description: 'Specific change ID to retrieve (optional - omit to list all changes)',
            },
            options: {
              type: 'object',
              description: 'Pagination options (only used when change_id is omitted)',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Max number of history entries to return',
                },
                offset: {
                  type: 'number',
                  description: 'Number of entries to skip',
                },
              },
            },
          },
          required: ['model', 'record_id'],
        },
      },
    ],
];
*/

// Handle tool calls
server.setRequestHandler(CallToolRequestModel, async request => {
    const { name, arguments: args } = request.params;

    try {
        let result: any;

        switch (name) {
            case 'MonkAuth':
                result = await monkAuth(args.action, args);
                break;

            case 'MonkHttp':
                result = await monkHttp(args.method, args.path, args.query, args.body, args.requireAuth ?? true, args.headers);
                break;

            case 'MonkData':
                result = await monkData(args.operation, args.model, args.params);
                break;

            case 'MonkDescribe':
                result = await monkDescribe(args.operation, args.model, args.params);
                break;

            default:
                throw new Error(`Unknown tool: ${name}`);
        }

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
