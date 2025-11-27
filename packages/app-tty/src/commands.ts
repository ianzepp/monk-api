/**
 * Shell Commands
 *
 * Unix-style commands mapped to Monk API operations.
 */

import type { Session } from './transport.js';
import { ApiClient } from './api-client.js';
import { resolvePath } from './parser.js';

/**
 * Command handler function signature
 */
export type CommandHandler = (
    session: Session,
    args: string[],
    write: (text: string) => void
) => Promise<void>;

/**
 * Parse current path into model and record ID
 */
function parsePath(path: string): { model: string | null; recordId: string | null } {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) {
        return { model: null, recordId: null };
    }
    if (parts.length === 1) {
        return { model: parts[0], recordId: null };
    }
    // /users/123.json -> model=users, recordId=123
    const recordPart = parts[parts.length - 1];
    const recordId = recordPart.replace(/\.json$/, '');
    return { model: parts[0], recordId };
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

    // Validate path exists
    const { model } = parsePath(newPath);

    if (newPath === '/') {
        session.cwd = '/';
        return;
    }

    if (model) {
        // Check if model exists
        const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);
        const result = await api.listModels();
        if (result.success && result.data?.includes(model)) {
            session.cwd = '/' + model;
            return;
        }
        write(`cd: ${target}: No such directory\n`);
        return;
    }

    session.cwd = newPath;
};

/**
 * ls - List directory contents
 */
commands['ls'] = async (session, args, write) => {
    const api = new ApiClient(session.env['API_URL'] || 'http://localhost:9001', session);

    const longFormat = args.includes('-l');
    const showAll = args.includes('-a');

    // Filter out flags to get path arguments
    const pathArgs = args.filter(a => !a.startsWith('-'));
    const target = pathArgs[0] ? resolvePath(session.cwd, pathArgs[0]) : session.cwd;
    const { model, recordId } = parsePath(target);

    // Root directory - list models
    if (!model) {
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

    // Model directory - list records
    if (!recordId) {
        const result = await api.listRecords(model);
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
            write(ids.join('  ') + '\n');
        }
        return;
    }

    // Specific record - show file info
    const result = await api.getRecord(model, recordId);
    if (!result.success) {
        write(`ls: ${target}: No such file\n`);
        return;
    }
    const size = JSON.stringify(result.data).length;
    if (longFormat) {
        write(`-rw-r--r--  ${size}  ${recordId}.json\n`);
    } else {
        write(`${recordId}.json\n`);
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
        const { model, recordId } = parsePath(target);

        if (!model || !recordId) {
            write(`cat: ${arg}: Is a directory\n`);
            continue;
        }

        const result = await api.getRecord(model, recordId);
        if (!result.success) {
            write(`cat: ${arg}: ${result.error}\n`);
            continue;
        }

        write(JSON.stringify(result.data, null, 2) + '\n');
    }
};

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
        const { model, recordId } = parsePath(target);

        if (!model || !recordId) {
            write(`rm: ${arg}: Is a directory (use rmdir)\n`);
            continue;
        }

        const result = await api.deleteRecord(model, recordId);
        if (!result.success) {
            if (!force) {
                write(`rm: ${arg}: ${result.error}\n`);
            }
            continue;
        }
        write(`Deleted: ${target}\n`);
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
    const { model } = parsePath(target);

    if (!model) {
        write(`touch: ${args[0]}: Cannot create in root\n`);
        return;
    }

    // Create empty record
    const result = await api.createRecord(model, {});
    if (!result.success) {
        write(`touch: ${result.error}\n`);
        return;
    }
    const id = result.data?.id || result.data?._id;
    write(`Created: /${model}/${id}.json\n`);
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
  cat <file>            Display record
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

Paths:
  /                     Root (list all models)
  /users                Model directory
  /users/123.json       Record file
  .                     Current directory
  ..                    Parent directory

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
