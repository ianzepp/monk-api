/**
 * AI API communication - streaming and prompt building
 */

import type { Session, CommandIO } from '../../types.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectRoot } from '@src/lib/constants.js';

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

/**
 * Build system prompt with session context
 */
export function buildSystemPrompt(session: Session, withTools: boolean): string {
    let prompt = getAgentPromptBase();

    prompt += `

Session context:
- Working directory: ${session.cwd}
- User: ${session.username}
- Tenant: ${session.tenant}`;

    return prompt;
}

/**
 * Stream a response body to stdout
 */
export async function streamResponse(body: ReadableStream<Uint8Array>, io: CommandIO): Promise<void> {
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
