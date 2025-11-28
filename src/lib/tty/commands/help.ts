/**
 * help - Show available commands
 */

import type { CommandHandler } from './shared.js';

export const help: CommandHandler = async (_session, _fs, _args, write) => {
    write('Available commands:\n');
    write('  Navigation:  cd, pwd, ls\n');
    write('  Files:       cat, touch, rm, mv\n');
    write('  Directories: mkdir, rmdir\n');
    write('  Info:        echo, whoami, env, export\n');
    write('  Session:     clear, help, exit\n');
    write('\nPaths:\n');
    write('  /api/data      - Model records (CRUD)\n');
    write('  /api/describe  - Model schemas\n');
    write('  /api/find      - Saved queries\n');
    write('  /api/trashed   - Soft-deleted records\n');
    write('  /system        - System info\n');
    write('  /home, /tmp    - File storage\n');
};
