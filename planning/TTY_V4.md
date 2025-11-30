# TTY Session Handler Refactor (V4)

**Status: COMPLETED**

## Overview

Refactored the monolithic `session-handler.ts` (1191 lines) into focused modules with clear responsibilities.

## Results

| File | Lines | Responsibility |
|------|-------|----------------|
| `session-handler.ts` | 246 | Input handling, escape sequences, history nav |
| `executor.ts` | 588 | Command execution, pipes, &&/||, globs, background |
| `auth.ts` | 316 | Login/register state machine |
| `profile.ts` | 184 | Home dir, history, .profile, mounts |
| **Total** | **1334** | (was 1191 - slight increase due to better separation) |

## Key Design Decisions

### 1. Transaction per line (not per script)
- `source setup.sh` with 10 lines = 10 transactions
- If line 5 fails, lines 1-4 are committed
- Matches traditional shell behavior

### 2. Background execution should be first-class
- Currently: no globs, only first pipeline command, no &&/||
- Should be: full execution, just output goes to file instead of TTY

### 3. Source should use the same executor
- Remove the mini-executor in `source.ts`
- Call the main executor for each line
- Gets all features for free (&&, ||, globs, pipes)

## Current Flow

```
handleInput()
    └─> processLine()
        └─> [AUTHENTICATED case]
            └─> executeCommand()
                ├─> parseCommand()
                ├─> history management
                ├─> background? → executeBackground()
                └─> foreground:
                    ├─> commandTreeNeedsTransaction()
                    ├─> runTransaction()
                    │   └─> applySessionMounts()
                    └─> executeCommandChain()
                        ├─> buildPipeline() → variable expansion
                        ├─> expandPipelineGlobs()
                        └─> executePipeline()
                            ├─> handleInputRedirect()
                            ├─> handler(session, fs, args, io)
                            └─> handleOutputRedirect()
```

## Proposed Architecture

```
src/lib/tty/
├── session-handler.ts   (~300 lines) - Input handling only
├── auth.ts              (~200 lines) - Authentication state machine
├── executor.ts          (~400 lines) - Command execution engine
├── profile.ts           (~150 lines) - Session initialization
├── parser.ts            (existing)   - Command parsing
├── types.ts             (existing)   - Type definitions
└── commands/            (existing)   - Command implementations
```

### session-handler.ts (~300 lines)

Input handling and dispatch only:

```typescript
// Public exports
export function handleInput(stream, session, data, config, echo)
export function handleInterrupt(stream, session)
export function sendWelcome(stream, config)
export function printPrompt(stream, session)

// Internal
function processLine(stream, session, line, config)  // delegates to auth or executor
function handleHistoryUp(stream, session)
function handleHistoryDown(stream, session)
function replaceLine(stream, session, newContent)
function writeToStream(stream, text)
```

### auth.ts (~200 lines)

Authentication state machine:

```typescript
// Called by processLine() for non-AUTHENTICATED states
export async function handleAuthState(stream, session, line, config)

// Internal
async function handleLogin(stream, session, line)
async function handlePassword(stream, session, line)
async function handleRegisterTenant(stream, session, line)
async function handleRegisterUsername(stream, session, line)
async function handleRegisterPassword(stream, session, line, config)
async function handleRegisterConfirm(stream, session, line, config)
async function completeLogin(stream, session, systemInit, user)
async function completeRegistration(stream, session, config)
```

### executor.ts (~400 lines)

Command execution engine - **the core**:

```typescript
// MAIN ENTRY POINT - used by interactive, source, and profile
export async function executeLine(
    session: Session,
    input: string,
    io: CommandIO,
    options?: {
        addToHistory?: boolean;      // default: false
        useTransaction?: boolean;    // default: true
        fs?: FS;                     // if already in transaction
    }
): Promise<number>

// Internal execution flow
async function executeChain(session, parsed, fs, io, signal): Promise<number>
async function executePipeline(session, pipeline, fs, io, signal): Promise<number>
async function executeBackground(session, parsed, io): Promise<number>

// Expansion
function buildPipeline(parsed, env): ParsedCommand[]
async function expandGlobs(args, cwd, fs): Promise<string[]>

// Helpers
function commandTreeNeedsTransaction(parsed): boolean
async function handleInputRedirect(fs, path, cwd, io): Promise<boolean>
async function handleOutputRedirect(fs, path, cwd, io, append): Promise<void>
function createIO(signal?): CommandIO
async function collectStream(stream): Promise<string>
```

### profile.ts (~150 lines)

Session initialization:

```typescript
// Called after successful login
export async function initializeSession(stream, session)

// Internal
async function ensureHomeDirectory(session, home)
async function loadProfile(stream, session)  // uses executeLine()
async function loadHistory(session)
export async function saveHistory(session)

// Called per-transaction
export function applySessionMounts(session, fs)
```

## Changes to Existing Code

### source.ts - Simplify

```typescript
// OLD: has its own execution loop
for (const line of lines) {
    const parsed = parseCommand(line);
    const handler = commands[parsed.command];
    await handler(session, fs, args, io);
}

// NEW: delegate to executor
import { executeLine } from '../executor.js';

for (const line of lines) {
    if (io.signal?.aborted) return 130;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const exitCode = await executeLine(session, trimmed, io, {
        fs,  // reuse current transaction's FS
        useTransaction: false  // already in one
    });
    session.env['?'] = String(exitCode);
}
```

### Background Execution - Full Support

```typescript
// OLD: simplified, missing features
const cmd = pipeline[0];  // only first command!
await handler(session, fs, cmd.args, io);

// NEW: full execution through same path
await executeChain(session, parsed, fs, processIO, processIO.signal);
```

## Output Handling

The executor always uses `CommandIO`. Callers wire it up:

| Context | stdout wiring |
|---------|---------------|
| Interactive | `io.stdout.on('data', chunk => writeToStream(tty, chunk))` |
| Background | `io.stdout.pipe(fileWriteStream)` |
| Source | Pass through parent's IO |
| Pipe | Collect to buffer, pass to next command |

## Migration Plan

1. **Create `executor.ts`** - Extract execution functions
2. **Create `profile.ts`** - Extract session init functions
3. **Create `auth.ts`** - Extract auth state machine
4. **Update `session-handler.ts`** - Keep only input handling
5. **Update `source.ts`** - Use `executeLine()`
6. **Fix background execution** - Use `executeChain()`
7. **Test all paths** - Interactive, source, background, profile

## Benefits

1. **Smaller files** - Each ~150-400 lines instead of 1191
2. **Single execution path** - source, profile, background all use same code
3. **Easier testing** - Can test executor without TTY
4. **Clear layers** - Input → Auth → Execute → Commands
5. **Full feature parity** - Background gets globs, &&, ||, pipes
