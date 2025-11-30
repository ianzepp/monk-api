/**
 * basename and dirname tests
 */

import { describe, it, expect } from 'bun:test';
import { basename } from '@src/lib/tty/commands/basename.js';
import { dirname } from '@src/lib/tty/commands/dirname.js';
import { runCommand } from './command-test-helper.js';

describe('basename', () => {
    describe('basic operation', () => {
        it('should extract filename from path', async () => {
            const result = await runCommand(basename, ['/path/to/file.txt']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('file.txt');
        });

        it('should handle simple filename', async () => {
            const result = await runCommand(basename, ['file.txt']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('file.txt');
        });

        it('should handle directory path', async () => {
            const result = await runCommand(basename, ['/path/to/dir/']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('dir');
        });

        it('should handle root', async () => {
            const result = await runCommand(basename, ['/']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('/');
        });

        it('should handle current dir', async () => {
            const result = await runCommand(basename, ['.']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('.');
        });

        it('should handle parent dir', async () => {
            const result = await runCommand(basename, ['..']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('..');
        });
    });

    describe('suffix removal', () => {
        it('should remove suffix', async () => {
            const result = await runCommand(basename, ['/path/to/file.txt', '.txt']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('file');
        });

        it('should not remove non-matching suffix', async () => {
            const result = await runCommand(basename, ['/path/to/file.txt', '.md']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('file.txt');
        });

        it('should handle multiple extensions', async () => {
            const result = await runCommand(basename, ['archive.tar.gz', '.gz']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('archive.tar');
        });
    });

    describe('error handling', () => {
        it('should error without arguments', async () => {
            const result = await runCommand(basename, []);
            expect(result.exitCode).toBe(1);
        });
    });
});

describe('dirname', () => {
    describe('basic operation', () => {
        it('should extract directory from path', async () => {
            const result = await runCommand(dirname, ['/path/to/file.txt']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('/path/to');
        });

        it('should handle simple filename', async () => {
            const result = await runCommand(dirname, ['file.txt']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('.');
        });

        it('should handle directory path', async () => {
            const result = await runCommand(dirname, ['/path/to/dir/']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('/path/to');
        });

        // Note: dirname strips trailing slashes first, so "/" becomes "."
        it('should handle root', async () => {
            const result = await runCommand(dirname, ['/']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('.');
        });

        it('should handle single directory', async () => {
            const result = await runCommand(dirname, ['/usr']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('/');
        });

        it('should handle current dir', async () => {
            const result = await runCommand(dirname, ['.']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('.');
        });

        it('should handle parent dir', async () => {
            const result = await runCommand(dirname, ['..']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('.');
        });

        it('should handle relative path', async () => {
            const result = await runCommand(dirname, ['path/to/file']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('path/to');
        });
    });

    describe('error handling', () => {
        it('should error without arguments', async () => {
            const result = await runCommand(dirname, []);
            expect(result.exitCode).toBe(1);
        });
    });
});
