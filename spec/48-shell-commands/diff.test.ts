/**
 * diff - compare files tests
 *
 * Note: diff requires two files, but we can test stdin comparisons
 * and the basic algorithm using mocked filesystem.
 */

import { describe, it, expect } from 'bun:test';
import { diff } from '@src/lib/tty/commands/diff.js';
import { runCommand, outputLines } from './command-test-helper.js';

describe('diff', () => {
    describe('error handling', () => {
        it('should error without arguments', async () => {
            const result = await runCommand(diff, []);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('missing');
        });

        it('should error with only one argument', async () => {
            const result = await runCommand(diff, ['file1']);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('missing');
        });
    });

    // Note: Most diff tests require filesystem access with actual files
    // These tests validate the command interface and error handling
});
