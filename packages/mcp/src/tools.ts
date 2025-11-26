/**
 * MCP Tool Definitions
 */

import type { McpTool } from './types.js';

export const TOOLS: McpTool[] = [
    {
        name: 'MonkAuth',
        description: 'Authentication for Monk API. Actions: register (create new tenant), login (authenticate), refresh (renew token), status (check auth state).',
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
            },
            required: ['action']
        }
    },
    {
        name: 'MonkHttp',
        description: 'HTTP requests to Monk API. Automatically injects JWT token (if authenticated). **Start here: GET /docs (no auth required) returns full API documentation.** Key endpoints: /auth/* (login/register), /api/data/:model (CRUD), /api/find/:model (queries), /api/describe/:model (schema), /api/aggregate/:model (analytics).',
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
