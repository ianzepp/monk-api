#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
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

// ============================================
// LOAD TOOL DEFINITIONS
// ============================================
function loadToolDefinitions(): any[] {
  const toolsDir = join(__dirname, 'tools');
  const toolFiles = readdirSync(toolsDir).filter((file) => file.endsWith('.json'));

  return toolFiles.map((file) => {
    const toolPath = join(toolsDir, file);
    const toolContent = readFileSync(toolPath, 'utf-8');
    return JSON.parse(toolContent);
  });
}

// ============================================
// CORE HELPER: Low-level HTTP requests
// ============================================
async function monkHttp(
  method: string,
  path: string,
  body?: any,
  requireAuth: boolean = true
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (requireAuth && currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  const url = `${API_BASE_URL}${path}`;

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`API Error (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

// ============================================
// SEMANTIC WRAPPERS: Higher-level operations
// ============================================
async function monkAuth(action: string, params: any): Promise<any> {
  let endpoint: string;
  let body: any;

  switch (action) {
    case 'register':
      endpoint = '/auth/register';
      body = {
        tenant: params.tenant,
        template: params.template,
        username: params.username,
        description: params.description,
      };
      break;

    case 'login':
      endpoint = '/auth/login';
      body = {
        tenant: params.tenant,
        username: params.username || 'root',
        password: params.password,
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
        has_token: !!currentToken,
      };

    default:
      throw new Error(`Unknown auth action: ${action}`);
  }

  const response = await monkHttp('POST', endpoint, body, false);

  // Cache token for subsequent requests
  if (response.data?.token) {
    currentToken = response.data.token;
    currentTenant = response.data.tenant || params.tenant;
    return {
      ...response,
      message: 'Authentication token cached for subsequent requests',
    };
  }

  return response;
}

async function monkApiData(
  method: string,
  schema: string,
  recordId?: string,
  data?: any,
  options?: any
): Promise<any> {
  if (!currentToken) {
    throw new Error('Not authenticated. Use MonkAuth with action "register" or "login" first.');
  }

  let path = `/api/data/${schema}`;

  if (recordId) {
    path += `/${recordId}`;
  }

  // Handle query parameters for GET requests
  if (method === 'GET' && options) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    if (params.toString()) {
      path += `?${params.toString()}`;
    }
  }

  return monkHttp(method, path, data);
}

async function monkApiDescribe(schema?: string): Promise<any> {
  if (!currentToken) {
    throw new Error('Not authenticated. Use MonkAuth first.');
  }

  const path = schema ? `/api/schema/${schema}` : '/api/schema';
  return monkHttp('GET', path);
}

async function monkDocs(endpoint?: string): Promise<any> {
  const path = endpoint ? `/docs${endpoint}` : '/docs';

  // Docs endpoint returns markdown text, not JSON
  const headers: Record<string, string> = {};
  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  // Get text content (not JSON)
  const content = await response.text();

  if (!response.ok) {
    throw new Error(`API Error (${response.status}): ${content}`);
  }

  // Return as structured object for MCP
  return {
    endpoint: path,
    content_type: response.headers.get('content-type'),
    documentation: content,
  };
}

async function monkApiFind(
  schema: string,
  query: {
    select?: string[];
    where?: any;
    order?: string[];
    limit?: number;
    offset?: number;
  }
): Promise<any> {
  if (!currentToken) {
    throw new Error('Not authenticated. Use MonkAuth first.');
  }

  return monkHttp('POST', `/api/find/${schema}`, query);
}

async function monkApiAggregate(
  schema: string,
  query: {
    where?: any;
    aggregate: Record<string, any>;
    groupBy?: string[];
  }
): Promise<any> {
  if (!currentToken) {
    throw new Error('Not authenticated. Use MonkAuth first.');
  }

  return monkHttp('POST', `/api/aggregate/${schema}`, query);
}

async function monkApiStat(schema: string, recordId: string): Promise<any> {
  if (!currentToken) {
    throw new Error('Not authenticated. Use MonkAuth first.');
  }

  return monkHttp('GET', `/api/stat/${schema}/${recordId}`);
}

async function monkApiHistory(
  schema: string,
  recordId: string,
  changeId?: string,
  options?: { limit?: number; offset?: number }
): Promise<any> {
  if (!currentToken) {
    throw new Error('Not authenticated. Use MonkAuth first.');
  }

  let path = `/api/history/${schema}/${recordId}`;

  if (changeId) {
    path += `/${changeId}`;
  } else if (options) {
    // Add query parameters for pagination
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    if (params.toString()) {
      path += `?${params.toString()}`;
    }
  }

  return monkHttp('GET', path);
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
server.setRequestHandler(ListToolsRequestSchema, async () => {
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
        inputSchema: {
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
        inputSchema: {
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
        inputSchema: {
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
        inputSchema: {
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
        description: 'Generic CRUD operations on data schemas. Requires authentication.',
        inputSchema: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              description: 'HTTP method for the operation',
              enum: ['GET', 'POST', 'PUT', 'DELETE'],
            },
            schema: {
              type: 'string',
              description: 'Schema/table name',
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
          required: ['method', 'schema'],
        },
      },
      {
        name: 'MonkApiDescribe',
        description: 'Get schema information. Returns all schemas or details for a specific schema.',
        inputSchema: {
          type: 'object',
          properties: {
            schema: {
              type: 'string',
              description: 'Schema name (optional - omit to list all schemas)',
            },
          },
        },
      },
      {
        name: 'MonkDocs',
        description: 'Get API documentation. Returns available endpoints and their documentation.',
        inputSchema: {
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
        description: 'Advanced search and filtering for records across schemas. Execute complex queries with sophisticated filtering, sorting, and aggregation operations. Use this when basic Data API filtering is insufficient or when you need analytics-style queries without writing SQL. Supports boolean logic, nested filters, column projection (select), ordering, and pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            schema: {
              type: 'string',
              description: 'Schema/table name to search',
            },
            query: {
              type: 'object',
              description: 'Query specification',
              properties: {
                select: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Column names to return (optional - omit for all columns)',
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
          required: ['schema', 'query'],
        },
      },
      {
        name: 'MonkApiAggregate',
        description: 'Perform aggregation queries with optional GROUP BY support. Use for analytics, reporting, and statistical analysis. Supports aggregation functions: $count (count records), $sum (sum values), $avg (average), $min (minimum), $max (maximum), $distinct (count unique values). Can combine multiple aggregations in a single query and group results by one or more columns.',
        inputSchema: {
          type: 'object',
          properties: {
            schema: {
              type: 'string',
              description: 'Schema/table name to aggregate',
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
                  description: 'Columns to group by (optional)',
                },
              },
              required: ['aggregate'],
            },
          },
          required: ['schema', 'query'],
        },
      },
      {
        name: 'MonkApiStat',
        description: 'Get record metadata without fetching full record data. Returns only system metadata fields: id, created_at, updated_at, trashed_at (soft delete status), etag (for HTTP caching), and size. Use cases: cache invalidation (check updated_at without fetching full record), existence checks, modification tracking for sync operations, checking if record is soft-deleted.',
        inputSchema: {
          type: 'object',
          properties: {
            schema: {
              type: 'string',
              description: 'Schema/table name',
            },
            record_id: {
              type: 'string',
              description: 'Record ID',
            },
          },
          required: ['schema', 'record_id'],
        },
      },
      {
        name: 'MonkApiHistory',
        description: 'Access audit trails for tracked column changes. When columns are marked with tracked=true, all create, update, and delete operations are captured with field-level deltas, user attribution, and timestamps. Provides column-level tracking with old/new values for each changed field. Returns history entries ordered by change_id descending (newest first). Optionally retrieve a specific history entry by change_id.',
        inputSchema: {
          type: 'object',
          properties: {
            schema: {
              type: 'string',
              description: 'Schema/table name',
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
          required: ['schema', 'record_id'],
        },
      },
    ],
];
*/

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: any;

    switch (name) {
      case 'MonkHttp':
        result = await monkHttp(
          args.method,
          args.path,
          args.body,
          args.requireAuth ?? true
        );
        break;

      case 'MonkAuthRegister':
        result = await monkAuth('register', args);
        break;

      case 'MonkAuthLogin':
        result = await monkAuth('login', args);
        break;

      case 'MonkAuth':
        result = await monkAuth(args.action, args);
        break;

      case 'MonkApiData':
        result = await monkApiData(
          args.method,
          args.schema,
          args.record_id,
          args.data,
          args.options
        );
        break;

      case 'MonkApiDescribe':
        result = await monkApiDescribe(args.schema);
        break;

      case 'MonkDocs':
        result = await monkDocs(args.endpoint);
        break;

      case 'MonkApiFind':
        result = await monkApiFind(args.schema, args.query);
        break;

      case 'MonkApiAggregate':
        result = await monkApiAggregate(args.schema, args.query);
        break;

      case 'MonkApiStat':
        result = await monkApiStat(args.schema, args.record_id);
        break;

      case 'MonkApiHistory':
        result = await monkApiHistory(
          args.schema,
          args.record_id,
          args.change_id,
          args.options
        );
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
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

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
