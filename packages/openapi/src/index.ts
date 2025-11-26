/**
 * @monk-app/openapi - OpenAPI Specification Generator
 *
 * A tenant-scoped app that dynamically generates an OpenAPI 3.0 specification
 * based on the models and fields defined in the tenant's database.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';

/**
 * App context provided by the loader
 */
export interface AppContext {
    client: any;
    token: string;
    appName: string;
    tenantName: string;
    honoApp: any;
}

interface Model {
    id: string;
    model_name: string;
    description?: string;
}

interface Field {
    id: string;
    model_id: string;
    field_name: string;
    type: string;
    required?: boolean;
    description?: string;
}

interface OpenAPISpec {
    openapi: string;
    info: {
        title: string;
        version: string;
        description?: string;
    };
    paths: Record<string, any>;
    components: {
        schemas: Record<string, any>;
        securitySchemes: Record<string, any>;
    };
    security: Array<Record<string, any[]>>;
}

/**
 * Map Monk field types to OpenAPI types
 */
function mapFieldType(type: string): { type: string; format?: string } {
    switch (type) {
        case 'text':
            return { type: 'string' };
        case 'integer':
            return { type: 'integer' };
        case 'decimal':
            return { type: 'number', format: 'double' };
        case 'boolean':
            return { type: 'boolean' };
        case 'timestamp':
            return { type: 'string', format: 'date-time' };
        case 'date':
            return { type: 'string', format: 'date' };
        case 'uuid':
            return { type: 'string', format: 'uuid' };
        case 'json':
            return { type: 'object' };
        default:
            return { type: 'string' };
    }
}

/**
 * Simple in-process client that forwards requests to the main app.
 */
function createClient(c: Context, honoApp: any) {
    const authHeader = c.req.header('Authorization');

    async function request<T>(method: string, path: string, options: { query?: Record<string, string>; body?: any } = {}): Promise<{ success: boolean; data?: T; error?: string }> {
        let url = `http://internal${path}`;
        if (options.query && Object.keys(options.query).length > 0) {
            const params = new URLSearchParams(options.query);
            url += `?${params.toString()}`;
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (authHeader) {
            headers['Authorization'] = authHeader;
        }

        const init: RequestInit = { method, headers };
        if (options.body !== undefined && !['GET', 'HEAD'].includes(method)) {
            init.body = JSON.stringify(options.body);
        }

        const req = new Request(url, init);
        const res = await honoApp.fetch(req);
        return res.json();
    }

    return {
        get: <T>(path: string, query?: Record<string, string>) => request<T>('GET', path, { query }),
    };
}

/**
 * Generate schema for a model based on its fields
 */
function generateSchema(model: Model, fields: Field[]): Record<string, any> {
    const properties: Record<string, any> = {
        id: { type: 'string', format: 'uuid', readOnly: true },
        created_at: { type: 'string', format: 'date-time', readOnly: true },
        updated_at: { type: 'string', format: 'date-time', readOnly: true },
    };
    const required: string[] = [];

    for (const field of fields) {
        const typeInfo = mapFieldType(field.type);
        properties[field.field_name] = {
            ...typeInfo,
            ...(field.description ? { description: field.description } : {}),
        };
        if (field.required) {
            required.push(field.field_name);
        }
    }

    return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
    };
}

/**
 * Generate paths for a model
 */
function generatePaths(model: Model): Record<string, any> {
    const basePath = `/api/data/${model.model_name}`;
    const itemPath = `${basePath}/{id}`;
    const describePath = `/api/describe/${model.model_name}`;
    const findPath = `/api/find/${model.model_name}`;
    const tag = model.model_name;
    const schemaRef = `#/components/schemas/${model.model_name}`;

    return {
        [describePath]: {
            get: {
                tags: [tag],
                summary: `Describe ${model.model_name}`,
                description: `Get schema and field definitions for ${model.model_name}`,
                responses: {
                    '200': {
                        description: 'Schema description',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: { type: 'boolean' },
                                        data: {
                                            type: 'object',
                                            properties: {
                                                model: {
                                                    type: 'object',
                                                    properties: {
                                                        id: { type: 'string', format: 'uuid' },
                                                        model_name: { type: 'string' },
                                                        description: { type: 'string' },
                                                    },
                                                },
                                                fields: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        properties: {
                                                            id: { type: 'string', format: 'uuid' },
                                                            field_name: { type: 'string' },
                                                            type: { type: 'string' },
                                                            required: { type: 'boolean' },
                                                            description: { type: 'string' },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    '404': {
                        description: 'Model not found',
                    },
                },
            },
        },
        [findPath]: {
            post: {
                tags: [tag],
                summary: `Find ${model.model_name}`,
                description: `Query ${model.model_name} records with filters, sorting, and pagination`,
                requestBody: {
                    required: false,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    where: {
                                        type: 'object',
                                        description: 'Filter conditions',
                                    },
                                    order: {
                                        type: 'array',
                                        description: 'Sort order',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                field: { type: 'string' },
                                                direction: { type: 'string', enum: ['asc', 'desc'] },
                                            },
                                        },
                                    },
                                    limit: {
                                        type: 'integer',
                                        description: 'Maximum number of records to return',
                                    },
                                    offset: {
                                        type: 'integer',
                                        description: 'Number of records to skip',
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Query results',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: { type: 'boolean' },
                                        data: {
                                            type: 'array',
                                            items: { $ref: schemaRef },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        [basePath]: {
            get: {
                tags: [tag],
                summary: `List ${model.model_name}`,
                description: model.description || `Retrieve a list of ${model.model_name} records`,
                responses: {
                    '200': {
                        description: 'Successful response',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: { type: 'boolean' },
                                        data: {
                                            type: 'array',
                                            items: { $ref: schemaRef },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                tags: [tag],
                summary: `Create ${model.model_name}`,
                description: `Create a new ${model.model_name} record`,
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: schemaRef },
                        },
                    },
                },
                responses: {
                    '201': {
                        description: 'Created successfully',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: { type: 'boolean' },
                                        data: { $ref: schemaRef },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        [itemPath]: {
            get: {
                tags: [tag],
                summary: `Get ${model.model_name}`,
                description: `Retrieve a single ${model.model_name} record by ID`,
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Successful response',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: { type: 'boolean' },
                                        data: { $ref: schemaRef },
                                    },
                                },
                            },
                        },
                    },
                    '404': {
                        description: 'Not found',
                    },
                },
            },
            put: {
                tags: [tag],
                summary: `Update ${model.model_name}`,
                description: `Update an existing ${model.model_name} record`,
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: schemaRef },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Updated successfully',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: { type: 'boolean' },
                                        data: { $ref: schemaRef },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            delete: {
                tags: [tag],
                summary: `Delete ${model.model_name}`,
                description: `Delete a ${model.model_name} record`,
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Deleted successfully',
                    },
                    '404': {
                        description: 'Not found',
                    },
                },
            },
        },
    };
}

/**
 * Create the OpenAPI Hono app.
 */
export function createApp(context: AppContext): Hono {
    const app = new Hono();
    const { honoApp, tenantName } = context;

    // GET /openapi.json - Generate OpenAPI specification
    app.get('/openapi.json', async (c) => {
        const client = createClient(c, honoApp);

        // Fetch all models
        const modelsResult = await client.get<Model[]>('/api/data/models');
        if (!modelsResult.success || !modelsResult.data) {
            return c.json({ success: false, error: 'Failed to fetch models' }, 500);
        }

        // Fetch all fields
        const fieldsResult = await client.get<Field[]>('/api/data/fields');
        if (!fieldsResult.success || !fieldsResult.data) {
            return c.json({ success: false, error: 'Failed to fetch fields' }, 500);
        }

        const models = modelsResult.data;
        const fields = fieldsResult.data;

        // Group fields by model_id
        const fieldsByModel = new Map<string, Field[]>();
        for (const field of fields) {
            const modelFields = fieldsByModel.get(field.model_id) || [];
            modelFields.push(field);
            fieldsByModel.set(field.model_id, modelFields);
        }

        // Build OpenAPI spec
        const spec: OpenAPISpec = {
            openapi: '3.0.3',
            info: {
                title: `${tenantName} API`,
                version: '1.0.0',
                description: `Auto-generated OpenAPI specification for ${tenantName}`,
            },
            paths: {},
            components: {
                schemas: {},
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                    },
                },
            },
            security: [{ bearerAuth: [] }],
        };

        // Generate schemas and paths for each model
        for (const model of models) {
            const modelFields = fieldsByModel.get(model.id) || [];
            spec.components.schemas[model.model_name] = generateSchema(model, modelFields);
            const paths = generatePaths(model);
            Object.assign(spec.paths, paths);
        }

        return c.json(spec);
    });

    return app;
}
