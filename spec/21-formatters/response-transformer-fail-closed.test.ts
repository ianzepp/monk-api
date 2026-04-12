import { describe, it, expect } from 'bun:test';
import { responseTransformerMiddleware } from '@src/lib/middleware/response-transformer.js';

interface MockContext {
    req: {
        method: string;
        path: string;
        query: (name: string) => string | undefined;
        header: (name: string) => string | undefined;
    };
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
    json: (data: any, init?: any) => Response;
}

interface MockContextParams {
    responseFormat: string;
    path: string;
    query?: Record<string, string | undefined>;
    method?: string;
    headers?: Record<string, string>;
    jwtPayload?: unknown;
}

function buildMockContext(params: MockContextParams): MockContext {
    const {
        responseFormat,
        path,
        query = {},
        method = 'GET',
        headers = {},
        jwtPayload,
    } = params;

    const store = new Map<string, unknown>([['responseFormat', responseFormat]]);
    if (jwtPayload) {
        store.set('jwtPayload', jwtPayload);
    }

    const normalizedHeaders = Object.entries(headers).reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value;
        acc[key.toLowerCase()] = value;
        return acc;
    }, {});

    const context = {
        json: (data: any, init?: any) => {
            const status = typeof init === 'number' ? init : init?.status || 200;
            return new Response(JSON.stringify(data), {
                status,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            });
        },
        req: {
            method,
            path,
            query(name: string) {
                return query[name];
            },
            header(name: string) {
                return normalizedHeaders[name] || normalizedHeaders[name.toLowerCase()];
            },
        },
        get(key: string) {
            return store.get(key);
        },
        set(key: string, value: unknown) {
            store.set(key, value);
        },
    } as MockContext;

    return context;
}

describe('response-transformer fail-closed behavior', () => {
    it('returns non-2xx for unavailable formatter', async () => {
        const context = buildMockContext({
            responseFormat: 'formatter-does-not-exist',
            path: '/api/user/me',
            query: {},
        });

        await responseTransformerMiddleware(context as any, async () => {});

        const response = await context.json({ success: true, data: { token: 'abc' } });
        const body = await response.json() as any;

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        expect(body.error_code).toBe('FORMAT_UNAVAILABLE');
    });

    it('returns non-2xx when encryption is requested without auth', async () => {
        const context = buildMockContext({
            responseFormat: 'json',
            path: '/api/user/me',
            query: { encrypt: 'pgp' },
        });

        await responseTransformerMiddleware(context as any, async () => {});

        const response = await context.json({ success: true, data: { token: 'abc' } });
        const body = await response.json() as any;

        expect(response.status).toBe(401);
        expect(body.success).toBe(false);
        expect(body.error_code).toBe('ENCRYPTION_MISSING_AUTH');
    });

    it('returns non-2xx for binary format + encryption', async () => {
        const context = buildMockContext({
            responseFormat: 'msgpack',
            path: '/api/user/me',
            query: { encrypt: 'pgp' },
            headers: {
                Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.this.will.fail',
            },
            jwtPayload: {
                sub: 'user',
                exp: 1,
                iat: 1,
                iss: 'monk',
                aud: 'monk',
                nbf: 0,
                jti: 'jti',
                jwt: 'eyJhbGciOiJIUzI1NiJ9.this.will.fail'
            },
        });

        await responseTransformerMiddleware(context as any, async () => {});

        const response = await context.json({ success: true, data: { token: 'abc' } });
        const body = await response.json() as any;

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        expect(body.error_code).toBe('ENCRYPTION_UNSUPPORTED_FORMAT');
    });
});
