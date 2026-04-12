import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import * as Memory from '@src/lib/tty/memory.js';
import * as Transaction from '@src/lib/transaction.js';
import { executeAgentPromptStream } from '@src/lib/tty/headless.js';
import type { SystemInit } from '@src/lib/system.js';

type Deferred = {
    promise: Promise<void>;
    resolve: () => void;
};

function createDeferred(): Deferred {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
        resolve = () => res();
    });

    return { promise, resolve };
}

function delay(ms: number): Promise<'timeout'> {
    return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
}

function buildSystemInit(overrides: Partial<SystemInit> = {}): SystemInit {
    return {
        dbType: 'postgresql',
        dbName: 'db',
        nsName: 'public',
        userId: 'user-id',
        access: 'root',
        tenant: 'tenant',
        username: 'alice',
        ...overrides,
    };
}

describe('executeAgentPromptStream', () => {
    let runTransactionSpy: ReturnType<typeof spyOn> | null = null;
    let loadSTMSpy: ReturnType<typeof spyOn> | null = null;

    afterEach(() => {
        runTransactionSpy?.mockRestore();
        loadSTMSpy?.mockRestore();
        runTransactionSpy = null;
        loadSTMSpy = null;
    });

    it('yields streaming events as they occur', async () => {
        const firstEventGate = createDeferred();
        const secondEventGate = createDeferred();

        runTransactionSpy = spyOn(Transaction, 'runTransaction').mockImplementation(
            async (_systemInit, callback) => {
                const fakeSystem = {
                    fs: {
                        mount: () => {},
                    },
                    ai: {
                        agent: async function* () {
                            await firstEventGate.promise;
                            yield {
                                type: 'text',
                                content: 'first',
                            };

                            await secondEventGate.promise;
                            yield {
                                type: 'tool_call',
                                id: 'tool-1',
                                name: 'run_command',
                                input: { command: 'echo hello' },
                            };
                            yield {
                                type: 'tool_result',
                                id: 'tool-1',
                                name: 'run_command',
                                output: 'ok',
                                exitCode: 0,
                            };
                            yield {
                                type: 'done',
                                success: true,
                            };
                        },
                    },
                };

                return callback(fakeSystem as never);
            }
        );

        loadSTMSpy = spyOn(Memory, 'loadSTMFull').mockResolvedValue({
            entries: {},
            alarms: [],
        });

        const stream = executeAgentPromptStream(buildSystemInit(), 'hello world');
        const first = stream.next();
        const second = stream.next();

        firstEventGate.resolve();
        const firstEventState = await Promise.race([first.then(() => 'resolved'), delay(25)]);
        expect(firstEventState).toBe('resolved');

        const secondEventState = await Promise.race([second.then(() => 'resolved'), delay(25)]);
        expect(secondEventState).toBe('timeout');

        const firstEvent = await first;
        expect(firstEvent.value).toMatchObject({ type: 'text', content: 'first' });

        const secondEventStateAfterResolve = await Promise.race([second.then(() => 'resolved'), delay(25)]);
        expect(secondEventStateAfterResolve).toBe('timeout');

        secondEventGate.resolve();
        const secondEvent = await second;
        expect(secondEvent.value).toMatchObject({
            type: 'tool_call',
            name: 'run_command',
        });

        const toolResult = await stream.next();
        expect(toolResult.value).toMatchObject({
            type: 'tool_result',
            name: 'run_command',
            output: 'ok',
            exitCode: 0,
        });

        const done = await stream.next();
        expect(done.value).toMatchObject({ type: 'done', success: true });
    });
});
