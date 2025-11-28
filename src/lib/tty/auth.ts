/**
 * TTY Authentication
 *
 * Handles the login/register state machine:
 * - Username/password login
 * - New tenant registration
 * - Session setup after authentication
 */

import type { Session, TTYStream, TTYConfig } from './types.js';
import { login, register } from '@src/lib/auth.js';
import { registerDaemon } from '@src/lib/process.js';
import { initializeSession } from './profile.js';

/**
 * Write to TTY stream with CRLF
 */
function writeToStream(stream: TTYStream, text: string): void {
    const normalized = text.replace(/(?<!\r)\n/g, '\r\n');
    stream.write(normalized);
}

/**
 * Print command prompt
 */
export function printPrompt(stream: TTYStream, session: Session): void {
    const prompt = `${session.username}@${session.tenant}:${session.cwd}$ `;
    writeToStream(stream, prompt);
}

/**
 * Handle authentication state machine
 *
 * Called for all non-AUTHENTICATED states
 */
export async function handleAuthState(
    stream: TTYStream,
    session: Session,
    line: string,
    config?: TTYConfig
): Promise<void> {
    const trimmed = line.trim();

    switch (session.state) {
        case 'AWAITING_USERNAME':
            await handleUsername(stream, session, trimmed);
            break;

        case 'AWAITING_PASSWORD':
            await handlePassword(stream, session, trimmed);
            break;

        case 'REGISTER_TENANT':
            await handleRegisterTenant(stream, session, trimmed);
            break;

        case 'REGISTER_USERNAME':
            await handleRegisterUsername(stream, session, trimmed);
            break;

        case 'REGISTER_PASSWORD':
            await handleRegisterPassword(stream, session, trimmed, config);
            break;

        case 'REGISTER_CONFIRM':
            await handleRegisterConfirm(stream, session, trimmed, config);
            break;
    }
}

/**
 * Handle username input
 */
async function handleUsername(stream: TTYStream, session: Session, input: string): Promise<void> {
    if (!input) {
        writeToStream(stream, 'monk login: ');
        return;
    }

    // Check for 'register' command
    if (input.toLowerCase() === 'register') {
        writeToStream(stream, '\n=== New Tenant Registration ===\n');
        writeToStream(stream, 'Tenant name: ');
        session.state = 'REGISTER_TENANT';
        session.registrationData = { tenant: '', username: '', password: '' };
        return;
    }

    // Parse user@tenant format
    const atIndex = input.indexOf('@');
    if (atIndex === -1) {
        writeToStream(stream, 'Invalid format. Use: username@tenant (or type "register" to create a new tenant)\n');
        writeToStream(stream, 'monk login: ');
        return;
    }

    session.username = input.slice(0, atIndex);
    session.tenant = input.slice(atIndex + 1);

    if (!session.username || !session.tenant) {
        writeToStream(stream, 'Invalid format. Use: username@tenant\n');
        writeToStream(stream, 'monk login: ');
        return;
    }

    // Try passwordless login first
    const result = await login({
        tenant: session.tenant,
        username: session.username,
    });

    if (result.success) {
        await completeLogin(stream, session, result.systemInit, result.user);
        return;
    }

    // If password is required, prompt for it
    if (result.errorCode === 'AUTH_PASSWORD_REQUIRED') {
        session.state = 'AWAITING_PASSWORD';
        writeToStream(stream, 'Password: ');
        return;
    }

    // Other error
    writeToStream(stream, `\nLogin failed: ${result.error}\n`);
    session.state = 'AWAITING_USERNAME';
    session.username = '';
    session.tenant = '';
    writeToStream(stream, 'monk login: ');
}

/**
 * Handle password input
 */
async function handlePassword(stream: TTYStream, session: Session, password: string): Promise<void> {
    const result = await login({
        tenant: session.tenant,
        username: session.username,
        password,
    });

    if (!result.success) {
        writeToStream(stream, `\nLogin failed: ${result.error}\n`);
        session.state = 'AWAITING_USERNAME';
        session.username = '';
        session.tenant = '';
        writeToStream(stream, 'monk login: ');
        return;
    }

    await completeLogin(stream, session, result.systemInit, result.user);
}

/**
 * Handle tenant name input during registration
 */
async function handleRegisterTenant(stream: TTYStream, session: Session, input: string): Promise<void> {
    if (!input) {
        writeToStream(stream, 'Tenant name: ');
        return;
    }

    if (!/^[a-z][a-z0-9_]*$/.test(input)) {
        writeToStream(stream, 'Invalid tenant name. Must be lowercase, start with a letter, and contain only letters, numbers, and underscores.\n');
        writeToStream(stream, 'Tenant name: ');
        return;
    }

    session.registrationData!.tenant = input;
    session.state = 'REGISTER_USERNAME';
    writeToStream(stream, 'Username (default: root): ');
}

/**
 * Handle username input during registration
 */
async function handleRegisterUsername(stream: TTYStream, session: Session, input: string): Promise<void> {
    const username = input || 'root';

    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(username)) {
        writeToStream(stream, 'Invalid username. Must start with a letter and contain only letters, numbers, underscores, and hyphens.\n');
        writeToStream(stream, 'Username (default: root): ');
        return;
    }

    session.registrationData!.username = username;
    session.state = 'REGISTER_PASSWORD';
    writeToStream(stream, 'Password (optional): ');
}

/**
 * Handle password input during registration
 */
async function handleRegisterPassword(
    stream: TTYStream,
    session: Session,
    password: string,
    config?: TTYConfig
): Promise<void> {
    session.registrationData!.password = password;

    if (password) {
        session.state = 'REGISTER_CONFIRM';
        writeToStream(stream, 'Confirm password: ');
    } else {
        await completeRegistration(stream, session, config);
    }
}

/**
 * Handle password confirmation during registration
 */
async function handleRegisterConfirm(
    stream: TTYStream,
    session: Session,
    confirm: string,
    config?: TTYConfig
): Promise<void> {
    if (confirm !== session.registrationData!.password) {
        writeToStream(stream, 'Passwords do not match. Try again.\n');
        session.registrationData!.password = '';
        session.state = 'REGISTER_PASSWORD';
        writeToStream(stream, 'Password (optional): ');
        return;
    }

    await completeRegistration(stream, session, config);
}

/**
 * Complete login and transition to AUTHENTICATED state
 */
async function completeLogin(
    stream: TTYStream,
    session: Session,
    systemInit: import('@src/lib/system.js').SystemInit,
    user: { username: string; tenant: string; access: string }
): Promise<void> {
    session.systemInit = systemInit;
    session.state = 'AUTHENTICATED';
    session.username = user.username;
    session.tenant = user.tenant;

    // Set environment variables
    const home = `/home/${user.username}`;
    session.env['USER'] = user.username;
    session.env['TENANT'] = user.tenant;
    session.env['ACCESS'] = user.access;
    session.env['HOME'] = home;

    // Register shell process
    try {
        session.pid = await registerDaemon(systemInit, {
            comm: 'monksh',
            cmdline: ['-login'],
            cwd: home,
            environ: session.env,
        });
    } catch {
        session.pid = null;
    }

    // Initialize session (home dir, history, profile)
    await initializeSession(stream, session);

    writeToStream(stream, `\nWelcome ${session.username}@${session.tenant}!\n`);
    writeToStream(stream, `Access level: ${user.access}\n\n`);
    printPrompt(stream, session);
}

/**
 * Complete registration and auto-login
 */
async function completeRegistration(
    stream: TTYStream,
    session: Session,
    _config?: TTYConfig
): Promise<void> {
    const { tenant, username, password } = session.registrationData!;

    writeToStream(stream, '\nCreating tenant...\n');

    const result = await register({
        tenant,
        username,
        password: password || undefined,
    });

    if (!result.success) {
        writeToStream(stream, `\nRegistration failed: ${result.error}\n\n`);
        session.state = 'AWAITING_USERNAME';
        session.registrationData = null;
        writeToStream(stream, 'monk login: ');
        return;
    }

    writeToStream(stream, `\nTenant '${result.tenant}' created successfully!\n`);

    // Auto-login after registration
    const loginResult = await login({
        tenant: result.tenant,
        username: result.username,
        password: password || undefined,
    });

    if (!loginResult.success) {
        writeToStream(stream, `You can now login as ${result.username}@${result.tenant}\n\n`);
        session.state = 'AWAITING_USERNAME';
        session.registrationData = null;
        writeToStream(stream, 'monk login: ');
        return;
    }

    session.registrationData = null;
    await completeLogin(stream, session, loginResult.systemInit, loginResult.user);
}
