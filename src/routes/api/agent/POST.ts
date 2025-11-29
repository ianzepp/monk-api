/**
 * POST /api/agent - Execute AI agent with a prompt
 *
 * Request body:
 * {
 *   "prompt": "what records changed in the last day"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "success": true,
 *     "response": "...",
 *     "toolCalls": [...]
 *   }
 * }
 */

import type { Context } from 'hono';
import type { SystemInit } from '@src/lib/system.js';
import { executeAgentPrompt } from '@src/lib/tty/headless.js';
import { createSuccessResponse, createValidationError } from '@src/lib/api-helpers.js';

export default async function AgentPost(context: Context) {
    // systemInit is set by authValidatorMiddleware for /api/* routes
    const systemInit = context.get('systemInit') as SystemInit;

    const body = context.get('parsedBody') as { prompt?: string; maxTurns?: number } | undefined;

    if (!body?.prompt || typeof body.prompt !== 'string') {
        return createValidationError(context, 'Request body must include "prompt" string', [
            { field: 'prompt', message: 'Required string field' }
        ]);
    }

    const result = await executeAgentPrompt(systemInit, body.prompt, {
        maxTurns: body.maxTurns,
    });

    return createSuccessResponse(context, result);
}
