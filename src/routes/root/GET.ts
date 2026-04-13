import type { Context } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_DIR = 'routes/root';

function getRootAssetPath(filename: string): string {
    const projectRoot = process.env.PROJECT_ROOT || process.cwd();
    const baseDir = process.env.NODE_ENV === 'development' ? 'src' : 'dist';
    return join(projectRoot, baseDir, ROOT_DIR, filename);
}

function readRootAsset(filename: string): string {
    const assetPath = getRootAssetPath(filename);

    if (!existsSync(assetPath)) {
        throw new Error(`Public root asset not found: ${filename}`);
    }

    return readFileSync(assetPath, 'utf8');
}

/**
 * GET / - Human-facing API root endpoint
 * GET /index.html - Human-facing entrypoint
 * GET /index.css - Stylesheet for the public root
 * GET /llms.txt - Agent-facing entrypoint
 *
 * Serves the public landing page as HTML/CSS and keeps the markdown
 * document available for agents at /llms.txt.
 */
export default function (context: Context) {
    const path = context.req.path;

    if (path === '/index.css') {
        return new Response(readRootAsset('index.css'), {
            headers: {
                'Content-Type': 'text/css; charset=utf-8',
            },
        });
    }

    if (path === '/llms.txt') {
        return new Response(readRootAsset('README.md'), {
            headers: {
                'Content-Type': 'text/markdown; charset=utf-8',
            },
        });
    }

    return new Response(readRootAsset('index.html'), {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
        },
    });
}
