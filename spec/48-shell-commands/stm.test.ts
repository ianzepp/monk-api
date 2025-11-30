/**
 * stm (Short Term Memory) tests
 *
 * Note: These tests run without a real database/fs, so STM operations
 * are no-ops. Tests focus on command parsing and error handling.
 * Integration tests with a full environment would be needed for
 * complete coverage.
 */

import { describe, it, expect } from 'bun:test';
import { stm } from '@src/lib/tty/commands/stm.js';
import { runCommand, outputLines } from './command-test-helper.js';

describe('stm', () => {
    describe('list', () => {
        it('should show empty when no STM data', async () => {
            const result = await runCommand(stm, []);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('(empty)\n');
        });

        it('should show empty with explicit list', async () => {
            const result = await runCommand(stm, ['list']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('(empty)\n');
        });
    });

    describe('get', () => {
        it('should error without key', async () => {
            const result = await runCommand(stm, ['get']);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('missing key');
        });

        it('should return 1 for non-existent key (silent)', async () => {
            const result = await runCommand(stm, ['get', 'nonexistent']);
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('');
            expect(result.stderr).toBe('');
        });
    });

    describe('set', () => {
        it('should error without key', async () => {
            const result = await runCommand(stm, ['set']);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('missing key');
        });

        it('should error without value', async () => {
            const result = await runCommand(stm, ['set', 'mykey']);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('missing value');
        });

        it('should accept key and value (no-op without systemInit)', async () => {
            const result = await runCommand(stm, ['set', 'task', 'testing']);
            expect(result.exitCode).toBe(0);
        });

        it('should accept multi-word values', async () => {
            const result = await runCommand(stm, ['set', 'task', 'testing', 'the', 'stm']);
            expect(result.exitCode).toBe(0);
        });
    });

    describe('delete', () => {
        it('should error without key', async () => {
            const result = await runCommand(stm, ['delete']);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('missing key');
        });

        it('should accept rm alias', async () => {
            const result = await runCommand(stm, ['rm']);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('missing key');
        });

        it('should succeed for key (no-op without systemInit)', async () => {
            const result = await runCommand(stm, ['delete', 'somekey']);
            expect(result.exitCode).toBe(0);
        });
    });

    describe('clear', () => {
        it('should succeed (no-op without systemInit)', async () => {
            const result = await runCommand(stm, ['clear']);
            expect(result.exitCode).toBe(0);
        });
    });

    describe('unknown subcommand', () => {
        it('should error on unknown subcommand', async () => {
            const result = await runCommand(stm, ['invalid']);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('unknown subcommand');
        });
    });

    describe('alarm', () => {
        describe('list', () => {
            it('should show no alarms when empty', async () => {
                const result = await runCommand(stm, ['alarm']);
                expect(result.exitCode).toBe(0);
                expect(result.stdout).toBe('(no alarms)\n');
            });

            it('should show no alarms with explicit list', async () => {
                const result = await runCommand(stm, ['alarm', 'list']);
                expect(result.exitCode).toBe(0);
                expect(result.stdout).toBe('(no alarms)\n');
            });
        });

        describe('create', () => {
            it('should error without message', async () => {
                const result = await runCommand(stm, ['alarm', '5m']);
                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('missing message');
            });

            it('should error on invalid duration', async () => {
                const result = await runCommand(stm, ['alarm', 'invalid', 'message']);
                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('invalid duration');
            });

            it('should accept valid alarm (no-op without systemInit)', async () => {
                const result = await runCommand(stm, ['alarm', '5m', 'check', 'the', 'build']);
                expect(result.exitCode).toBe(0);
                expect(result.stdout).toContain('Alarm set');
            });

            it('should accept different duration formats', async () => {
                for (const dur of ['30s', '5m', '1h', '90m']) {
                    const result = await runCommand(stm, ['alarm', dur, 'test']);
                    expect(result.exitCode).toBe(0);
                }
            });
        });

        describe('stop', () => {
            it('should error without id', async () => {
                const result = await runCommand(stm, ['alarm', 'stop']);
                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('missing alarm id');
            });

            it('should error on non-existent alarm', async () => {
                const result = await runCommand(stm, ['alarm', 'stop', 'abc123']);
                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('alarm not found');
            });

            it('should accept dismiss alias', async () => {
                const result = await runCommand(stm, ['alarm', 'dismiss']);
                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('missing alarm id');
            });
        });

        describe('snooze', () => {
            it('should error without id', async () => {
                const result = await runCommand(stm, ['alarm', 'snooze']);
                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('missing alarm id');
            });

            it('should error on non-existent alarm', async () => {
                const result = await runCommand(stm, ['alarm', 'snooze', 'abc123']);
                expect(result.exitCode).toBe(1);
                expect(result.stderr).toContain('alarm not found');
            });
        });

        describe('clear', () => {
            it('should succeed (no-op without systemInit)', async () => {
                const result = await runCommand(stm, ['alarm', 'clear']);
                expect(result.exitCode).toBe(0);
                expect(result.stdout).toContain('cleared');
            });
        });
    });
});
