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
import { tree } from './tree.js';
import { grep } from './grep.js';
import { xargs } from './xargs.js';
import { mount } from './mount.js';
import { umount } from './umount.js';

// File operations
import { cat } from './cat.js';
import { head } from './head.js';
import { tail } from './tail.js';
import { jq } from './jq.js';
import { touch } from './touch.js';
import { rm } from './rm.js';
import { mv } from './mv.js';
import { cp } from './cp.js';
import { tee } from './tee.js';

// Directory operations
import { mkdir } from './mkdir.js';
import { rmdir } from './rmdir.js';

// Query commands
import { select } from './select.js';
import { describe } from './describe.js';

// Text processing
import { sort } from './sort.js';
import { uniq } from './uniq.js';
import { wc } from './wc.js';
import { cut } from './cut.js';
import { tr } from './tr.js';

// Info commands
import { echo } from './echo.js';
import { whoami } from './whoami.js';
import { env } from './env.js';
import { date } from './date.js';
import { history } from './history.js';
import { export as exportCmd } from './export.js';

// Session commands
import { clear } from './clear.js';
import { help } from './help.js';
import { man } from './man.js';
import { exit, logout, quit } from './exit.js';

// Process commands
import { sleep } from './sleep.js';
import { timeout, setCommandRegistry } from './timeout.js';
import { ps } from './ps.js';
import { kill } from './kill.js';
import { ping } from './ping.js';

// Re-export types
export type { CommandHandler } from './shared.js';
export { formatMode, formatEntry } from './shared.js';

// Re-export individual commands
export { pwd } from './pwd.js';
export { cd } from './cd.js';
export { ls } from './ls.js';
export { find } from './find.js';
export { tree } from './tree.js';
export { grep } from './grep.js';
export { xargs } from './xargs.js';
export { mount } from './mount.js';
export { umount } from './umount.js';
export { cat } from './cat.js';
export { head } from './head.js';
export { tail } from './tail.js';
export { jq } from './jq.js';
export { touch } from './touch.js';
export { rm } from './rm.js';
export { mv } from './mv.js';
export { cp } from './cp.js';
export { tee } from './tee.js';
export { sort } from './sort.js';
export { uniq } from './uniq.js';
export { wc } from './wc.js';
export { cut } from './cut.js';
export { tr } from './tr.js';
export { mkdir } from './mkdir.js';
export { rmdir } from './rmdir.js';
export { select } from './select.js';
export { describe } from './describe.js';
export { echo } from './echo.js';
export { whoami } from './whoami.js';
export { env } from './env.js';
export { date } from './date.js';
export { history } from './history.js';
export { export as exportCmd } from './export.js';
export { clear } from './clear.js';
export { help } from './help.js';
export { man } from './man.js';
export { exit, logout, quit } from './exit.js';
export { sleep } from './sleep.js';
export { timeout } from './timeout.js';
export { ps } from './ps.js';
export { kill } from './kill.js';
export { ping } from './ping.js';

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
    tree,
    grep,
    xargs,
    mount,
    umount,

    // File operations
    cat,
    head,
    tail,
    jq,
    touch,
    rm,
    mv,
    cp,
    tee,

    // Directory operations
    mkdir,
    rmdir,

    // Query commands
    select,
    describe,

    // Text processing
    sort,
    uniq,
    wc,
    cut,
    tr,

    // Info commands
    echo,
    whoami,
    env,
    date,
    history,
    export: exportCmd,

    // Session commands
    clear,
    help,
    man,
    exit,
    logout,
    quit,

    // Process commands
    sleep,
    timeout,
    ps,
    kill,
    ping,
};

// Initialize timeout command with registry
setCommandRegistry(commands);
