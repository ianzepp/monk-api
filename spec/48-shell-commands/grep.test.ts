/**
 * grep - pattern matching tests
 */

import { describe, it, expect } from 'bun:test';
import { grep } from '@src/lib/tty/commands/grep.js';
import { runCommand, outputLines } from './command-test-helper.js';

describe('grep', () => {
    describe('basic matching', () => {
        it('should match simple pattern', async () => {
            const result = await runCommand(grep, ['foo'], 'foo\nbar\nfoo bar\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['foo', 'foo bar']);
        });

        it('should return exit code 1 when no match', async () => {
            const result = await runCommand(grep, ['xyz'], 'foo\nbar\n');
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('');
        });

        it('should match regex patterns', async () => {
            const result = await runCommand(grep, ['^[0-9]'], 'abc\n123\nxyz\n456\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['123', '456']);
        });

        it('should match end of line', async () => {
            const result = await runCommand(grep, ['end$'], 'the end\nending\nend\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['the end', 'end']);
        });
    });

    describe('case sensitivity (-i)', () => {
        it('should be case-sensitive by default', async () => {
            const result = await runCommand(grep, ['foo'], 'FOO\nfoo\nFoo\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['foo']);
        });

        it('should be case-insensitive with -i', async () => {
            const result = await runCommand(grep, ['-i', 'foo'], 'FOO\nfoo\nFoo\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['FOO', 'foo', 'Foo']);
        });
    });

    describe('invert match (-v)', () => {
        it('should invert match', async () => {
            const result = await runCommand(grep, ['-v', 'foo'], 'foo\nbar\nbaz\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['bar', 'baz']);
        });

        it('should combine -v and -i', async () => {
            const result = await runCommand(grep, ['-vi', 'foo'], 'FOO\nbar\nfoo\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['bar']);
        });
    });

    describe('fixed strings (-F)', () => {
        it('should match literal strings', async () => {
            const result = await runCommand(grep, ['-F', 'a.b'], 'a.b\nacb\na*b\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a.b']);
        });

        it('should match regex metacharacters literally', async () => {
            const result = await runCommand(grep, ['-F', '[test]'], '[test]\ntest\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['[test]']);
        });
    });

    describe('word match (-w)', () => {
        it('should match whole words only', async () => {
            const result = await runCommand(grep, ['-w', 'foo'], 'foo\nfoobar\nbar foo baz\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['foo', 'bar foo baz']);
        });
    });

    describe('line match (-x)', () => {
        it('should match entire lines', async () => {
            const result = await runCommand(grep, ['-x', 'foo'], 'foo\nfoo bar\nfoobar\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['foo']);
        });
    });

    describe('count (-c)', () => {
        it('should count matching lines', async () => {
            const result = await runCommand(grep, ['-c', 'foo'], 'foo\nbar\nfoo\nfoo\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('3');
        });

        it('should return 0 count for no matches', async () => {
            const result = await runCommand(grep, ['-c', 'xyz'], 'foo\nbar\n');
            expect(result.exitCode).toBe(1);
            expect(result.stdout.trim()).toBe('0');
        });
    });

    describe('line numbers (-n)', () => {
        it('should show line numbers', async () => {
            const result = await runCommand(grep, ['-n', 'foo'], 'bar\nfoo\nbaz\nfoo\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['2:foo', '4:foo']);
        });
    });

    describe('files only (-l)', () => {
        it('should suppress normal output', async () => {
            const result = await runCommand(grep, ['-l', 'foo'], 'foo\nbar\n');
            expect(result.exitCode).toBe(0);
            // -l without files just indicates match was found
            expect(result.stdout).toBe('');
        });
    });

    describe('only matching (-o)', () => {
        it('should show only the matching part', async () => {
            const result = await runCommand(grep, ['-o', '[0-9]+'], 'abc123def456\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['123', '456']);
        });
    });

    describe('quiet mode (-q)', () => {
        it('should produce no output', async () => {
            const result = await runCommand(grep, ['-q', 'foo'], 'foo\nbar\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('');
        });

        it('should return correct exit code', async () => {
            const result = await runCommand(grep, ['-q', 'xyz'], 'foo\nbar\n');
            expect(result.exitCode).toBe(1);
        });
    });

    describe('max count (-m)', () => {
        it('should stop after N matches', async () => {
            const result = await runCommand(grep, ['-m', '2', 'foo'], 'foo\nfoo\nfoo\nfoo\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['foo', 'foo']);
        });
    });

    describe('combined flags', () => {
        it('should combine -in (case-insensitive with line numbers)', async () => {
            const result = await runCommand(grep, ['-in', 'FOO'], 'foo\nbar\nFOO\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['1:foo', '3:FOO']);
        });

        it('should combine -cv (count inverted)', async () => {
            const result = await runCommand(grep, ['-cv', 'foo'], 'foo\nbar\nbaz\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('2');
        });
    });

    describe('error handling', () => {
        it('should error on missing pattern', async () => {
            const result = await runCommand(grep, [], 'test\n');
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('pattern');
        });

        it('should error on invalid regex', async () => {
            const result = await runCommand(grep, ['[invalid'], 'test\n');
            expect(result.exitCode).toBe(1);
        });
    });
});
