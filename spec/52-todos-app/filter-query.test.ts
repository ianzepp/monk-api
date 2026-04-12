import { describe, expect, it } from 'bun:test';
import { createApp } from '../../packages/todos/src/index.ts';

function makeTodoAppWithRecorder() {
    const calls: { url: string | null } = { url: null };

    const app = createApp({
        client: null,
        token: 'test-token',
        appName: 'todos',
        tenantName: 'tenant',
        honoApp: {
            fetch: async (req: Request) => {
                calls.url = req.url;
                return new Response(
                    JSON.stringify({
                        success: true,
                        data: [],
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    }
                );
            },
        } as any,
    });

    return { app, calls };
}

describe('Todos list filter query syntax', () => {
    it('uses supported null filter syntax for top-level list queries', async () => {
        const { app, calls } = makeTodoAppWithRecorder();
        await app.fetch(new Request('http://localhost/'));

        expect(calls.url).toBeTruthy();
        const params = new URL(calls.url!).searchParams;

        expect(params.has('where[parent_id][is]')).toBeFalse();
        expect(params.get('where[parent_id][null]')).toBe('true');
    });

    it('omits top-level parent filter when includeChildren=true', async () => {
        const { app, calls } = makeTodoAppWithRecorder();
        await app.fetch(new Request('http://localhost/?includeChildren=true'));

        expect(calls.url).toBeTruthy();
        const params = new URL(calls.url!).searchParams;

        expect(params.has('where[parent_id][null]')).toBeFalse();
    });
});
