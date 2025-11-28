/**
 * passwd - Change user password
 *
 * Usage:
 *   passwd <newpassword>                    Change own password
 *   passwd <username> <newpassword>         Change another user's password (root only)
 *
 * Note: For security, consider using: echo "newpass" | passwd
 * to avoid password appearing in command history.
 */

import type { CommandHandler } from './shared.js';
import type { Session } from '../types.js';
import { runTransaction } from '@src/lib/transaction.js';
import { hashPassword } from '@src/lib/credentials/index.js';

export const passwd: CommandHandler = async (session, fs, args, io) => {
    if (!session.systemInit) {
        io.stderr.write('passwd: not authenticated\n');
        return 1;
    }

    const isRoot = session.env['ACCESS'] === 'root';
    let targetUsername: string;
    let newPassword: string | null = null;

    // Parse arguments
    if (args.length === 0) {
        // Read password from stdin
        const chunks: string[] = [];
        for await (const chunk of io.stdin) {
            chunks.push(chunk.toString());
        }
        newPassword = chunks.join('').trim();
        targetUsername = session.username;
    } else if (args.length === 1) {
        // passwd <newpassword> - change own password
        newPassword = args[0];
        targetUsername = session.username;
    } else {
        // passwd <username> <newpassword> - change another user's password
        targetUsername = args[0];
        newPassword = args[1];
    }

    const isChangingSelf = targetUsername === session.username;

    // Non-root users can only change their own password
    if (!isChangingSelf && !isRoot) {
        io.stderr.write('passwd: permission denied (only root can change other users)\n');
        return 1;
    }

    if (!newPassword) {
        io.stderr.write('passwd: missing password\n');
        io.stderr.write('Usage: passwd <newpassword>\n');
        io.stderr.write('       passwd <username> <newpassword>\n');
        io.stderr.write('       echo "newpass" | passwd\n');
        return 1;
    }

    if (newPassword.length < 4) {
        io.stderr.write('passwd: password too short (minimum 4 characters)\n');
        return 1;
    }

    try {
        // Get the target user
        const targetUser = await runTransaction(session.systemInit, async (system) => {
            return system.database.selectOne('users', {
                where: { name: targetUsername },
            });
        });

        if (!targetUser) {
            io.stderr.write(`passwd: user '${targetUsername}' does not exist\n`);
            return 1;
        }

        // Update the password
        await updatePassword(session, targetUser.id, newPassword);

        io.stdout.write(`passwd: password updated for ${targetUsername}\n`);
        return 0;
    } catch (err) {
        io.stderr.write(`passwd: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
    }
};

/**
 * Update password in credentials table
 */
async function updatePassword(
    session: Session,
    userId: string,
    newPassword: string
): Promise<void> {
    const hashedPassword = await hashPassword(newPassword);

    await runTransaction(session.systemInit!, async (system) => {
        // Check if password credential exists
        const existing = await system.database.execute(
            `SELECT id FROM credentials
             WHERE user_id = $1 AND type = 'password' AND deleted_at IS NULL
             LIMIT 1`,
            [userId]
        );

        if (existing.rows && existing.rows.length > 0) {
            // Update existing
            await system.database.execute(
                `UPDATE credentials
                 SET secret = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [hashedPassword, existing.rows[0].id]
            );
        } else {
            // Insert new
            const id = crypto.randomUUID();
            await system.database.execute(
                `INSERT INTO credentials (id, user_id, type, secret, created_at, updated_at)
                 VALUES ($1, $2, 'password', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [id, userId, hashedPassword]
            );
        }
    });
}
