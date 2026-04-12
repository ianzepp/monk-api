import { describe, expect, it } from 'bun:test';
import { PassThrough } from 'node:stream';
import { createSession } from '@src/lib/tty/types.js';
import { finalizeSession } from '@src/lib/tty/session-handler.js';
import type { TTYStream } from '@src/lib/tty/types.js';

function createMockTTYStream(): { stream: TTYStream; ended: () => boolean } {
    const input = new PassThrough();

    return {
        stream: {
            isTTY: true,
            columns: 80,
            rows: 24,
            input,
            isOpen: true,
            write: () => undefined,
            end: () => {
                input.end();
            },
            onResize: () => undefined,
            offResize: () => undefined,
        },
        ended: () => input.writableEnded,
    };
}

describe('session-handler finalizeSession', () => {
    it('runs finalization steps once per session and clears cleanup handlers', async () => {
        const session = createSession('session-finalizer-1');
        const { stream, ended } = createMockTTYStream();

        let cleanupCalls = 0;
        session.cleanupHandlers.push(() => {
            cleanupCalls += 1;
        });
        session.foregroundAbort = new AbortController();
        session.history = ['command'];

        await finalizeSession(session, stream);
        await finalizeSession(session, stream);

        expect(cleanupCalls).toBe(1);
        expect(session.cleanupHandlers).toHaveLength(0);
        expect(session.foregroundAbort).toBeNull();
        expect(ended()).toBe(true);
    });
});
