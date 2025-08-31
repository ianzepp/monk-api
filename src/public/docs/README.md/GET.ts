import type { Context } from 'hono';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * GET /README.md - Get public API documentation as markdown
 * @see Self-documenting API pattern for CLI and AI integration
 */
export default async function (context: Context) {
    // TODO
}
