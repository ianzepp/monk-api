/**
 * Headless TTY Agent
 *
 * Provides TTY agent capabilities without a terminal stream.
 * Used by MCP server and HTTP API for programmatic AI access.
 */

import type { Session } from './types.js';
import type { SystemInit } from '@src/lib/system.js';
import { createSession, generateSessionId } from './types.js';
import { runTransaction } from '@src/lib/transaction.js';
import { applySessionMounts, loadHistory } from './profile.js';
import { executeLine, createIO } from './executor.js';
import { resolvePath } from './parser.js';
import { PassThrough } from 'node:stream';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectRoot } from '@src/lib/constants.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Agent response structure
 */
export interface AgentResponse {
    success: boolean;
    response: string;
    toolCalls?: {
        name: string;
        input: Record<string, unknown>;
        output: string;
    }[];
    error?: string;
}

/**
 * Tool call record
 */
interface ToolCall {
    name: string;
    input: Record<string, unknown>;
    output: string;
}

/**
 * AI configuration
 */
interface AIConfig {
    model: string;
    maxTurns: number;
    maxTokens: number;
}

const DEFAULT_CONFIG: AIConfig = {
    model: 'claude-sonnet-4-20250514',
    maxTurns: 20,
    maxTokens: 4096,
};

type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_result'; tool_use_id: string; content: string };

type Message = {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
};

// Tool definitions for AI capabilities
const TOOLS = [
    {
        name: 'run_command',
        description: 'Execute a shell command in monksh and return the output.',
        input_schema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The shell command to execute',
                },
            },
            required: ['command'],
        },
    },
    {
        name: 'read_file',
        description: 'Read the contents of a file.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The file path to read',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_file',
        description: 'Write content to a file.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The file path to write',
                },
                content: {
                    type: 'string',
                    description: 'The content to write',
                },
            },
            required: ['path', 'content'],
        },
    },
];

// Cache for agent prompt
let _agentPrompt: string | null = null;

function getAgentPrompt(): string {
    if (_agentPrompt === null) {
        try {
            _agentPrompt = readFileSync(
                join(getProjectRoot(), 'monkfs', 'etc', 'agents', 'ai'),
                'utf-8'
            );
        } catch {
            _agentPrompt = 'You are an AI assistant with access to a database shell.';
        }
    }
    return _agentPrompt;
}

// Cache for custom commands
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

/**
 * Session cache for headless sessions
 * Key: sessionId (from MCP or generated)
 */
const sessionCache = new Map<string, Session>();

/**
 * Create or retrieve a headless session
 */
export function getOrCreateHeadlessSession(
    systemInit: SystemInit,
    sessionId?: string
): Session {
    const id = sessionId || generateSessionId();

    // Check cache
    const cached = sessionCache.get(id);
    if (cached && cached.systemInit) {
        return cached;
    }

    // Create new session
    const session = createSession(id);
    session.systemInit = systemInit;
    session.authenticated = true;
    session.username = systemInit.username || 'root';
    session.tenant = systemInit.tenant;
    session.mode = 'ai';

    // Set environment
    const home = `/home/${session.username}`;
    session.env['USER'] = session.username;
    session.env['TENANT'] = session.tenant;
    session.env['ACCESS'] = systemInit.access;
    session.env['HOME'] = home;
    session.cwd = home;

    // Cache session
    sessionCache.set(id, session);

    return session;
}

/**
 * Build system prompt for headless agent
 */
function buildSystemPrompt(session: Session): string {
    const parts: string[] = [];

    // Base agent prompt
    parts.push(getAgentPrompt());

    // Custom commands
    const customCommands = getCustomCommands();
    if (customCommands.length > 0) {
        parts.push('\n# Custom Commands\n');
        for (const cmd of customCommands) {
            parts.push(cmd.content);
        }
    }

    // Session context
    parts.push(`
Session context:
- Working directory: ${session.cwd}
- User: ${session.username}
- Tenant: ${session.tenant}
`);

    return parts.join('\n');
}

/**
 * Execute a command and capture output
 */
async function executeCommandCapture(
    session: Session,
    command: string
): Promise<{ output: string; exitCode: number; error?: string }> {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    stdin.end();

    const io = { stdin, stdout, stderr };
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
        return { output: output || '[No output]', exitCode };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { output, exitCode: 1, error: message };
    }
}

/**
 * Execute AI agent with a prompt
 *
 * This is the main entry point for headless AI access.
 */
export async function executeAgentPrompt(
    systemInit: SystemInit,
    prompt: string,
    options?: {
        sessionId?: string;
        maxTurns?: number;
    }
): Promise<AgentResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return {
            success: false,
            response: '',
            error: 'ANTHROPIC_API_KEY not configured',
        };
    }

    const session = getOrCreateHeadlessSession(systemInit, options?.sessionId);
    const config = { ...DEFAULT_CONFIG };
    if (options?.maxTurns) {
        config.maxTurns = options.maxTurns;
    }

    const systemPrompt = buildSystemPrompt(session);
    const messages: Message[] = [{ role: 'user', content: prompt }];
    const toolCalls: ToolCall[] = [];
    let responseText = '';

    // Agentic loop
    let turns = 0;
    let continueLoop = true;

    while (continueLoop && turns < config.maxTurns) {
        continueLoop = false;
        turns++;

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
                    max_tokens: config.maxTokens,
                    system: systemPrompt,
                    messages,
                    tools: TOOLS,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                return {
                    success: false,
                    response: responseText,
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                    error: `API error ${response.status}: ${error}`,
                };
            }

            const result = (await response.json()) as {
                content: ContentBlock[];
                stop_reason: string;
            };

            // Process response
            const assistantContent: ContentBlock[] = [];
            const toolResults: ContentBlock[] = [];

            for (const block of result.content) {
                if (block.type === 'text') {
                    assistantContent.push(block);
                    responseText += (responseText ? '\n' : '') + block.text;
                } else if (block.type === 'tool_use') {
                    assistantContent.push(block);

                    let output: string;

                    if (block.name === 'run_command') {
                        const cmd = (block.input as { command: string }).command;
                        const result = await executeCommandCapture(session, cmd);
                        output =
                            result.exitCode !== 0
                                ? `${result.output}\n[Exit code: ${result.exitCode}]`
                                : result.output;

                        toolCalls.push({ name: 'run_command', input: block.input, output });
                    } else if (block.name === 'read_file') {
                        const path = (block.input as { path: string }).path;
                        const resolved = resolvePath(session.cwd, path);

                        try {
                            output = await runTransaction(session.systemInit!, async (system) => {
                                applySessionMounts(session, system.fs, system);
                                const data = await system.fs.read(resolved);
                                return data.toString();
                            });
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            output = `[Error: ${msg}]`;
                        }

                        toolCalls.push({ name: 'read_file', input: block.input, output });
                    } else if (block.name === 'write_file') {
                        const { path, content } = block.input as { path: string; content: string };
                        const resolved = resolvePath(session.cwd, path);

                        try {
                            await runTransaction(session.systemInit!, async (system) => {
                                applySessionMounts(session, system.fs, system);
                                await system.fs.write(resolved, content);
                            });
                            output = `Wrote ${content.length} bytes to ${resolved}`;
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            output = `[Error: ${msg}]`;
                        }

                        toolCalls.push({ name: 'write_file', input: block.input, output });
                    } else {
                        output = `Unknown tool: ${block.name}`;
                    }

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: output,
                    });
                }
            }

            // Add assistant message
            messages.push({ role: 'assistant', content: assistantContent });

            // If there were tool uses, continue loop
            if (toolResults.length > 0) {
                messages.push({ role: 'user', content: toolResults });
                continueLoop = true;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                success: false,
                response: responseText,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                error: message,
            };
        }
    }

    return {
        success: true,
        response: responseText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
}

/**
 * Clear cached session
 */
export function clearHeadlessSession(sessionId: string): void {
    sessionCache.delete(sessionId);
}
