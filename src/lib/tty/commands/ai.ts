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
import type { FS, FSError } from '@src/lib/fs/index.js';
import { executeLine } from '../executor.js';
import { renderMarkdown } from './glow.js';
import { resolvePath } from '../parser.js';
import { PassThrough } from 'node:stream';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectRoot } from '@src/lib/constants.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * AI configuration with defaults
 */
interface AIConfig {
    model: string;
    maxTurns: number;
    contextStrategy: 'none' | 'truncate' | 'summarize';
    maxTokens: number;
    promptCaching: boolean;
    markdownRendering: boolean;
    summaryPrompt: string;
}

const DEFAULT_CONFIG: AIConfig = {
    model: 'claude-sonnet-4-20250514',
    maxTurns: 20,
    contextStrategy: 'summarize',
    maxTokens: 4096,
    promptCaching: true,
    markdownRendering: true,
    summaryPrompt: 'Summarize the key points and decisions from this conversation in 2-3 sentences.',
};

/**
 * Parse env-style config file content
 */
function parseConfig(content: string): Record<string, string> {
    const config: Record<string, string> = {};
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim();
            config[key] = value;
        }
    }
    return config;
}

/**
 * Load AI configuration from /etc/agents/ai.conf and ~/.ai/config
 */
function loadConfig(fs: FS | null, homeDir: string): AIConfig {
    const config = { ...DEFAULT_CONFIG };

    // Load system config from /etc/agents/ai.conf
    try {
        const systemConf = readFileSync(
            join(getProjectRoot(), 'monkfs', 'etc', 'agents', 'ai.conf'),
            'utf-8'
        );
        applyConfig(config, parseConfig(systemConf));
    } catch {
        // Use defaults
    }

    // User config loaded async in conversationMode (needs fs)
    return config;
}

/**
 * Load user config overrides from ~/.ai/config
 */
async function loadUserConfig(fs: FS | null, homeDir: string): Promise<Record<string, string>> {
    if (!fs) return {};
    try {
        const data = await fs.read(`${homeDir}/.ai/config`);
        return parseConfig(data.toString());
    } catch {
        return {};
    }
}

/**
 * Apply parsed config values to AIConfig
 */
function applyConfig(config: AIConfig, values: Record<string, string>): void {
    if (values.MODEL) config.model = values.MODEL;
    if (values.MAX_TURNS) config.maxTurns = parseInt(values.MAX_TURNS, 10) || config.maxTurns;
    if (values.CONTEXT_STRATEGY) {
        const strategy = values.CONTEXT_STRATEGY.toLowerCase();
        if (strategy === 'none' || strategy === 'truncate' || strategy === 'summarize') {
            config.contextStrategy = strategy;
        }
    }
    if (values.MAX_TOKENS) config.maxTokens = parseInt(values.MAX_TOKENS, 10) || config.maxTokens;
    if (values.PROMPT_CACHING) config.promptCaching = values.PROMPT_CACHING.toLowerCase() === 'true';
    if (values.MARKDOWN_RENDERING) config.markdownRendering = values.MARKDOWN_RENDERING.toLowerCase() === 'true';
    if (values.SUMMARY_PROMPT) config.summaryPrompt = values.SUMMARY_PROMPT;
}

// Load agent prompts lazily from monkfs/etc/agents/
let _agentPromptBase: string | null = null;
let _agentPromptTools: string | null = null;

function getAgentPromptBase(): string {
    if (_agentPromptBase === null) {
        try {
            _agentPromptBase = readFileSync(join(getProjectRoot(), 'monkfs', 'etc', 'agents', 'ai'), 'utf-8');
        } catch {
            _agentPromptBase = 'You are an AI assistant embedded in a Linux-like shell called monksh.';
        }
    }
    return _agentPromptBase;
}

function getAgentPromptTools(): string {
    if (_agentPromptTools === null) {
        try {
            _agentPromptTools = readFileSync(join(getProjectRoot(), 'monkfs', 'etc', 'agents', 'ai-tools'), 'utf-8');
        } catch {
            _agentPromptTools = '';
        }
    }
    return _agentPromptTools;
}

// Tool definitions for AI capabilities
const TOOLS = [
    {
        name: 'run_command',
        description: 'Execute a shell command in monksh and return the output. Use this to explore the filesystem, query data, run utilities, etc. Do NOT use this for reading or writing files - use read_file and write_file instead.',
        input_schema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The shell command to execute (e.g., "ls -la", "select * from users", "ps")',
                },
            },
            required: ['command'],
        },
    },
    {
        name: 'read_file',
        description: 'Read the contents of a file. Use this instead of cat or run_command for reading files.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The file path to read (absolute or relative to current directory)',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_file',
        description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does. Use this instead of echo/redirect for writing files.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The file path to write (absolute or relative to current directory)',
                },
                content: {
                    type: 'string',
                    description: 'The content to write to the file',
                },
            },
            required: ['path', 'content'],
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

/** Context file path relative to home directory */
const CONTEXT_FILE = '.ai/context.json';

/**
 * Load saved conversation context from ~/.ai/context.json
 */
async function loadContext(fs: FS | null, homeDir: string): Promise<Message[]> {
    if (!fs) return [];

    const contextPath = `${homeDir}/${CONTEXT_FILE}`;
    try {
        const data = await fs.read(contextPath);
        const parsed = JSON.parse(data.toString());
        if (Array.isArray(parsed.messages)) {
            return parsed.messages;
        }
    } catch {
        // File doesn't exist or invalid JSON - start fresh
    }
    return [];
}

/**
 * Save conversation context to ~/.ai/context.json
 */
async function saveContext(fs: FS | null, homeDir: string, messages: Message[]): Promise<void> {
    if (!fs || messages.length === 0) return;

    const contextPath = `${homeDir}/${CONTEXT_FILE}`;
    const aiDir = `${homeDir}/.ai`;

    try {
        // Ensure .ai directory exists
        try {
            await fs.stat(aiDir);
        } catch {
            await fs.mkdir(aiDir);
        }

        // Save context with metadata
        const context = {
            version: 1,
            savedAt: new Date().toISOString(),
            messageCount: messages.length,
            messages,
        };
        await fs.write(contextPath, JSON.stringify(context, null, 2));
    } catch {
        // Silently fail - don't interrupt exit
    }
}

/**
 * Apply context strategy (sliding window) to messages
 */
async function applyContextStrategy(
    messages: Message[],
    config: AIConfig,
    apiKey: string,
    systemPrompt: string
): Promise<Message[]> {
    const maxMessages = config.maxTurns * 2; // Each turn = user + assistant

    if (messages.length <= maxMessages) {
        return messages;
    }

    switch (config.contextStrategy) {
        case 'none':
            // No limit - return all messages
            return messages;

        case 'truncate':
            // Simple truncation - keep most recent messages
            return messages.slice(-maxMessages);

        case 'summarize': {
            // Summarize old messages, keep recent ones
            const oldMessages = messages.slice(0, -maxMessages);
            const recentMessages = messages.slice(-maxMessages);

            // Generate summary of old messages
            const summary = await summarizeMessages(oldMessages, config, apiKey, systemPrompt);

            // Return summary + recent messages
            return [
                { role: 'user', content: `[Previous conversation summary: ${summary}]` },
                { role: 'assistant', content: 'I understand the context from our previous conversation.' },
                ...recentMessages,
            ];
        }

        default:
            return messages;
    }
}

/**
 * Summarize a list of messages using the AI
 */
async function summarizeMessages(
    messages: Message[],
    config: AIConfig,
    apiKey: string,
    systemPrompt: string
): Promise<string> {
    // Build a condensed view of the conversation
    const conversationText = messages
        .map(m => {
            const role = m.role === 'user' ? 'User' : 'Assistant';
            const content = typeof m.content === 'string'
                ? m.content
                : m.content
                    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                    .map(b => b.text)
                    .join('\n');
            return `${role}: ${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`;
        })
        .join('\n\n');

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: config.model,
                max_tokens: 500,
                system: 'You are a helpful assistant that summarizes conversations concisely.',
                messages: [
                    {
                        role: 'user',
                        content: `${config.summaryPrompt}\n\nConversation:\n${conversationText}`,
                    },
                ],
            }),
        });

        if (!response.ok) {
            return 'Previous conversation context (summary unavailable)';
        }

        const result = await response.json() as { content: ContentBlock[] };
        const textBlock = result.content.find((b): b is { type: 'text'; text: string } => b.type === 'text');
        return textBlock?.text || 'Previous conversation context';
    } catch {
        return 'Previous conversation context (summary unavailable)';
    }
}

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
    // Load configuration
    const homeDir = `/home/${session.username}`;
    const config = loadConfig(null, homeDir);

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

    // Build headers based on config
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
    };
    if (config.promptCaching) {
        headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
    }

    // Build system prompt (with or without caching)
    const systemPayload = config.promptCaching
        ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
        : systemPrompt;

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: config.model,
                max_tokens: config.maxTokens,
                stream: true,
                system: systemPayload,
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
    io.stdout.write('Entering AI conversation mode. Type "exit" or Ctrl+D to return to shell.\n');

    const homeDir = `/home/${session.username}`;

    // Load configuration (system + user overrides)
    const config = loadConfig(fs, homeDir);
    const userConfig = await loadUserConfig(fs, homeDir);
    applyConfig(config, userConfig);

    // List loaded agent configuration files
    const agentsDir = join(getProjectRoot(), 'monkfs', 'etc', 'agents');
    try {
        const files = readdirSync(agentsDir).sort();
        for (const file of files) {
            io.stdout.write(`  - /etc/agents/${file}\n`);
        }
    } catch {
        // Directory doesn't exist or not readable
    }

    // Show user config if present
    if (Object.keys(userConfig).length > 0) {
        io.stdout.write(`  - ~/.ai/config\n`);
    }

    // Load previous conversation context
    let messages: Message[] = await loadContext(fs, homeDir);

    if (messages.length > 0) {
        io.stdout.write(`  - ~/.ai/context.json (${messages.length} messages)\n`);
    }

    io.stdout.write('\n');

    const systemPrompt = buildSystemPrompt(session, true);

    // Show initial prompt
    io.stdout.write('\x1b[36m@>\x1b[0m ');

    // Read lines from stdin
    for await (const line of readLines(io.stdin, io.signal)) {
        const trimmed = line.trim();

        // Exit commands
        if (!trimmed || trimmed === 'exit' || trimmed === 'quit') {
            // Save context before exiting
            await saveContext(fs, homeDir, messages);
            if (messages.length > 0) {
                io.stdout.write('\x1b[2mContext saved to ~/.ai/context.json\x1b[0m\n');
            }
            break;
        }

        // Add user message
        messages.push({ role: 'user', content: trimmed });

        // Apply sliding window if needed
        messages = await applyContextStrategy(messages, config, apiKey, systemPrompt);

        // Chat loop with potential tool use
        let continueLoop = true;
        while (continueLoop) {
            continueLoop = false;

            // Build headers based on config
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            };
            if (config.promptCaching) {
                headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
            }

            // Build system prompt (with or without caching)
            const systemPayload = config.promptCaching
                ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
                : systemPrompt;

            try {
                const response = await fetch(ANTHROPIC_API_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: config.model,
                        max_tokens: config.maxTokens,
                        system: systemPayload,
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
                        io.stdout.write(config.markdownRendering ? renderMarkdown(block.text) : block.text);
                    } else if (block.type === 'tool_use') {
                        assistantContent.push(block);

                        if (block.name === 'run_command') {
                            const cmd = (block.input as { command: string }).command;
                            io.stdout.write(`\n\x1b[36m\u25cf\x1b[0m run_command(${cmd})\n`);

                            // Execute the command
                            const output = await executeCommandCapture(session, fs, cmd, io);

                            // Show result summary
                            const lines = output.split('\n').filter(l => l.trim()).length;
                            const chars = output.length;
                            io.stdout.write(`  \x1b[2m\u23bf\x1b[0m  ${lines} lines, ${chars} chars\n\n`);

                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: block.id,
                                content: output,
                            });
                        } else if (block.name === 'read_file') {
                            const path = (block.input as { path: string }).path;
                            const resolved = resolvePath(session.cwd, path);
                            io.stdout.write(`\n\x1b[36m\u25cf\x1b[0m read_file(${resolved})\n`);

                            let output: string;
                            try {
                                if (!fs) {
                                    output = '[Error: filesystem not available]';
                                } else {
                                    const data = await fs.read(resolved);
                                    output = data.toString();
                                }
                            } catch (err) {
                                const msg = err instanceof Error ? err.message : String(err);
                                output = `[Error: ${msg}]`;
                            }

                            // Show result summary
                            const lines = output.split('\n').length;
                            const chars = output.length;
                            io.stdout.write(`  \x1b[2m\u23bf\x1b[0m  ${lines} lines, ${chars} chars\n\n`);

                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: block.id,
                                content: output,
                            });
                        } else if (block.name === 'write_file') {
                            const { path, content } = block.input as { path: string; content: string };
                            const resolved = resolvePath(session.cwd, path);
                            io.stdout.write(`\n\x1b[36m\u25cf\x1b[0m write_file(${resolved})\n`);

                            let output: string;
                            try {
                                if (!fs) {
                                    output = '[Error: filesystem not available]';
                                } else {
                                    await fs.write(resolved, content);
                                    output = `Wrote ${content.length} bytes to ${resolved}`;
                                }
                            } catch (err) {
                                const msg = err instanceof Error ? err.message : String(err);
                                output = `[Error: ${msg}]`;
                            }

                            io.stdout.write(`  \x1b[2m\u23bf\x1b[0m  ${output}\n\n`);

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
        io.stdout.write('\x1b[36m@>\x1b[0m ');
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
    let prompt = getAgentPromptBase();

    prompt += `

Session context:
- Working directory: ${session.cwd}
- User: ${session.username}
- Tenant: ${session.tenant}`;

    const toolsPrompt = getAgentPromptTools();
    if (withTools && toolsPrompt) {
        prompt += '\n\n' + toolsPrompt;
    } else {
        prompt += '\nDo not use markdown formatting unless specifically asked.';
    }

    return prompt;
}
