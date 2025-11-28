/**
 * Shell Commands
 *
 * Unix-style commands mapped to Monk API operations.
 *
 * Path structure:
 *   /                      Root (shows api/, system/)
 *   /api/                  API endpoints (shows data/, describe/)
 *   /api/data/             Models list
 *   /api/data/{model}/     Records in model
 *   /api/data/{model}/{id} Record file
 *   /api/describe/         Schema list
 *   /api/describe/{model}  Model schema
 *   /system/               System info pseudo-files
 *   /system/{file}         System pseudo-file
 */

import type { Session } from './transport.js';
import { ApiClient } from './api-client.js';
import { resolvePath } from './parser.js';

// Track server start time for uptime
const SERVER_START = Date.now();

/**
 * Command handler function signature
 */
export type CommandHandler = (
    session: Session,
    args: string[],
    write: (text: string) => void
) => Promise<void>;

/**
 * Path types in the filesystem
 */
type PathType =
    | 'root'           // /
    | 'api'            // /api
    | 'api-data'       // /api/data
    | 'api-data-model' // /api/data/{model}
    | 'api-data-record'// /api/data/{model}/{id}
    | 'api-describe'   // /api/describe
    | 'api-describe-model' // /api/describe/{model}
    | 'system'         // /system
    | 'system-file'    // /system/{file}
    | 'unknown';

interface ParsedPath {
    type: PathType;
    model?: string;
    recordId?: string;
    systemFile?: string;
}

/**
 * Parse path into structured components
 */
function parsePath(path: string): ParsedPath {
    const parts = path.split('/').filter(Boolean);

    if (parts.length === 0) {
        return { type: 'root' };
    }

    // /system/...
    if (parts[0] === 'system') {
        if (parts.length === 1) {
            return { type: 'system' };
        }
        return { type: 'system-file', systemFile: parts[1] };
    }

    // /api/...
    if (parts[0] === 'api') {
        if (parts.length === 1) {
            return { type: 'api' };
        }

        // /api/data/...
        if (parts[1] === 'data') {
            if (parts.length === 2) {
                return { type: 'api-data' };
            }
            if (parts.length === 3) {
                return { type: 'api-data-model', model: parts[2] };
            }
            // /api/data/{model}/{id}.json
            const recordId = parts[3].replace(/\.json$/, '');
            return { type: 'api-data-record', model: parts[2], recordId };
        }

        // /api/describe/...
        if (parts[1] === 'describe') {
            if (parts.length === 2) {
                return { type: 'api-describe' };
            }
            const model = parts[2].replace(/\.(yaml|json)$/, '');
            return { type: 'api-describe-model', model };
        }

        return { type: 'unknown' };
    }

    // Legacy paths: /users -> redirect to /api/data/users
    // For backwards compatibility, treat top-level as /api/data/
    if (parts.length === 1) {
        return { type: 'api-data-model', model: parts[0] };
    }
    if (parts.length === 2) {
        const recordId = parts[1].replace(/\.json$/, '');
        return { type: 'api-data-record', model: parts[0], recordId };
    }

    return { type: 'unknown' };
}

/**
 * System pseudo-files
 */
const SYSTEM_FILES = ['version', 'uptime', 'whoami', 'tenant', 'env'];

/**
 * Get system file content
 */
function getSystemFile(file: string, session: Session): string | null {
    switch (file) {
        case 'version':
            return '5.1.0\n';
        case 'uptime': {
            const ms = Date.now() - SERVER_START;
            const secs = Math.floor(ms / 1000);
            const mins = Math.floor(secs / 60);
            const hours = Math.floor(mins / 60);
            const days = Math.floor(hours / 24);
            if (days > 0) return `${days}d ${hours % 24}h ${mins % 60}m\n`;
            if (hours > 0) return `${hours}h ${mins % 60}m ${secs % 60}s\n`;
            if (mins > 0) return `${mins}m ${secs % 60}s\n`;
            return `${secs}s\n`;
        }
        case 'whoami':
            return `${session.username}@${session.tenant}\n`;
        case 'tenant':
            return `${session.tenant}\n`;
        case 'env':
            return Object.entries(session.env)
                .map(([k, v]) => `${k}=${v}`)
                .join('\n') + '\n';
        default:
            return null;
    }
}

/**
 * Command registry
 */
export const commands: Record<string, CommandHandler> = {};

/**
 * pwd - Print working directory
 */
commands['pwd'] = async (session, _args, write) => {
    write(session.cwd + '\n');
};

/**
 * cd - Change directory
 */
commands['cd'] = async (session, args, write) => {
    const target = args[0] || '/';
    const newPath = resolvePath(session.cwd, target);
    const parsed = parsePath(newPath);

    switch (parsed.type) {
        case 'root':
        case 'api':
        case 'api-data':
        case 'api-describe':
        case 'system':
            session.cwd = newPath;
            return;

        case 'api-data-model': {
            // Check if model exists
            const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);
            const result = await api.listModels();
            if (result.success && result.data?.includes(parsed.model!)) {
                // Normalize to /api/data/{model}
                session.cwd = `/api/data/${parsed.model}`;
                return;
            }
            write(`cd: ${target}: No such directory\n`);
            return;
        }

        case 'api-data-record':
        case 'api-describe-model':
        case 'system-file':
            write(`cd: ${target}: Not a directory\n`);
            return;

        default:
            write(`cd: ${target}: No such directory\n`);
    }
};

/**
 * ls - List directory contents
 */
commands['ls'] = async (session, args, write) => {
    const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);

    const longFormat = args.includes('-l');

    // Filter out flags to get path arguments
    const pathArgs = args.filter(a => !a.startsWith('-'));
    const target = pathArgs[0] ? resolvePath(session.cwd, pathArgs[0]) : session.cwd;
    const parsed = parsePath(target);

    switch (parsed.type) {
        case 'root':
            // Show api/ and system/
            if (longFormat) {
                write('total 2\n');
                write('drwxr-xr-x  -  api/\n');
                write('drwxr-xr-x  -  system/\n');
            } else {
                write('api/  system/\n');
            }
            return;

        case 'api':
            // Show data/ and describe/
            if (longFormat) {
                write('total 2\n');
                write('drwxr-xr-x  -  data/\n');
                write('drwxr-xr-x  -  describe/\n');
            } else {
                write('data/  describe/\n');
            }
            return;

        case 'api-data': {
            // List models as directories
            const result = await api.listModels();
            if (!result.success) {
                write(`ls: ${result.error}\n`);
                return;
            }
            const models = result.data || [];
            if (longFormat) {
                write('total ' + models.length + '\n');
                for (const m of models) {
                    write(`drwxr-xr-x  -  ${m}/\n`);
                }
            } else {
                write(models.map(m => m + '/').join('  ') + '\n');
            }
            return;
        }

        case 'api-describe': {
            // List models as schema files
            const result = await api.listModels();
            if (!result.success) {
                write(`ls: ${result.error}\n`);
                return;
            }
            const models = result.data || [];
            if (longFormat) {
                write('total ' + models.length + '\n');
                for (const m of models) {
                    write(`-r--r--r--  -  ${m}.yaml\n`);
                }
            } else {
                write(models.map(m => m + '.yaml').join('  ') + '\n');
            }
            return;
        }

        case 'api-data-model': {
            // List records in model
            const result = await api.listRecords(parsed.model!);
            if (!result.success) {
                write(`ls: ${result.error}\n`);
                return;
            }
            const records = result.data || [];
            if (longFormat) {
                write('total ' + records.length + '\n');
                for (const r of records) {
                    const id = r.id || r._id || 'unknown';
                    const size = JSON.stringify(r).length;
                    write(`-rw-r--r--  ${String(size).padStart(6)}  ${id}.json\n`);
                }
            } else {
                const ids = records.map(r => (r.id || r._id) + '.json');
                if (ids.length > 0) {
                    write(ids.join('  ') + '\n');
                }
            }
            return;
        }

        case 'api-data-record': {
            // Specific record - show file info
            const result = await api.getRecord(parsed.model!, parsed.recordId!);
            if (!result.success) {
                write(`ls: ${target}: No such file\n`);
                return;
            }
            const size = JSON.stringify(result.data).length;
            if (longFormat) {
                write(`-rw-r--r--  ${size}  ${parsed.recordId}.json\n`);
            } else {
                write(`${parsed.recordId}.json\n`);
            }
            return;
        }

        case 'api-describe-model': {
            // Show schema file info
            const result = await api.describeModel(parsed.model!);
            if (!result.success) {
                write(`ls: ${target}: No such file\n`);
                return;
            }
            const size = JSON.stringify(result.data).length;
            if (longFormat) {
                write(`-r--r--r--  ${size}  ${parsed.model}.yaml\n`);
            } else {
                write(`${parsed.model}.yaml\n`);
            }
            return;
        }

        case 'system':
            // List system pseudo-files
            if (longFormat) {
                write('total ' + SYSTEM_FILES.length + '\n');
                for (const f of SYSTEM_FILES) {
                    write(`-r--r--r--  -  ${f}\n`);
                }
            } else {
                write(SYSTEM_FILES.join('  ') + '\n');
            }
            return;

        case 'system-file': {
            const content = getSystemFile(parsed.systemFile!, session);
            if (!content) {
                write(`ls: ${target}: No such file\n`);
                return;
            }
            if (longFormat) {
                write(`-r--r--r--  ${content.length}  ${parsed.systemFile}\n`);
            } else {
                write(`${parsed.systemFile}\n`);
            }
            return;
        }

        default:
            write(`ls: ${target}: No such file or directory\n`);
    }
};

/**
 * cat - Display file contents
 */
commands['cat'] = async (session, args, write) => {
    if (args.length === 0) {
        write('cat: missing operand\n');
        return;
    }

    const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);

    for (const arg of args.filter(a => !a.startsWith('-'))) {
        const target = resolvePath(session.cwd, arg);
        const parsed = parsePath(target);

        switch (parsed.type) {
            case 'root':
            case 'api':
            case 'api-data':
            case 'api-describe':
            case 'api-data-model':
            case 'system':
                write(`cat: ${arg}: Is a directory\n`);
                continue;

            case 'system-file': {
                const content = getSystemFile(parsed.systemFile!, session);
                if (!content) {
                    write(`cat: ${arg}: No such file\n`);
                    continue;
                }
                write(content);
                continue;
            }

            case 'api-describe-model': {
                const result = await api.describeModel(parsed.model!);
                if (!result.success) {
                    write(`cat: ${arg}: ${result.error}\n`);
                    continue;
                }
                // Output as YAML-like format
                write(`# Schema: ${parsed.model}\n`);
                write(formatAsYaml(result.data));
                continue;
            }

            case 'api-data-record': {
                const result = await api.getRecord(parsed.model!, parsed.recordId!);
                if (!result.success) {
                    write(`cat: ${arg}: ${result.error}\n`);
                    continue;
                }
                write(JSON.stringify(result.data, null, 2) + '\n');
                continue;
            }

            default:
                write(`cat: ${arg}: No such file\n`);
        }
    }
};

/**
 * Format object as simple YAML
 */
function formatAsYaml(obj: any, indent = 0): string {
    const prefix = '  '.repeat(indent);
    let result = '';

    if (Array.isArray(obj)) {
        for (const item of obj) {
            if (typeof item === 'object' && item !== null) {
                result += `${prefix}-\n${formatAsYaml(item, indent + 1)}`;
            } else {
                result += `${prefix}- ${item}\n`;
            }
        }
    } else if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
                result += `${prefix}${key}:\n${formatAsYaml(value, indent + 1)}`;
            } else {
                result += `${prefix}${key}: ${value}\n`;
            }
        }
    } else {
        result += `${prefix}${obj}\n`;
    }

    return result;
}

/**
 * rm - Remove records
 */
commands['rm'] = async (session, args, write) => {
    if (args.length === 0) {
        write('rm: missing operand\n');
        return;
    }

    const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);
    const force = args.includes('-f');
    const targets = args.filter(a => !a.startsWith('-'));

    for (const arg of targets) {
        const target = resolvePath(session.cwd, arg);
        const parsed = parsePath(target);

        if (parsed.type !== 'api-data-record') {
            if (!force) {
                write(`rm: ${arg}: Cannot remove (not a data record)\n`);
            }
            continue;
        }

        const result = await api.deleteRecord(parsed.model!, parsed.recordId!);
        if (!result.success) {
            if (!force) {
                write(`rm: ${arg}: ${result.error}\n`);
            }
            continue;
        }
        write(`Deleted: /api/data/${parsed.model}/${parsed.recordId}.json\n`);
    }
};

/**
 * touch / echo > - Create or update record
 */
commands['touch'] = async (session, args, write) => {
    if (args.length === 0) {
        write('touch: missing operand\n');
        return;
    }

    const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);
    const target = resolvePath(session.cwd, args[0]);
    const parsed = parsePath(target);

    // Can only touch in model directories
    if (parsed.type !== 'api-data-model' && parsed.type !== 'api-data-record') {
        write(`touch: ${args[0]}: Cannot create here\n`);
        return;
    }

    const model = parsed.model!;

    // Create empty record
    const result = await api.createRecord(model, {});
    if (!result.success) {
        write(`touch: ${result.error}\n`);
        return;
    }
    const id = result.data?.id || result.data?._id;
    write(`Created: /api/data/${model}/${id}.json\n`);
};

/**
 * echo - Output text (or create record with redirect)
 */
commands['echo'] = async (session, args, write) => {
    // Simple echo without redirect
    write(args.join(' ') + '\n');
};

/**
 * mkdir - Create model (if API supports it)
 */
commands['mkdir'] = async (session, args, write) => {
    write('mkdir: Model creation not supported via TTY\n');
    write('Use the web interface or API directly.\n');
};

/**
 * find - Search for records
 */
commands['find'] = async (session, args, write) => {
    const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);

    // Parse find arguments
    let searchPath = session.cwd;
    let namePattern: string | undefined;
    let typeFilter: string | undefined;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-name' && args[i + 1]) {
            namePattern = args[++i];
        } else if (args[i] === '-type' && args[i + 1]) {
            typeFilter = args[++i];
        } else if (!args[i].startsWith('-')) {
            searchPath = resolvePath(session.cwd, args[i]);
        }
    }

    const { model } = parsePath(searchPath);

    if (!model) {
        // Search all models
        const modelsResult = await api.listModels();
        if (!modelsResult.success) {
            write(`find: ${modelsResult.error}\n`);
            return;
        }

        for (const m of modelsResult.data || []) {
            if (typeFilter === 'd') {
                write(`/${m}/\n`);
                continue;
            }
            const records = await api.listRecords(m);
            if (records.success) {
                for (const r of records.data || []) {
                    const id = r.id || r._id;
                    const json = JSON.stringify(r);
                    if (!namePattern || json.includes(namePattern)) {
                        write(`/${m}/${id}.json\n`);
                    }
                }
            }
        }
    } else {
        // Search specific model
        const records = await api.listRecords(model);
        if (!records.success) {
            write(`find: ${records.error}\n`);
            return;
        }
        for (const r of records.data || []) {
            const id = r.id || r._id;
            const json = JSON.stringify(r);
            if (!namePattern || json.includes(namePattern)) {
                write(`/${model}/${id}.json\n`);
            }
        }
    }
};

/**
 * grep - Search record contents
 */
commands['grep'] = async (session, args, write) => {
    if (args.length === 0) {
        write('grep: missing pattern\n');
        return;
    }

    const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);
    const pattern = args[0];
    const targets = args.slice(1);

    const searchPath = targets.length > 0
        ? resolvePath(session.cwd, targets[0])
        : session.cwd;

    const { model } = parsePath(searchPath);

    if (!model) {
        write('grep: Must specify a model directory\n');
        return;
    }

    const records = await api.listRecords(model);
    if (!records.success) {
        write(`grep: ${records.error}\n`);
        return;
    }

    const regex = new RegExp(pattern, 'i');
    for (const r of records.data || []) {
        const json = JSON.stringify(r);
        if (regex.test(json)) {
            const id = r.id || r._id;
            write(`/${model}/${id}.json: ${json}\n`);
        }
    }
};

/**
 * head - Show first N records
 */
commands['head'] = async (session, args, write) => {
    const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);

    let n = 10;
    let target = session.cwd;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n' && args[i + 1]) {
            n = parseInt(args[++i], 10);
        } else if (!args[i].startsWith('-')) {
            target = resolvePath(session.cwd, args[i]);
        }
    }

    const { model } = parsePath(target);
    if (!model) {
        write('head: Cannot head root directory\n');
        return;
    }

    const result = await api.listRecords(model, n);
    if (!result.success) {
        write(`head: ${result.error}\n`);
        return;
    }

    for (const r of result.data || []) {
        write(JSON.stringify(r) + '\n');
    }
};

/**
 * wc - Count records
 */
commands['wc'] = async (session, args, write) => {
    const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);
    const target = args[0] ? resolvePath(session.cwd, args[0]) : session.cwd;
    const { model } = parsePath(target);

    if (!model) {
        const result = await api.listModels();
        write(`${result.data?.length || 0} models\n`);
        return;
    }

    const result = await api.listRecords(model);
    write(`${result.data?.length || 0} records\n`);
};

/**
 * whoami - Show current user
 */
commands['whoami'] = async (session, _args, write) => {
    write(`${session.username}@${session.tenant}\n`);
};

/**
 * env - Show environment
 */
commands['env'] = async (session, _args, write) => {
    for (const [key, value] of Object.entries(session.env)) {
        write(`${key}=${value}\n`);
    }
};

/**
 * export - Set environment variable
 */
commands['export'] = async (session, args, write) => {
    for (const arg of args) {
        const [key, ...rest] = arg.split('=');
        if (key && rest.length > 0) {
            session.env[key] = rest.join('=');
        }
    }
};

/**
 * clear - Clear screen
 */
commands['clear'] = async (_session, _args, write) => {
    write('\x1b[2J\x1b[H');
};

/**
 * help - Show available commands
 */
commands['help'] = async (_session, _args, write) => {
    write(`
Available commands:

Navigation:
  pwd                   Print working directory
  cd <path>             Change directory
  ls [-l] [path]        List contents

File operations:
  cat <file>            Display record/schema/system info
  rm [-f] <file>        Delete record
  touch <file>          Create empty record

Search:
  find [path] -name <pattern>    Search for records
  grep <pattern> [path]          Search record contents
  head [-n N] [path]             Show first N records
  wc [path]                      Count records/models

Session:
  whoami                Show current user
  env                   Show environment
  export KEY=value      Set environment variable
  clear                 Clear screen
  exit, logout          End session
  help                  Show this help

Filesystem:
  /                          Root
  /api/                      API endpoints
  /api/data/                 Models list
  /api/data/{model}/         Records in model
  /api/data/{model}/{id}     Record (JSON)
  /api/describe/             Schema list
  /api/describe/{model}      Model schema (YAML)
  /system/                   System info
  /system/version            API version
  /system/uptime             Server uptime
  /system/whoami             Current user
  /system/tenant             Current tenant
  /system/env                Environment vars

`);
};

/**
 * exit/logout - End session
 */
commands['exit'] = async (session, _args, write) => {
    write('Goodbye!\n');
    session.state = 'AWAITING_USERNAME';
    session.token = '';
    session.cwd = '/';
};
commands['logout'] = commands['exit'];
commands['quit'] = commands['exit'];
