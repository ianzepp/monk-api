/**
 * TTY AI Mode
 *
 * Handles AI-first interaction mode where AI is the primary interface.
 * Users can escape to shell via '!' or '! cmd'.
 */

import type { Session, TTYStream, CommandIO } from './types.js';
import { TTY_CHARS } from './types.js';
import { enterShellMode } from './shell-mode.js';
import { executeLine, createIO } from './executor.js';
import { saveHistory } from './profile.js';
import { renderMarkdown } from './commands/glow.js';
import { resolvePath } from './parser.js';
import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectRoot } from '@src/lib/constants.js';
import type { FS } from '@src/lib/fs/index.js';
import { runTransaction } from '@src/lib/transaction.js';
import { applySessionMounts } from './profile.js';

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

/**
 * Write to TTY stream with CRLF
 */
function writeToStream(stream: TTYStream, text: string): void {
    const normalized = text.replace(/(?<!\r)\n/g, '\r\n');
    stream.write(normalized);
}

/**
 * Parse env-style config file content
 */
function parseConfig(content: string): Record<string, string> {
    const config: Record<string, string> = {};
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
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
 * Load AI configuration from /etc/agents/ai.conf
 */
function loadConfig(): AIConfig {
    const config = { ...DEFAULT_CONFIG };

    try {
        const systemConf = readFileSync(
            join(getProjectRoot(), 'monkfs', 'etc', 'agents', 'ai.conf'),
            'utf-8'
        );
        applyConfig(config, parseConfig(systemConf));
    } catch {
        // Use defaults
    }

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
        // File doesn't exist or invalid JSON
    }
    return [];
}

/**
 * Save conversation context to ~/.ai/context.json
 */
async function saveContextToFile(fs: FS | null, homeDir: string, messages: Message[]): Promise<void> {
    if (!fs || messages.length === 0) return;

    const contextPath = `${homeDir}/${CONTEXT_FILE}`;
    const aiDir = `${homeDir}/.ai`;

    try {
        try {
            await fs.stat(aiDir);
        } catch {
            await fs.mkdir(aiDir);
        }

        const context = {
            version: 1,
            savedAt: new Date().toISOString(),
            messageCount: messages.length,
            messages,
        };
        await fs.write(contextPath, JSON.stringify(context, null, 2));
    } catch {
        // Silently fail
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

    // Inject shell transcript if available
    if (session.shellTranscript.length > 0) {
        prompt += `\n\nRecent shell session:\n${session.shellTranscript.join('\n---\n')}`;
    }

    const toolsPrompt = getAgentPromptTools();
    if (withTools && toolsPrompt) {
        prompt += '\n\n' + toolsPrompt;
    } else {
        prompt += '\nDo not use markdown formatting unless specifically asked.';
    }

    return prompt;
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
    const maxMessages = config.maxTurns * 2;

    if (messages.length <= maxMessages) {
        return messages;
    }

    switch (config.contextStrategy) {
        case 'none':
            return messages;

        case 'truncate':
            return messages.slice(-maxMessages);

        case 'summarize': {
            const oldMessages = messages.slice(0, -maxMessages);
            const recentMessages = messages.slice(-maxMessages);
            const summary = await summarizeMessages(oldMessages, config, apiKey, systemPrompt);
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
    _systemPrompt: string
): Promise<string> {
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

/**
 * Execute a command and capture its output
 */
async function executeCommandCapture(
    session: Session,
    command: string
): Promise<string> {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    stdin.end();

    const io: CommandIO = { stdin, stdout, stderr };

    let output = '';

    stdout.on('data', (chunk) => {
        output += chunk.toString();
    });

    stderr.on('data', (chunk) => {
        output += chunk.toString();
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

/** Session-level AI state */
interface AIState {
    config: AIConfig;
    messages: Message[];
    initialized: boolean;
}

/** Map of session ID to AI state */
const aiStates = new Map<string, AIState>();

/**
 * Get or create AI state for a session
 */
function getAIState(session: Session): AIState {
    let state = aiStates.get(session.id);
    if (!state) {
        state = {
            config: loadConfig(),
            messages: [],
            initialized: false,
        };
        aiStates.set(session.id, state);
    }
    return state;
}

/**
 * Clean up AI state for a session
 */
export function cleanupAIState(sessionId: string): void {
    aiStates.delete(sessionId);
}

/**
 * Enter AI mode (called after login)
 */
export async function enterAIMode(
    stream: TTYStream,
    session: Session
): Promise<void> {
    const state = getAIState(session);
    const homeDir = `/home/${session.username}`;

    // Load context and user config inside transaction
    if (!state.initialized && session.systemInit) {
        await runTransaction(session.systemInit, async (system) => {
            applySessionMounts(session, system.fs, system);
            const fs = system.fs;

            // Load user config overrides
            const userConfig = await loadUserConfig(fs, homeDir);
            applyConfig(state.config, userConfig);

            // Load previous conversation context
            state.messages = await loadContext(fs, homeDir);
        });

        state.initialized = true;

        // Show loaded context info
        if (state.messages.length > 0) {
            writeToStream(stream, `Context restored (${state.messages.length} messages).\n`);
        }
    }

    writeToStream(stream, TTY_CHARS.AI_PROMPT);
}

/**
 * Save AI context (called on exit/disconnect)
 */
export async function saveAIContext(session: Session): Promise<void> {
    const state = aiStates.get(session.id);
    if (!state || state.messages.length === 0 || !session.systemInit) return;

    const homeDir = `/home/${session.username}`;

    await runTransaction(session.systemInit, async (system) => {
        applySessionMounts(session, system.fs, system);
        await saveContextToFile(system.fs, homeDir, state.messages);
    });
}

/**
 * Process AI input
 *
 * @returns false if session should close
 */
export async function processAIInput(
    stream: TTYStream,
    session: Session,
    line: string
): Promise<boolean> {
    const trimmed = line.trim();

    // Empty line - just print prompt
    if (!trimmed) {
        writeToStream(stream, TTY_CHARS.AI_PROMPT);
        return true;
    }

    // Shell escape: ! or !command
    if (trimmed === TTY_CHARS.SHELL_ESCAPE || trimmed.startsWith(TTY_CHARS.SHELL_ESCAPE)) {
        const cmd = trimmed.slice(TTY_CHARS.SHELL_ESCAPE.length).trim();
        await enterShellMode(stream, session, cmd || undefined);
        return true;
    }

    // Exit AI mode entirely
    if (trimmed === 'exit' || trimmed === 'quit') {
        await saveAIContext(session);
        await saveHistory(session);
        session.shouldClose = true;
        return false;
    }

    // Check for API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        writeToStream(stream, 'Error: ANTHROPIC_API_KEY environment variable not set.\n');
        writeToStream(stream, 'Use ! to enter shell mode, or set the API key.\n');
        writeToStream(stream, TTY_CHARS.AI_PROMPT);
        return true;
    }

    // Process AI message
    await handleAIMessage(stream, session, trimmed, apiKey);

    return true;
}

/**
 * Handle a single AI message
 */
async function handleAIMessage(
    stream: TTYStream,
    session: Session,
    message: string,
    apiKey: string
): Promise<void> {
    const state = getAIState(session);
    const homeDir = `/home/${session.username}`;
    const systemPrompt = buildSystemPrompt(session, true);

    // Add user message
    state.messages.push({ role: 'user', content: message });

    // Apply sliding window if needed
    state.messages = await applyContextStrategy(state.messages, state.config, apiKey, systemPrompt);

    // Agentic loop with tool use
    let continueLoop = true;
    while (continueLoop) {
        continueLoop = false;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        };
        if (state.config.promptCaching) {
            headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
        }

        const systemPayload = state.config.promptCaching
            ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
            : systemPrompt;

        try {
            const response = await fetch(ANTHROPIC_API_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: state.config.model,
                    max_tokens: state.config.maxTokens,
                    system: systemPayload,
                    messages: state.messages,
                    tools: TOOLS,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                writeToStream(stream, `AI error: ${response.status} ${error}\n`);
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
                    const text = state.config.markdownRendering
                        ? renderMarkdown(block.text)
                        : block.text;
                    writeToStream(stream, text);
                } else if (block.type === 'tool_use') {
                    assistantContent.push(block);

                    if (block.name === 'run_command') {
                        const cmd = (block.input as { command: string }).command;
                        writeToStream(stream, `\n\x1b[36m\u25cf\x1b[0m run_command(${cmd})\n`);

                        const output = await executeCommandCapture(session, cmd);

                        const lines = output.split('\n').filter(l => l.trim()).length;
                        const chars = output.length;
                        writeToStream(stream, `  \x1b[2m\u23bf\x1b[0m  ${lines} lines, ${chars} chars\n\n`);

                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: output,
                        });
                    } else if (block.name === 'read_file') {
                        const path = (block.input as { path: string }).path;
                        const resolved = resolvePath(session.cwd, path);
                        writeToStream(stream, `\n\x1b[36m\u25cf\x1b[0m read_file(${resolved})\n`);

                        let output: string;
                        try {
                            if (!session.systemInit) {
                                output = '[Error: filesystem not available]';
                            } else {
                                output = await runTransaction(session.systemInit, async (system) => {
                                    applySessionMounts(session, system.fs, system);
                                    const data = await system.fs.read(resolved);
                                    return data.toString();
                                });
                            }
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            output = `[Error: ${msg}]`;
                        }

                        const lines = output.split('\n').length;
                        const chars = output.length;
                        writeToStream(stream, `  \x1b[2m\u23bf\x1b[0m  ${lines} lines, ${chars} chars\n\n`);

                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: output,
                        });
                    } else if (block.name === 'write_file') {
                        const { path, content } = block.input as { path: string; content: string };
                        const resolved = resolvePath(session.cwd, path);
                        writeToStream(stream, `\n\x1b[36m\u25cf\x1b[0m write_file(${resolved})\n`);

                        let output: string;
                        try {
                            if (!session.systemInit) {
                                output = '[Error: filesystem not available]';
                            } else {
                                await runTransaction(session.systemInit, async (system) => {
                                    applySessionMounts(session, system.fs, system);
                                    await system.fs.write(resolved, content);
                                });
                                output = `Wrote ${content.length} bytes to ${resolved}`;
                            }
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            output = `[Error: ${msg}]`;
                        }

                        writeToStream(stream, `  \x1b[2m\u23bf\x1b[0m  ${output}\n\n`);

                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: output,
                        });
                    }
                }
            }

            // Add assistant message
            state.messages.push({ role: 'assistant', content: assistantContent });

            // If there were tool uses, add results and continue
            if (toolResults.length > 0) {
                state.messages.push({ role: 'user', content: toolResults });
                continueLoop = true;
            } else {
                writeToStream(stream, '\n\n');
            }
        } catch (err) {
            const errMessage = err instanceof Error ? err.message : 'unknown error';
            writeToStream(stream, `AI error: ${errMessage}\n`);
            break;
        }
    }

    // Clear shell transcript after it's been incorporated into AI context
    session.shellTranscript = [];

    writeToStream(stream, TTY_CHARS.AI_PROMPT);
}
