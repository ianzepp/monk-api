import type { Context } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Read the public-facing root README used for both / and /llms.txt.
 *
 * This is intentionally separate from the repository root README.md,
 * which is for contributor and development context.
 */
function readPublicRootReadme(): string {
    const projectRoot = process.env.PROJECT_ROOT || process.cwd();
    const baseDir = process.env.NODE_ENV === 'development' ? 'src' : 'dist';
    const readmePath = join(projectRoot, baseDir, 'routes', 'root', 'README.md');

    if (!existsSync(readmePath)) {
        throw new Error('Public root README not found');
    }

    return readFileSync(readmePath, 'utf8');
}

/**
 * GET / - API root endpoint
 * GET /llms.txt - Agent-facing entrypoint
 *
 * Returns the public root README as markdown.
 * Public endpoint, no authentication required.
 */
export default function (context: Context) {
    context.header('Content-Type', 'text/markdown; charset=utf-8');
    return context.text(readPublicRootReadme());
}
