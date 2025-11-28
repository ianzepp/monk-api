# TTY System

A Linux-like terminal interface for Monk, providing shell access over Telnet and SSH.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Transport Layer                         │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │  Telnet Server  │          │   SSH Server    │          │
│  │  (port 2323)    │          │   (port 2222)   │          │
│  └────────┬────────┘          └────────┬────────┘          │
│           │                            │                    │
│           └──────────┬─────────────────┘                    │
│                      ▼                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Session Handler                         │   │
│  │  - Authentication state machine                      │   │
│  │  - Command parsing and dispatch                      │   │
│  │  - Pipeline execution (pipes, redirects)             │   │
│  │  - Background process spawning                       │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Commands                            │   │
│  │  ls, cd, cat, ping, ps, kill, select, describe...   │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Virtual Filesystem                      │   │
│  │  /api/data, /api/describe, /proc, /home, /tmp...    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Files

| File | Description |
|------|-------------|
| `types.ts` | Core interfaces: Session, TTYStream, CommandIO, ParsedCommand |
| `session-handler.ts` | Authentication, command execution, pipeline handling |
| `parser.ts` | Command parsing, variable expansion, path resolution |
| `commands.ts` | Re-exports from commands/ directory |
| `commands/*.ts` | Individual command implementations |
| `man/*` | Manual pages for commands |

## Session Lifecycle

1. **Connection** - Telnet/SSH server creates a `Session` object
2. **Authentication** - State machine: `AWAITING_USERNAME` → `AWAITING_PASSWORD` → `AUTHENTICATED`
3. **Shell Process** - On login, a `monksh` daemon process is registered (visible in `ps`)
4. **Command Loop** - Parse input, execute commands, print prompt
5. **Disconnect** - On `exit`, CTRL+D, or connection drop, shell process is terminated

## Commands

### Navigation
- `pwd` - Print working directory
- `cd <path>` - Change directory

### Filesystem
- `ls [-la] [path]` - List directory contents
- `tree [-dL] [path]` - Display directory tree
- `cat <file>` - Display file contents
- `head [-n N] [file]` - Show first N lines
- `tail [-n N] [file]` - Show last N lines
- `touch <file>` - Create empty file
- `mkdir <dir>` - Create directory
- `rm <file>` - Remove file
- `rmdir <dir>` - Remove directory
- `mv <src> <dst>` - Move/rename
- `cp [-r] <src> <dst>` - Copy files/directories
- `find [path]` - Recursively list files

### Mounts
- `mount` - List mounted filesystems
- `mount -t local <src> <dst>` - Mount host directory
- `umount <path>` - Unmount filesystem

### Data Operations
- `select <fields> [from <path>]` - Query records with field selection
- `describe <model>` - Show model schema

### Process Management
- `ps [-a]` - List processes (`-a` includes dead/zombie)
- `kill <pid>` - Terminate a process
- `ping [-c N] [-i S] <target>` - HTTP ping (local API or external URL)
- `sleep <duration>` - Pause execution
- `timeout <duration> <cmd>` - Run command with timeout

### Text Processing
- `grep [-iv] <pattern>` - Filter lines by regex
- `sort [-rnu]` - Sort lines
- `uniq [-cd]` - Filter adjacent duplicate lines
- `wc [-lwc]` - Word, line, character count
- `cut -d<delim> -f<fields>` - Extract fields
- `tr <set1> <set2>` - Translate characters
- `jq <filter>` - JSON processing

### Environment
- `echo <text>` - Print text (supports $VAR expansion)
- `env` - Show environment variables
- `export VAR=value` - Set environment variable
- `whoami` - Show current user
- `date [-uI] [+format]` - Show date/time
- `history [-c] [N]` - Show command history

### Utilities
- `xargs <cmd>` - Build commands from stdin
- `tee [-a] <file>` - Write to stdout and file

### Session
- `help` - Show available commands
- `man <cmd>` - Show manual page
- `clear` - Clear screen
- `exit` / `logout` / `quit` - End session

## Pipes and Redirects

Standard shell syntax is supported:

```bash
# Pipes
cat /api/data/users | grep admin | jq .email

# Output redirect
select id, name from users > /tmp/users.txt

# Append redirect
echo "log entry" >> /var/log/app.log

# Input redirect
cat < /tmp/input.txt

# Tee (write to file and pass through)
find . | tee /tmp/files.txt | wc -l
```

## Background Processes

Commands can be run in the background with `&`:

```bash
ping /health &
# [1] 42

ps
# Shows ping running with ppid pointing to your shell

kill 42
# Terminates the background process
```

Background process output is captured to `/tmp/.proc/{pid}/stdout` and `/tmp/.proc/{pid}/stderr`.

## Host Filesystem Mounts

Mount directories from the host system into the virtual filesystem:

```bash
# Mount a host directory (use absolute paths)
mount -t local /Users/me/projects /projects

# Mount read-only
mount -t local -r /var/log /logs

# List mounts
mount

# Unmount
umount /projects
```

Note: The `~` character expands to the virtual home directory, not the host home. Use absolute paths for host mounts.

## Process Table

The process system is modeled after Linux `/proc`:

| State | Meaning |
|-------|---------|
| R | Running |
| S | Sleeping |
| Z | Zombie (killed/crashed) |
| T | Stopped |
| X | Dead (exited normally) |

Process types:
- `daemon` - Shell sessions (monksh)
- `command` - Background commands
- `script` - Script execution (future)
- `cron` - Scheduled jobs (future)

## /proc Filesystem

The process table is exposed as a virtual filesystem:

```bash
ls /proc
# 1/  5/  7/

cat /proc/7/status
# Name:    ping
# State:   R (running)
# Pid:     7
# PPid:    5
# ...

cat /proc/7/cmdline
# ping /health
```

## Signal Handling

- **CTRL+C** - Interrupts foreground command (if running) or clears input
- **CTRL+D** - Disconnects session

Commands must check `io.signal?.aborted` in loops to be interruptible:

```typescript
while (running) {
    if (io.signal?.aborted) break;
    // ... do work
}
```

## Variable Expansion

The parser supports shell-style variable expansion:

```bash
echo $USER              # Simple variable
echo ${HOME}            # Braced variable
echo ${FOO:-default}    # Variable with default
cd ~                    # Home directory
```

## Adding New Commands

1. Create `src/lib/tty/commands/mycommand.ts`:

```typescript
import type { CommandHandler } from './shared.js';

export const mycommand: CommandHandler = async (session, fs, args, io) => {
    // Check for abort signal in loops
    if (io.signal?.aborted) return 130;

    // Write output
    io.stdout.write('Hello\n');

    // Return exit code (0 = success)
    return 0;
};
```

2. Register in `src/lib/tty/commands/index.ts`:

```typescript
import { mycommand } from './mycommand.js';
// ... add to imports, exports, and commands registry
```

3. Optionally add a man page at `src/lib/tty/man/mycommand`

## Environment Variables

Set automatically on login:

| Variable | Description |
|----------|-------------|
| `USER` | Username |
| `TENANT` | Tenant name |
| `ACCESS` | Access level (root/full/edit/read) |
| `HOME` | Home directory (/home/{user}) |
| `TERM` | Terminal type (xterm) |
| `SHELL` | Shell path (/bin/monksh) |

## Configuration Files

- `~/.profile` - Executed on login (export commands, etc.)
- `~/.history` - Command history (persisted)
