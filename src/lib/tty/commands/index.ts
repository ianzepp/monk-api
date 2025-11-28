/**
 * TTY Commands Index
 *
 * Re-exports all commands and builds the command registry.
 */

import type { CommandHandler } from './shared.js';

// Navigation
import { pwd } from './pwd.js';
import { cd } from './cd.js';

// Listing
import { ls } from './ls.js';
import { find } from './find.js';
import { grep } from './grep.js';
import { xargs } from './xargs.js';
import { mount } from './mount.js';

// File operations
import { cat } from './cat.js';
import { jq } from './jq.js';
import { touch } from './touch.js';
import { rm } from './rm.js';
import { mv } from './mv.js';

// Directory operations
import { mkdir } from './mkdir.js';
import { rmdir } from './rmdir.js';

// Query commands
import { select } from './select.js';
import { describe } from './describe.js';

// Info commands
import { echo } from './echo.js';
import { whoami } from './whoami.js';
import { env } from './env.js';
import { export as exportCmd } from './export.js';

// Session commands
import { clear } from './clear.js';
import { help } from './help.js';
import { man } from './man.js';
import { exit, logout, quit } from './exit.js';

// Re-export types
export type { CommandHandler } from './shared.js';
export { formatMode, formatEntry } from './shared.js';

// Re-export individual commands
export { pwd } from './pwd.js';
export { cd } from './cd.js';
export { ls } from './ls.js';
export { find } from './find.js';
export { grep } from './grep.js';
export { xargs } from './xargs.js';
export { mount } from './mount.js';
export { cat } from './cat.js';
export { jq } from './jq.js';
export { touch } from './touch.js';
export { rm } from './rm.js';
export { mv } from './mv.js';
export { mkdir } from './mkdir.js';
export { rmdir } from './rmdir.js';
export { select } from './select.js';
export { describe } from './describe.js';
export { echo } from './echo.js';
export { whoami } from './whoami.js';
export { env } from './env.js';
export { export as exportCmd } from './export.js';
export { clear } from './clear.js';
export { help } from './help.js';
export { man } from './man.js';
export { exit, logout, quit } from './exit.js';

/**
 * Command registry
 */
export const commands: Record<string, CommandHandler> = {
    // Navigation
    pwd,
    cd,

    // Listing
    ls,
    find,
    grep,
    xargs,
    mount,

    // File operations
    cat,
    jq,
    touch,
    rm,
    mv,

    // Directory operations
    mkdir,
    rmdir,

    // Query commands
    select,
    describe,

    // Info commands
    echo,
    whoami,
    env,
    export: exportCmd,

    // Session commands
    clear,
    help,
    man,
    exit,
    logout,
    quit,
};
