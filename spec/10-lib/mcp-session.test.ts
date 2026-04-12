import { describe, it, beforeAll, afterAll, expect } from 'bun:test';
import { Hono } from 'hono';
import { getOrCreateSession } from '@src/lib/mcp/session.js';
import { startMcpServer } from '@src/servers/mcp.js';
import { getOrCreateHeadlessSession } from '@src/lib/tty/headless.js';
import type { SystemInit } from '@src/lib/system.js';

type McpResponse = {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: Record<string, unknown>;
    error?: { code: number; message: string; data?: unknown };
};

function buildSystemInit(overrides: Partial<SystemInit>): SystemInit {
    return {
        dbType: 'postgresql',
        dbName: 'db',
        nsName: 'public',
        userId: 'user-id',
        access: 'root',
        tenant: 'tenant',
        username: 'user',
        ...overrides,
    };
}

async function startMcpServerOnFreePort(startPort = 36101): Promise<{ port: number; stop: () => void }> {
    const app = new Hono();

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
        const port = startPort + attempt;
        try {
            const server = startMcpServer(app, { port, host: '127.0.0.1' });
            return { port, stop: server.stop };
        } catch (error) {
            lastError = error as Error;
        }
    }

    throw lastError ?? new Error('Failed to start MCP test server');
}

async function sendMcpRequest(
    port: number,
    body: Record<string, unknown>,
    sessionId?: string
): Promise<{ status: number; data: McpResponse; headers: Headers }> {
    const response = await fetch(`http://127.0.0.1:${port}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
        },
        body: JSON.stringify(body),
    });

    const data = (await response.json()) as McpResponse;
    return { status: response.status, data, headers: response.headers };
}

function getToolCallPayload(response: McpResponse): Record<string, unknown> | null {
    const content = response.result?.content;
    if (!Array.isArray(content) || content.length === 0) {
        return null;
    }

    const first = content[0];
    if (typeof first !== 'object' || first === null || typeof first.text !== 'string') {
        return null;
    }

    try {
        return JSON.parse(first.text) as Record<string, unknown>;
    } catch {
        return null;
    }
}

describe('MCP session isolation', () => {
    let stopServer: (() => void) | null = null;
    let port = 0;

    beforeAll(async () => {
        const server = await startMcpServerOnFreePort();
        stopServer = server.stop;
        port = server.port;
    });

    afterAll(() => {
        stopServer?.();
    });

    it('generates a dedicated session id when missing from initialize requests', async () => {
        const first = await sendMcpRequest(port, {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2024-11-05' },
        });
        const second = await sendMcpRequest(port, {
            jsonrpc: '2.0',
            id: 2,
            method: 'initialize',
            params: { protocolVersion: '2024-11-05' },
        });

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);

        const firstSession = first.headers.get('mcp-session-id');
        const secondSession = second.headers.get('mcp-session-id');
        expect(firstSession).toBeTruthy();
        expect(secondSession).toBeTruthy();
        expect(firstSession).not.toBe('default');
        expect(secondSession).not.toBe('default');
        expect(firstSession).not.toBe(secondSession);
        expect(first.data.result?.protocolVersion).toBe('2024-11-05');
    });

    it('requires explicit session id for non-initialize calls', async () => {
        const response = await sendMcpRequest(port, {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/list',
        });

        expect(response.status).toBe(400);
        expect(response.data.error?.code).toBe(-32600);
        expect(response.data.error?.message).toContain('mcp-session-id');
    });

    it('isolates cached auth state by explicit session id', async () => {
        const sessionA = getOrCreateSession('mcp-session-a');
        sessionA.token = 'a-token';
        sessionA.tenant = 'tenant-a';

        const sessionB = getOrCreateSession('mcp-session-b');
        sessionB.token = null;
        sessionB.tenant = null;

        const statusA = await sendMcpRequest(
            port,
            {
                jsonrpc: '2.0',
                id: 4,
                method: 'tools/call',
                params: {
                    name: 'MonkAuth',
                    arguments: { action: 'status' },
                },
            },
            'mcp-session-a'
        );
        const statusB = await sendMcpRequest(
            port,
            {
                jsonrpc: '2.0',
                id: 5,
                method: 'tools/call',
                params: {
                    name: 'MonkAuth',
                    arguments: { action: 'status' },
                },
            },
            'mcp-session-b'
        );

        const statusAResult = getToolCallPayload(statusA.data);
        const statusBResult = getToolCallPayload(statusB.data);

        expect(statusAResult).toMatchObject({ authenticated: true, tenant: 'tenant-a' });
        expect(statusBResult).toMatchObject({ authenticated: false, tenant: null });
    });
});

describe('Headless MCP session cache keying', () => {
    it('isolates cached AI sessions by authenticated identity', () => {
        const baseSessionId = 'shared-mcp-session';

        const alice = getOrCreateHeadlessSession(
            buildSystemInit({
                tenant: 'tenant-a',
                userId: 'alice-id',
                username: 'alice',
            }),
            baseSessionId
        );

        const bob = getOrCreateHeadlessSession(
            buildSystemInit({
                tenant: 'tenant-a',
                userId: 'bob-id',
                username: 'bob',
            }),
            baseSessionId
        );

        const aliceSecond = getOrCreateHeadlessSession(
            buildSystemInit({
                tenant: 'tenant-a',
                userId: 'alice-id',
                username: 'alice',
            }),
            baseSessionId
        );

        expect(alice).not.toBe(bob);
        expect(aliceSecond).toBe(alice);
        expect(alice.username).toBe('alice');
        expect(bob.username).toBe('bob');
    });
});
