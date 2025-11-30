/**
 * Tests for base64, bc/calc, and nl commands
 */

import { describe, it, expect } from 'bun:test';
import { base64 } from '@src/lib/tty/commands/base64.js';
import { bc, calc } from '@src/lib/tty/commands/bc.js';
import { nl } from '@src/lib/tty/commands/nl.js';
import { runCommand, outputLines } from './command-test-helper.js';

describe('base64', () => {
    describe('encoding', () => {
        it('should encode text to base64', async () => {
            const result = await runCommand(base64, [], 'hello\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('aGVsbG8K');
        });

        it('should encode without trailing newline', async () => {
            const result = await runCommand(base64, [], 'hello');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('aGVsbG8=');
        });

        it('should wrap long output at 76 chars by default', async () => {
            const longInput = 'a'.repeat(100);
            const result = await runCommand(base64, [], longInput);
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines[0].length).toBe(76);
        });

        it('should not wrap with -w 0', async () => {
            const longInput = 'a'.repeat(100);
            const result = await runCommand(base64, ['-w', '0'], longInput);
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines.length).toBe(1);
        });
    });

    describe('decoding', () => {
        it('should decode base64 to text', async () => {
            const result = await runCommand(base64, ['-d'], 'aGVsbG8K\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('hello\n');
        });

        it('should handle whitespace in input', async () => {
            const result = await runCommand(base64, ['-d'], 'aGVs\nbG8K\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('hello\n');
        });

        it('should decode with --decode flag', async () => {
            const result = await runCommand(base64, ['--decode'], 'aGVsbG8=');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('hello');
        });
    });
});

describe('bc', () => {
    describe('basic arithmetic', () => {
        it('should add numbers', async () => {
            const result = await runCommand(bc, ['2 + 2']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('4');
        });

        it('should subtract numbers', async () => {
            const result = await runCommand(bc, ['10 - 3']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('7');
        });

        it('should multiply numbers', async () => {
            const result = await runCommand(bc, ['6 * 7']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('42');
        });

        it('should divide numbers (integer by default)', async () => {
            const result = await runCommand(bc, ['10 / 3']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('3');
        });

        it('should handle modulo', async () => {
            const result = await runCommand(bc, ['10 % 3']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('1');
        });

        it('should handle power with ^', async () => {
            const result = await runCommand(bc, ['2 ^ 8']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('256');
        });

        it('should handle parentheses', async () => {
            const result = await runCommand(bc, ['(2 + 3) * 4']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('20');
        });
    });

    describe('math library (-l)', () => {
        it('should enable decimals with -l', async () => {
            const result = await runCommand(bc, ['-l', '10 / 3']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toMatch(/^3\.333/);
        });
    });

    describe('functions', () => {
        it('should calculate sqrt', async () => {
            const result = await runCommand(bc, ['sqrt(16)']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('4');
        });

        it('should calculate abs', async () => {
            const result = await runCommand(bc, ['abs(-5)']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('5');
        });
    });

    describe('constants', () => {
        it('should recognize pi', async () => {
            const result = await runCommand(bc, ['-l', 'pi']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toMatch(/^3\.14159/);
        });
    });

    describe('stdin input', () => {
        it('should read expression from stdin', async () => {
            const result = await runCommand(bc, [], '5 * 5\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('25');
        });

        it('should handle scale setting', async () => {
            const result = await runCommand(bc, [], 'scale=2; 10/3\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toMatch(/^3\.33/);
        });
    });
});

describe('calc', () => {
    it('should be an alias for bc', async () => {
        const result = await runCommand(calc, ['1 + 1']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('2');
    });
});

describe('nl', () => {
    describe('default behavior', () => {
        it('should number all lines', async () => {
            const result = await runCommand(nl, [], 'a\nb\nc\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines.length).toBe(3);
            expect(lines[0]).toMatch(/^\s*1\ta$/);
            expect(lines[1]).toMatch(/^\s*2\tb$/);
            expect(lines[2]).toMatch(/^\s*3\tc$/);
        });

        it('should right-justify numbers by default', async () => {
            const result = await runCommand(nl, [], 'x\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toMatch(/^\s+1\tx\n$/);
        });
    });

    describe('-b option (body numbering)', () => {
        it('should number only non-empty lines with -b t', async () => {
            const result = await runCommand(nl, ['-b', 't'], 'a\n\nb\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines[0]).toMatch(/1.*a/);
            expect(lines[1]).not.toMatch(/2/);
            expect(lines[2]).toMatch(/2.*b/);
        });

        it('should not number lines with -b n', async () => {
            const result = await runCommand(nl, ['-b', 'n'], 'a\nb\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines[0]).not.toMatch(/^\s*\d/);
        });
    });

    describe('-n option (number format)', () => {
        it('should left-justify with -n ln', async () => {
            const result = await runCommand(nl, ['-n', 'ln'], 'x\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toMatch(/^1\s+\tx\n$/);
        });

        it('should zero-pad with -n rz', async () => {
            const result = await runCommand(nl, ['-n', 'rz'], 'x\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toMatch(/^0+1\tx\n$/);
        });
    });

    describe('-w option (width)', () => {
        it('should set number width', async () => {
            const result = await runCommand(nl, ['-w', '3'], 'x\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toMatch(/^\s{2}1\tx\n$/);
        });
    });

    describe('-s option (separator)', () => {
        it('should use custom separator', async () => {
            const result = await runCommand(nl, ['-s', ': '], 'x\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toMatch(/1: x/);
        });
    });

    describe('-v option (start number)', () => {
        it('should start at specified number', async () => {
            const result = await runCommand(nl, ['-v', '10'], 'a\nb\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines[0]).toMatch(/10.*a/);
            expect(lines[1]).toMatch(/11.*b/);
        });
    });

    describe('-i option (increment)', () => {
        it('should increment by specified amount', async () => {
            const result = await runCommand(nl, ['-i', '5'], 'a\nb\nc\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines[0]).toMatch(/1.*a/);
            expect(lines[1]).toMatch(/6.*b/);
            expect(lines[2]).toMatch(/11.*c/);
        });
    });
});
