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
import { ln } from './ln.js';
import { chmod } from './chmod.js';
import { tee } from './tee.js';

// Directory operations
import { mkdir } from './mkdir.js';
import { rmdir } from './rmdir.js';

// Query commands
import { select } from './select.js';
import { describe } from './describe.js';
import { insert } from './insert.js';
import { update } from './update.js';
import { delete_ } from './delete.js';
import { count } from './count.js';
import { dump } from './dump.js';
import { restore } from './restore.js';
import { curl } from './curl.js';

// Text processing
import { sort } from './sort.js';
import { uniq } from './uniq.js';
import { wc } from './wc.js';
import { cut } from './cut.js';
import { tr } from './tr.js';
import { sed } from './sed.js';

// Output formatting
import { printf } from './printf.js';

// File comparison
import { diff } from './diff.js';
import { stat } from './stat.js';
import { file } from './file.js';
import { readlink } from './readlink.js';
import { realpath } from './realpath.js';
import { mktemp } from './mktemp.js';
import { du } from './du.js';
import { df } from './df.js';

// Info commands
import { echo } from './echo.js';
import { whoami } from './whoami.js';
import { passwd } from './passwd.js';
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
import { time, setTimeCommandRegistry } from './time.js';
import { watch, setWatchCommandRegistry } from './watch.js';
import { ps } from './ps.js';
import { kill } from './kill.js';
import { ping } from './ping.js';

// Utilities
import { true_ } from './true.js';
import { false_ } from './false.js';
import { seq } from './seq.js';
import { yes } from './yes.js';
import { which } from './which.js';

// Scripting
import { source, dot } from './source.js';
import { test, bracket } from './test.js';
import { read } from './read.js';
import { basename } from './basename.js';
import { dirname } from './dirname.js';

// Networking
import { nc } from './nc.js';

// Hashing
import { md5sum } from './md5sum.js';
import { shasum } from './shasum.js';

// Subcommand groups
import { git } from './git/index.js';
import { keys } from './keys/index.js';

// Deprecated stubs
import { sshKey } from './ssh-key.js';

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
export { ln } from './ln.js';
export { chmod } from './chmod.js';
export { tee } from './tee.js';
export { sort } from './sort.js';
export { uniq } from './uniq.js';
export { wc } from './wc.js';
export { cut } from './cut.js';
export { tr } from './tr.js';
export { sed } from './sed.js';
export { printf } from './printf.js';
export { diff } from './diff.js';
export { stat } from './stat.js';
export { file } from './file.js';
export { readlink } from './readlink.js';
export { realpath } from './realpath.js';
export { mktemp } from './mktemp.js';
export { du } from './du.js';
export { df } from './df.js';
export { mkdir } from './mkdir.js';
export { rmdir } from './rmdir.js';
export { select } from './select.js';
export { describe } from './describe.js';
export { insert } from './insert.js';
export { update } from './update.js';
export { delete_ } from './delete.js';
export { count } from './count.js';
export { dump } from './dump.js';
export { restore } from './restore.js';
export { curl } from './curl.js';
export { echo } from './echo.js';
export { whoami } from './whoami.js';
export { passwd } from './passwd.js';
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
export { time } from './time.js';
export { watch } from './watch.js';
export { ps } from './ps.js';
export { kill } from './kill.js';
export { ping } from './ping.js';
export { true_ } from './true.js';
export { false_ } from './false.js';
export { seq } from './seq.js';
export { yes } from './yes.js';
export { which } from './which.js';
export { source, dot } from './source.js';
export { test, bracket } from './test.js';
export { read } from './read.js';
export { basename } from './basename.js';
export { dirname } from './dirname.js';
export { nc } from './nc.js';
export { md5sum } from './md5sum.js';
export { shasum } from './shasum.js';
export { git } from './git/index.js';
export { keys } from './keys/index.js';
export { sshKey } from './ssh-key.js';

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
    ln,
    chmod,
    tee,

    // Directory operations
    mkdir,
    rmdir,

    // Query commands
    select,
    describe,
    insert,
    update,
    delete: delete_,
    count,
    dump,
    restore,
    curl,

    // Text processing
    sort,
    uniq,
    wc,
    cut,
    tr,
    sed,

    // Output formatting
    printf,

    // File comparison and info
    diff,
    stat,
    file,
    readlink,
    realpath,
    mktemp,
    du,
    df,

    // Info commands
    echo,
    whoami,
    passwd,
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
    time,
    watch,
    ps,
    kill,
    ping,

    // Utilities
    true: true_,
    false: false_,
    seq,
    yes,
    which,

    // Scripting
    source,
    '.': dot,
    test,
    '[': bracket,
    read,
    basename,
    dirname,

    // Networking
    nc,

    // Hashing
    md5sum,
    shasum,

    // Subcommand groups
    git,
    keys,

    // Deprecated stubs
    'ssh-key': sshKey,
};

// Initialize commands that need the registry
setCommandRegistry(commands);
setTimeCommandRegistry(commands);
setWatchCommandRegistry(commands);
