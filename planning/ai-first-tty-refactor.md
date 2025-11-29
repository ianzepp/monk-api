# AI-First TTY Refactor

## Overview

Reverse the TTY flow from `login → shell → AI` to `login → AI → shell`. The AI becomes the primary interface; the shell becomes a tool the AI (or user) can invoke.

**Rationale:** Users shouldn't need to memorize Unix command syntax. They describe intent to the AI, which executes the appropriate shell/fs commands.

## Current vs Proposed Flow

### Current (Shell-First)
```
login → shell (root@tenant:~$) → @ → AI mode (@>) → exit → shell
```

### Proposed (AI-First)
```
login → AI mode (> ) → ! → shell (root@tenant:~$) → exit → AI mode (with shell output)
```

## Key Decisions

| Decision | Choice |
|----------|--------|
| `!` alone | Start interactive shell session |
| `! cmd` | Run single command, return to AI |
| Shell exit behavior | Prompt "Share shell contents with AI? [Y/n]" |
| AI prompt | `> ` (simple) |
| Shell prompt | `root@tenant:~$` (unchanged) |
| `@` in shell mode | Keep working for quick AI queries |

## Architecture Changes

### Session State Simplification

Current (overcomplicated):
```typescript
export type SessionState =
    | 'AWAITING_USERNAME'
    | 'AWAITING_PASSWORD'
    | 'AUTHENTICATED'        // ← Not really a "state", just "done"
    | 'REGISTER_TENANT'
    | 'REGISTER_USERNAME'
    | 'REGISTER_PASSWORD'
    | 'REGISTER_CONFIRM';

// Usage:
if (session.state !== 'AUTHENTICATED') { ... }  // awkward
```

Proposed (cleaner):
```typescript
export type AuthState =
    | 'AWAITING_USERNAME'
    | 'AWAITING_PASSWORD'
    | 'REGISTER_TENANT'
    | 'REGISTER_USERNAME'
    | 'REGISTER_PASSWORD'
    | 'REGISTER_CONFIRM';

export type SessionMode = 'ai' | 'shell';

export interface Session {
    authenticated: boolean;     // true after successful login
    authState: AuthState;       // only relevant when !authenticated
    mode: SessionMode;          // only relevant when authenticated
}

// Usage:
if (!session.authenticated) { ... }  // intuitive
```

### Session State Machine

```
!authenticated:
  authState: AWAITING_USERNAME → AWAITING_PASSWORD → (login success)
                    ↓
             REGISTER_TENANT → REGISTER_USERNAME → REGISTER_PASSWORD → REGISTER_CONFIRM
                                                                              ↓
                                                                       (registration success)

authenticated:
  mode: AI (default) ←→ SHELL (via ! / exit)
```

### Module Changes

#### 1. `src/lib/tty/types.ts`

Refactor session state:
```typescript
// Auth flow states (only used when !authenticated)
export type AuthState =
    | 'AWAITING_USERNAME'
    | 'AWAITING_PASSWORD'
    | 'REGISTER_TENANT'
    | 'REGISTER_USERNAME'
    | 'REGISTER_PASSWORD'
    | 'REGISTER_CONFIRM';

// Post-auth interaction modes
export type SessionMode = 'ai' | 'shell';

export interface Session {
    // Auth
    authenticated: boolean;
    authState: AuthState;

    // Mode (post-auth)
    mode: SessionMode;
    shellTranscript: string[];  // capture shell output for AI context

    // ... existing fields
}
```

Add configurable prompt/escape characters:
```typescript
// Prompt and escape characters (configurable)
export const TTY_CHARS = {
    AI_PROMPT: '> ',           // Prompt shown in AI mode
    SHELL_ESCAPE: '!',         // Prefix to escape to shell from AI mode
    AI_ESCAPE: '@',            // Prefix to invoke AI from shell mode
} as const;
```

#### 2. `src/lib/tty/auth.ts`

Update `completeLogin()`:
- Set `session.mode = 'ai'` instead of printing shell prompt
- Call new `enterAIMode()` function
- Print AI-appropriate welcome message

```typescript
async function completeLogin(...) {
    // ... existing setup
    session.mode = 'ai';
    writeToStream(stream, `\nWelcome ${session.username}@${session.tenant}!\n\n`);
    await enterAIMode(stream, session);  // NEW
}
```

#### 3. `src/lib/tty/session-handler.ts`

Update `processLine()` to route by auth and mode:
```typescript
async function processLine(...) {
    // Not authenticated - handle auth flow
    if (!session.authenticated) {
        await handleAuthState(stream, session, line, config);
        return;
    }

    // Route by mode
    if (session.mode === 'ai') {
        await processAIInput(stream, session, line, config);
    } else {
        await processShellInput(stream, session, line, config);
    }
}
```

Add new AI input handler:
```typescript
import { TTY_CHARS } from './types.js';

async function processAIInput(stream, session, line, config) {
    const trimmed = line.trim();

    // Empty line - just print prompt
    if (!trimmed) {
        writeToStream(stream, TTY_CHARS.AI_PROMPT);
        return;
    }

    // Shell escape: ! or !command
    if (trimmed === TTY_CHARS.SHELL_ESCAPE || trimmed.startsWith(TTY_CHARS.SHELL_ESCAPE + ' ')) {
        await handleShellEscape(stream, session, trimmed, config);
        return;
    }

    // Exit AI mode entirely
    if (trimmed === 'exit' || trimmed === 'quit') {
        await saveContext(session);
        session.shouldClose = true;
        return;
    }

    // Send to AI conversation handler
    await handleAIMessage(stream, session, trimmed);
}
```

#### 4. `src/lib/tty/commands/ai.ts`

Refactor to expose conversation handling:
- Extract `handleAIMessage()` for single-turn processing
- Keep `conversationMode()` but make it callable from session handler
- Add shell transcript injection into context

```typescript
// NEW: Handle single AI message (called from session handler)
export async function handleAIMessage(
    stream: TTYStream,
    session: Session,
    message: string
): Promise<void> {
    // Load config, context, etc.
    // Process message
    // Handle tool calls
    // Save context
    // Print prompt
}

// NEW: Inject shell transcript into AI context
function injectShellTranscript(messages: Message[], transcript: string[]): Message[] {
    if (transcript.length === 0) return messages;

    const shellOutput = transcript.join('\n');
    messages.push({
        role: 'user',
        content: `[Shell session output:\n${shellOutput}]`
    });
    messages.push({
        role: 'assistant',
        content: 'I can see the shell session output. How can I help?'
    });

    return messages;
}
```

#### 5. New: `src/lib/tty/shell-mode.ts`

Handle shell submode:
```typescript
export async function enterShellMode(
    stream: TTYStream,
    session: Session,
    singleCommand?: string
): Promise<void> {
    session.mode = 'shell';
    session.shellTranscript = [];

    if (singleCommand) {
        // Execute single command and return
        const output = await executeAndCapture(session, singleCommand);
        session.shellTranscript.push(`$ ${singleCommand}\n${output}`);
        await exitShellMode(stream, session);
    } else {
        // Interactive shell
        writeToStream(stream, 'Entering shell mode. Type "exit" to return to AI.\n\n');
        printPrompt(stream, session);
    }
}

export async function exitShellMode(
    stream: TTYStream,
    session: Session
): Promise<void> {
    session.mode = 'ai';

    if (session.shellTranscript.length > 0) {
        writeToStream(stream, '\nShare shell contents with AI? [Y/n] ');
        // Wait for response, then inject into AI context or discard
    } else {
        writeToStream(stream, '\n> ');
    }
}
```

## Implementation Phases

### Phase 1: Refactor Session State
- Rename `SessionState` → `AuthState` (remove AUTHENTICATED)
- Add `authenticated: boolean` to Session
- Add `authState: AuthState` to Session
- Update all `session.state` references
- Update all `session.state !== 'AUTHENTICATED'` → `!session.authenticated`
- No behavior change yet

### Phase 2: Add Session Mode
- Add `mode: SessionMode` to Session interface
- Add `shellTranscript: string[]` to Session interface
- Initialize `mode = 'ai'` after auth
- No behavior change yet (still shows shell)

### Phase 3: Route by Mode
- Update `processLine()` to check `session.mode`
- Create stub `processAIInput()` that just echoes
- Create `processShellInput()` with existing shell logic
- Update `completeLogin()` to enter AI mode
- Login now shows AI prompt

### Phase 4: Wire AI Conversation
- Extract AI message handling from `commands/ai.ts`
- Call from `processAIInput()`
- AI conversation works from login

### Phase 5: Add Shell Escape
- Implement `!` and `! cmd` handling
- Capture shell output to transcript
- Implement exit confirmation prompt

### Phase 6: Polish
- Update prompts (`> ` for AI)
- Update welcome message
- Handle Ctrl+C in both modes
- Test edge cases

## Edge Cases

| Case | Handling |
|------|----------|
| Ctrl+C in AI mode | Abort current API call, print new prompt |
| Ctrl+C in shell mode | Abort current command (existing behavior) |
| Ctrl+D in AI mode | Save context, close connection |
| Ctrl+D in shell mode | Return to AI mode |
| `@` in shell mode | Still works - quick AI query |
| Piped input | Detect and handle appropriately |
| Long shell session | Truncate/summarize transcript before AI injection |

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/tty/types.ts` | Add `SessionMode`, `mode`, `shellTranscript` |
| `src/lib/tty/auth.ts` | Update `completeLogin()` to enter AI mode |
| `src/lib/tty/session-handler.ts` | Route by mode, add AI input handler |
| `src/lib/tty/commands/ai.ts` | Extract message handling, add transcript injection |
| `src/lib/tty/shell-mode.ts` | NEW: Shell submode handling |
| `monkfs/etc/motd` | Update welcome message for AI-first |

## Testing Plan

1. Login → should see AI prompt `> `
2. Type question → AI responds
3. Type `!` → enters shell, see shell prompt
4. Run commands → output captured
5. Type `exit` → prompted to share with AI
6. Answer Y → back to AI with context
7. Ask AI about shell output → AI knows what happened
8. Type `! ls -la` → runs command, immediately back to AI
9. Ctrl+C during AI response → aborts, shows new prompt
10. Ctrl+D from AI → saves context, disconnects
