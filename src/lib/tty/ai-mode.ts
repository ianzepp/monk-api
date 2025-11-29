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
import { readFileSync, readdirSync } from 'node:fs';
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

// Cache for custom command help (each command as separate entry)
let _customCommands: { name: string; content: string }[] | null = null;

function getCustomCommands(): { name: string; content: string }[] {
    if (_customCommands === null) {
        _customCommands = [];
        try {
            const commandsDir = join(getProjectRoot(), 'monkfs', 'etc', 'agents', 'commands');
            const files = readdirSync(commandsDir).sort();

            for (const file of files) {
                try {
                    const content = readFileSync(join(commandsDir, file), 'utf-8');
                    _customCommands.push({ name: file, content: content.trim() });
                } catch {
                    // Skip unreadable files
                }
            }
        } catch {
            // Directory doesn't exist
        }
    }
    return _customCommands;
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

/** Context with metadata */
interface SavedContext {
    messages: Message[];
    savedAt?: string;
}

/**
 * Load saved conversation context from ~/.ai/context.json
 */
async function loadContext(fs: FS | null, homeDir: string): Promise<SavedContext> {
    if (!fs) return { messages: [] };

    const contextPath = `${homeDir}/${CONTEXT_FILE}`;
    try {
        const data = await fs.read(contextPath);
        const parsed = JSON.parse(data.toString());
        if (Array.isArray(parsed.messages)) {
            return {
                messages: parsed.messages,
                savedAt: parsed.savedAt,
            };
        }
    } catch {
        // File doesn't exist or invalid JSON
    }
    return { messages: [] };
}

/**
 * Clear saved context
 */
async function clearContext(fs: FS | null, homeDir: string): Promise<void> {
    if (!fs) return;
    const contextPath = `${homeDir}/${CONTEXT_FILE}`;
    try {
        await fs.unlink(contextPath);
    } catch {
        // File doesn't exist - that's fine
    }
}

/**
 * Format time ago string
 */
function formatTimeAgo(savedAt: string): string {
    const saved = new Date(savedAt);
    const now = new Date();
    const diffMs = now.getTime() - saved.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'just now';
}

/**
 * Extract last topic from messages (truncated last user message)
 */
function extractLastTopic(messages: Message[]): string | null {
    // Find last user message
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'user') {
            const content = typeof msg.content === 'string'
                ? msg.content
                : msg.content
                    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                    .map(b => b.text)
                    .join(' ');
            // Truncate and clean
            const cleaned = content.replace(/\s+/g, ' ').trim();
            if (cleaned.length > 50) {
                return cleaned.slice(0, 47) + '...';
            }
            return cleaned || null;
        }
    }
    return null;
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

/** System prompt content block */
interface SystemBlock {
    type: 'text';
    text: string;
    cache_control?: { type: 'ephemeral' };
}

/**
 * Build system prompt as array of content blocks
 *
 * Static content (base prompt, tools, commands) is marked for caching.
 * Dynamic content (session context) is not cached.
 */
function buildSystemPrompt(session: Session, withTools: boolean): SystemBlock[] {
    const blocks: SystemBlock[] = [];

    // Base agent prompt (static, cached)
    blocks.push({
        type: 'text',
        text: getAgentPromptBase(),
        cache_control: { type: 'ephemeral' },
    });

    // Custom commands - each as separate block (static, cached)
    const customCommands = getCustomCommands();
    if (customCommands.length > 0) {
        blocks.push({
            type: 'text',
            text: '# Custom Commands\n\nThese commands are specific to monksh:',
            cache_control: { type: 'ephemeral' },
        });

        for (const cmd of customCommands) {
            blocks.push({
                type: 'text',
                text: cmd.content,
                cache_control: { type: 'ephemeral' },
            });
        }
    }

    // Session context (dynamic, not cached)
    let sessionContext = `Session context:
- Working directory: ${session.cwd}
- User: ${session.username}
- Tenant: ${session.tenant}`;

    // Inject shell transcript if available
    if (session.shellTranscript.length > 0) {
        sessionContext += `\n\nRecent shell session:\n${session.shellTranscript.join('\n---\n')}`;
    }

    blocks.push({
        type: 'text',
        text: sessionContext,
        // No cache_control - this is dynamic per-session
    });

    return blocks;
}

/**
 * Apply context strategy (sliding window) to messages
 */
async function applyContextStrategy(
    messages: Message[],
    config: AIConfig,
    apiKey: string
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
            const summary = await summarizeMessages(oldMessages, config, apiKey);
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
    apiKey: string
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

interface CommandResult {
    output: string;
    exitCode: number;
    error?: string;
}

/**
 * Execute a command and capture its output
 */
async function executeCommandCapture(
    session: Session,
    command: string
): Promise<CommandResult> {
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

        return {
            output: output || '[No output]',
            exitCode,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            output: output || '',
            exitCode: 1,
            error: message,
        };
    }
}

/** Session-level AI state */
interface AIState {
    config: AIConfig;
    messages: Message[];
    initialized: boolean;
    abortController: AbortController | null;
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
            abortController: null,
        };
        aiStates.set(session.id, state);
    }
    return state;
}

/**
 * Abort any in-progress AI request for a session
 */
export function abortAIRequest(sessionId: string): boolean {
    const state = aiStates.get(sessionId);
    if (state?.abortController) {
        state.abortController.abort();
        state.abortController = null;
        return true;
    }
    return false;
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
        let savedAt: string | undefined;

        await runTransaction(session.systemInit, async (system) => {
            applySessionMounts(session, system.fs, system);
            const fs = system.fs;

            // Load user config overrides
            const userConfig = await loadUserConfig(fs, homeDir);
            applyConfig(state.config, userConfig);

            // Load previous conversation context
            const context = await loadContext(fs, homeDir);
            state.messages = context.messages;
            savedAt = context.savedAt;
        });

        state.initialized = true;

        // Show loaded context info with topic summary
        if (state.messages.length > 0 && savedAt) {
            const timeAgo = formatTimeAgo(savedAt);
            const topic = extractLastTopic(state.messages);
            const topicInfo = topic ? `\n  Last: "${topic}"` : '';
            writeToStream(stream, `\x1b[2mResuming conversation (${state.messages.length} messages, ${timeAgo})${topicInfo}\x1b[0m\n`);
            writeToStream(stream, `\x1b[2mType /new to start fresh\x1b[0m\n\n`);
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

    // Clear context and start fresh
    if (trimmed === '/new' || trimmed === '/clear') {
        const state = getAIState(session);
        const homeDir = `/home/${session.username}`;

        state.messages = [];

        if (session.systemInit) {
            await runTransaction(session.systemInit, async (system) => {
                applySessionMounts(session, system.fs, system);
                await clearContext(system.fs, homeDir);
            });
        }

        writeToStream(stream, 'Context cleared. Starting fresh.\n');
        writeToStream(stream, TTY_CHARS.AI_PROMPT);
        return true;
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
    const systemBlocks = buildSystemPrompt(session, true);

    // Add user message
    state.messages.push({ role: 'user', content: message });

    // Apply sliding window if needed
    state.messages = await applyContextStrategy(state.messages, state.config, apiKey);

    // Agentic loop with tool use
    let continueLoop = true;
    while (continueLoop) {
        continueLoop = false;

        // Create abort controller for this request
        state.abortController = new AbortController();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        };
        if (state.config.promptCaching) {
            headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
        }

        try {
            const requestBody = {
                model: state.config.model,
                max_tokens: state.config.maxTokens,
                system: systemBlocks,
                messages: state.messages,
                tools: TOOLS,
            };

            // Debug: show outgoing request (only the new message, not full context)
            if (session.debugMode) {
                const lastMsg = state.messages[state.messages.length - 1];
                const debugInfo = {
                    model: state.config.model,
                    message: lastMsg,
                    contextSize: state.messages.length,
                };
                writeToStream(stream, `\n\x1b[33m-> ${JSON.stringify(debugInfo)}\x1b[0m\n`);
            }

            const response = await fetch(ANTHROPIC_API_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
                signal: state.abortController.signal,
            });

            if (!response.ok) {
                const error = await response.text();
                if (session.debugMode) {
                    writeToStream(stream, `\n\x1b[31m<- ${error}\x1b[0m\n`);
                }
                writeToStream(stream, `AI error: ${response.status} ${error}\n`);
                break;
            }

            const result = await response.json() as {
                content: ContentBlock[];
                stop_reason: string;
            };

            // Debug: show incoming response
            if (session.debugMode) {
                writeToStream(stream, `\n\x1b[32m<- ${JSON.stringify(result)}\x1b[0m\n`);
            }

            // Process response content
            const assistantContent: ContentBlock[] = [];
            const toolResults: ContentBlock[] = [];

            for (const block of result.content) {
                if (block.type === 'text') {
                    assistantContent.push(block);
                    const text = state.config.markdownRendering
                        ? renderMarkdown(block.text)
                        : block.text;
                    writeToStream(stream, '\n' + text);
                } else if (block.type === 'tool_use') {
                    assistantContent.push(block);

                    if (block.name === 'run_command') {
                        const cmd = (block.input as { command: string }).command;
                        writeToStream(stream, `\n\x1b[36m\u25cf\x1b[0m run_command(${cmd})\n`);

                        const result = await executeCommandCapture(session, cmd);

                        const lines = result.output.split('\n').filter(l => l.trim()).length;
                        const chars = result.output.length;

                        if (result.exitCode !== 0 || result.error) {
                            const errorInfo = result.error || `exit code ${result.exitCode}`;
                            writeToStream(stream, `  \x1b[31m\u2717\x1b[0m  ${errorInfo}\n`);
                        } else {
                            writeToStream(stream, `  \x1b[2m\u23bf\x1b[0m  ${lines} lines, ${chars} chars\n`);
                        }

                        // Include exit code in tool result for AI awareness
                        const toolOutput = result.exitCode !== 0
                            ? `${result.output}\n[Exit code: ${result.exitCode}]`
                            : result.output;

                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: toolOutput,
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
                        writeToStream(stream, `  \x1b[2m\u23bf\x1b[0m  ${lines} lines, ${chars} chars\n`);

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

                        writeToStream(stream, `  \x1b[2m\u23bf\x1b[0m  ${output}\n`);

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
            // Check if this was an abort
            if (err instanceof Error && err.name === 'AbortError') {
                writeToStream(stream, '\n^C\n');
                break;
            }
            const errMessage = err instanceof Error ? err.message : 'unknown error';
            writeToStream(stream, `AI error: ${errMessage}\n`);
            break;
        } finally {
            state.abortController = null;
        }
    }

    // Clear shell transcript after it's been incorporated into AI context
    session.shellTranscript = [];

    writeToStream(stream, TTY_CHARS.AI_PROMPT);
}
