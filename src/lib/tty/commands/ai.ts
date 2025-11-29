/**
 * @ (ai) - Send a prompt to the LLM
 *
 * Usage:
 *   @ <prompt>                    Ask a question (one-shot)
 *   @                             Enter conversation mode
 *   <input> | @ <prompt>          Ask about piped data
 *   <input> | @                   Analyze piped data (default prompt)
 *
 * Examples:
 *   @ what time is it in Tokyo?
 *   cat /api/data/users | @ summarize this data
 *   select * from users | @ find users with admin role
 *   @ list 10 common unix commands | head -5
 *   @                              (enters conversation mode)
 *
 * Conversation Mode:
 *   In conversation mode, the AI can execute commands on your behalf.
 *   Type 'exit' or press Ctrl+D to return to the shell.
 *
 * Environment:
 *   ANTHROPIC_API_KEY    Required. Your Anthropic API key.
 *
 * The LLM receives context about your current session including
 * working directory and any piped input data.
 */

import type { CommandHandler } from './shared.js';
import type { Session, CommandIO } from '../types.js';
import type { FS } from '@src/lib/fs/index.js';
import { executeLine } from '../executor.js';
import { PassThrough } from 'node:stream';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

// Tool definition for command execution
const TOOLS = [
    {
        name: 'run_command',
        description: 'Execute a shell command in monksh and return the output. Use this to explore the filesystem, query data, run utilities, etc.',
        input_schema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The shell command to execute (e.g., "ls -la", "cat /api/data/users", "select * from users")',
                },
            },
            required: ['command'],
        },
    },
];

type Message = {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
};

type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_result'; tool_use_id: string; content: string };

export const ai: CommandHandler = async (session, fs, args, io) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
        io.stderr.write('ai: ANTHROPIC_API_KEY environment variable not set\n');
        return 1;
    }

    // Check if we have piped input (non-interactive)
    const hasStdinData = await hasData(io.stdin, 50);

    // Build prompt from args
    const prompt = args.join(' ').trim();

    // Read stdin if there's data
    let stdinContent = '';
    if (hasStdinData) {
        const chunks: string[] = [];
        for await (const chunk of io.stdin) {
            if (io.signal?.aborted) return 130;
            chunks.push(chunk.toString());
        }
        stdinContent = chunks.join('');
    }

    // Conversation mode: no args and no piped input
    if (!prompt && !stdinContent) {
        return conversationMode(session, fs, apiKey, io);
    }

    // One-shot mode
    return oneShotMode(session, apiKey, prompt, stdinContent, io);
};

/**
 * Check if a stream has data available (with timeout)
 */
async function hasData(stream: PassThrough, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        // Check if stream already has buffered data
        if (stream.readableLength > 0) {
            resolve(true);
            return;
        }

        // Check if stream is already ended
        if (stream.readableEnded) {
            resolve(false);
            return;
        }

        const timeout = setTimeout(() => {
            stream.removeListener('data', onData);
            stream.removeListener('end', onEnd);
            resolve(false);
        }, timeoutMs);

        const onData = () => {
            clearTimeout(timeout);
            stream.removeListener('end', onEnd);
            // Unshift the data back - we just peeked
            resolve(true);
        };

        const onEnd = () => {
            clearTimeout(timeout);
            stream.removeListener('data', onData);
            resolve(false);
        };

        stream.once('readable', onData);
        stream.once('end', onEnd);
    });
}

/**
 * One-shot mode: answer a single question
 */
async function oneShotMode(
    session: Session,
    apiKey: string,
    prompt: string,
    stdinContent: string,
    io: CommandIO
): Promise<number> {
    // Build user message
    let userMessage = '';

    if (stdinContent) {
        userMessage += `<input>\n${stdinContent}</input>\n\n`;
    }

    if (prompt) {
        userMessage += prompt;
    } else {
        userMessage += 'Analyze this data.';
    }

    // Build system prompt with session context
    const systemPrompt = buildSystemPrompt(session, false);

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 4096,
                stream: true,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: userMessage,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            io.stderr.write(`ai: API error: ${response.status} ${error}\n`);
            return 1;
        }

        if (!response.body) {
            io.stderr.write('ai: no response body\n');
            return 1;
        }

        await streamResponse(response.body, io);
        io.stdout.write('\n');
        return 0;
    } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        io.stderr.write(`ai: ${message}\n`);
        return 1;
    }
}

/**
 * Conversation mode: interactive chat with tool use
 * Reads from stdin for user input
 */
async function conversationMode(
    session: Session,
    fs: FS | null,
    apiKey: string,
    io: CommandIO
): Promise<number> {
    io.stdout.write('Entering AI conversation mode. Type "exit" or Ctrl+D to return to shell.\n\n');

    const systemPrompt = buildSystemPrompt(session, true);
    const messages: Message[] = [];

    // Show initial prompt
    io.stdout.write('\x1b[36mai>\x1b[0m ');

    // Read lines from stdin
    for await (const line of readLines(io.stdin, io.signal)) {
        const trimmed = line.trim();

        // Exit commands
        if (!trimmed || trimmed === 'exit' || trimmed === 'quit') {
            break;
        }

        // Add user message
        messages.push({ role: 'user', content: trimmed });

        // Chat loop with potential tool use
        let continueLoop = true;
        while (continueLoop) {
            continueLoop = false;

            try {
                const response = await fetch(ANTHROPIC_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: MODEL,
                        max_tokens: 4096,
                        system: systemPrompt,
                        messages,
                        tools: TOOLS,
                    }),
                });

                if (!response.ok) {
                    const error = await response.text();
                    io.stderr.write(`ai: API error: ${response.status} ${error}\n`);
                    break;
                }

                const result = await response.json() as {
                    content: ContentBlock[];
                    stop_reason: string;
                };

                // Process response content
                const assistantContent: ContentBlock[] = [];
                const toolResults: ContentBlock[] = [];

                for (const block of result.content) {
                    if (block.type === 'text') {
                        assistantContent.push(block);
                        io.stdout.write(block.text);
                    } else if (block.type === 'tool_use') {
                        assistantContent.push(block);

                        if (block.name === 'run_command') {
                            const cmd = (block.input as { command: string }).command;
                            io.stdout.write(`\n\x1b[2m[Running: ${cmd}]\x1b[0m\n`);

                            // Execute the command
                            const output = await executeCommandCapture(session, fs, cmd, io);

                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: block.id,
                                content: output,
                            });
                        }
                    }
                }

                // Add assistant message
                messages.push({ role: 'assistant', content: assistantContent });

                // If there were tool uses, add results and continue
                if (toolResults.length > 0) {
                    messages.push({ role: 'user', content: toolResults });
                    continueLoop = true;
                } else {
                    io.stdout.write('\n\n');
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'unknown error';
                io.stderr.write(`ai: ${message}\n`);
                break;
            }
        }

        // Show prompt for next input
        io.stdout.write('\x1b[36mai>\x1b[0m ');
    }

    return 0;
}

/**
 * Async generator that yields lines from stdin
 */
async function* readLines(
    stdin: PassThrough,
    signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
    let buffer = '';

    for await (const chunk of stdin) {
        if (signal?.aborted) return;

        buffer += chunk.toString();

        // Yield complete lines
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            yield buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
        }
    }

    // Yield remaining data if any
    if (buffer) {
        yield buffer;
    }
}

/**
 * Execute a command and capture its output
 */
async function executeCommandCapture(
    session: Session,
    _fs: FS | null,
    command: string,
    parentIO: CommandIO
): Promise<string> {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    stdin.end();

    const io: CommandIO = { stdin, stdout, stderr };

    let output = '';

    stdout.on('data', (chunk) => {
        output += chunk.toString();
        // Don't echo stdout - AI will summarize
    });

    stderr.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
        parentIO.stderr.write(`\x1b[31m${text}\x1b[0m`); // Show errors to user
    });

    try {
        const exitCode = await executeLine(session, command, io, {
            addToHistory: false,
            useTransaction: true,
        });

        if (exitCode !== 0) {
            output += `\n[Exit code: ${exitCode}]`;
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        output += `\n[Error: ${message}]`;
    }

    return output || '[No output]';
}

/**
 * Stream a response body to stdout
 */
async function streamResponse(body: ReadableStream<Uint8Array>, io: CommandIO): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        if (io.signal?.aborted) {
            reader.cancel();
            break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
                const event = JSON.parse(data);

                if (event.type === 'content_block_delta') {
                    const text = event.delta?.text;
                    if (text) {
                        io.stdout.write(text);
                    }
                } else if (event.type === 'error') {
                    io.stderr.write(`\nai: ${event.error?.message || 'unknown error'}\n`);
                    return;
                }
            } catch {
                // Ignore parse errors for non-JSON lines
            }
        }
    }
}

/**
 * Build system prompt with session context
 */
function buildSystemPrompt(session: Session, withTools: boolean): string {
    let prompt = `You are an AI assistant embedded in a Linux-like shell called monksh.
You help users understand data, answer questions, and provide concise responses.

Session context:
- Working directory: ${session.cwd}
- User: ${session.username}
- Tenant: ${session.tenant}

Keep responses concise and appropriate for terminal output.
When given data in <input> tags, analyze or transform it as requested.`;

    if (withTools) {
        prompt += `

You have access to the run_command tool to execute shell commands. Use it to:
- Explore the filesystem (ls, cat, find, tree)
- Query data (select, describe, count)
- Run utilities (grep, wc, jq, etc.)
- Modify files when asked (touch, mkdir, rm, etc.)

You can run multiple commands to build up an answer. Show your work by running commands.
When you run a command, the user will see the output. After running commands, summarize what you found.

Available commands include: ls, cd, cat, head, tail, find, grep, tree, select, describe, count,
insert, update, delete, touch, mkdir, rm, mv, cp, echo, env, ps, ping, and many more.`;
    } else {
        prompt += `
Do not use markdown formatting unless specifically asked.`;
    }

    return prompt;
}
