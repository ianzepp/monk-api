/**
 * jq - JSON processing tests
 *
 * Tests for the enhanced jq implementation supporting:
 * - Identity, field access, array access
 * - Pipes (|), arithmetic, comparison
 * - Object/array construction
 * - Built-in functions (map, select, keys, etc.)
 */

import { describe, it, expect } from 'bun:test';
import { jq } from '@src/lib/tty/commands/index.js';
import { runCommand, outputLines } from './command-test-helper.js';

describe('jq', () => {
    // =========================================================================
    // Basic operations
    // =========================================================================

    describe('identity filter', () => {
        it('should pass through with .', async () => {
            const result = await runCommand(jq, ['.'], '{"a":1}\n');
            expect(result.exitCode).toBe(0);
            const parsed = JSON.parse(result.stdout);
            expect(parsed).toEqual({ a: 1 });
        });

        it('should format output with indentation', async () => {
            const result = await runCommand(jq, ['.'], '{"a":1,"b":2}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('\n');
        });

        it('should output compact with -c', async () => {
            const result = await runCommand(jq, ['-c', '.'], '{"a":1,"b":2}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('{"a":1,"b":2}');
        });
    });

    describe('field access', () => {
        it('should extract field with .field', async () => {
            const result = await runCommand(jq, ['.name'], '{"name":"alice","age":30}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('"alice"');
        });

        it('should extract field raw with -r', async () => {
            const result = await runCommand(jq, ['-r', '.name'], '{"name":"alice"}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('alice');
        });

        it('should extract nested field', async () => {
            const result = await runCommand(jq, ['.user.name'], '{"user":{"name":"bob"}}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('"bob"');
        });

        it('should return null for missing field', async () => {
            const result = await runCommand(jq, ['.missing'], '{"name":"test"}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('null');
        });

        it('should handle optional field with ?', async () => {
            const result = await runCommand(jq, ['.missing?'], '{"name":"test"}\n');
            expect(result.exitCode).toBe(0);
            // Optional field on missing returns nothing (empty output)
        });

        it('should extract numeric field', async () => {
            const result = await runCommand(jq, ['.age'], '{"name":"alice","age":30}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('30');
        });

        it('should extract boolean field', async () => {
            const result = await runCommand(jq, ['.active'], '{"active":true}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('true');
        });
    });

    describe('array access', () => {
        it('should extract array element', async () => {
            const result = await runCommand(jq, ['.[0]'], '[1,2,3]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('1');
        });

        it('should extract with negative index', async () => {
            const result = await runCommand(jq, ['.[-1]'], '[1,2,3]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('3');
        });

        it('should extract second element', async () => {
            const result = await runCommand(jq, ['.[1]'], '[10,20,30]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('20');
        });

        it('should extract array of objects', async () => {
            const result = await runCommand(jq, ['.[0].name'], '[{"name":"alice"},{"name":"bob"}]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('"alice"');
        });

        it('should iterate with .[]', async () => {
            const result = await runCommand(jq, ['.[]'], '[1,2,3]\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines).toEqual(['1', '2', '3']);
        });

        it('should slice array', async () => {
            const result = await runCommand(jq, ['.[1:3]'], '[0,1,2,3,4]\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([1, 2]);
        });
    });

    // =========================================================================
    // Pipes and multiple operations
    // =========================================================================

    describe('pipes', () => {
        it('should pipe operations', async () => {
            const result = await runCommand(jq, ['.users | .[0] | .name'], '{"users":[{"name":"alice"}]}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('"alice"');
        });

        it('should iterate then access', async () => {
            const result = await runCommand(jq, ['.[] | .name'], '[{"name":"a"},{"name":"b"}]\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines).toEqual(['"a"', '"b"']);
        });
    });

    // =========================================================================
    // Arithmetic
    // =========================================================================

    describe('arithmetic', () => {
        it('should add numbers', async () => {
            const result = await runCommand(jq, ['.a + .b'], '{"a":2,"b":3}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('5');
        });

        it('should subtract numbers', async () => {
            const result = await runCommand(jq, ['.a - .b'], '{"a":10,"b":4}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('6');
        });

        it('should multiply numbers', async () => {
            const result = await runCommand(jq, ['.a * .b'], '{"a":3,"b":4}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('12');
        });

        it('should divide numbers', async () => {
            const result = await runCommand(jq, ['.a / .b'], '{"a":10,"b":2}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('5');
        });

        it('should concatenate strings with +', async () => {
            const result = await runCommand(jq, ['-r', '.a + .b'], '{"a":"hello","b":"world"}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('helloworld');
        });

        it('should concatenate arrays with +', async () => {
            const result = await runCommand(jq, ['.a + .b'], '{"a":[1,2],"b":[3,4]}\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([1, 2, 3, 4]);
        });
    });

    // =========================================================================
    // Comparison
    // =========================================================================

    describe('comparison', () => {
        it('should compare equality', async () => {
            const result = await runCommand(jq, ['.a == .b'], '{"a":5,"b":5}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('true');
        });

        it('should compare inequality', async () => {
            const result = await runCommand(jq, ['.a != .b'], '{"a":5,"b":3}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('true');
        });

        it('should compare less than', async () => {
            const result = await runCommand(jq, ['.a < .b'], '{"a":3,"b":5}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('true');
        });
    });

    // =========================================================================
    // Object and array construction
    // =========================================================================

    describe('construction', () => {
        it('should construct object', async () => {
            const result = await runCommand(jq, ['{name: .n, age: .a}'], '{"n":"alice","a":30}\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({ name: 'alice', age: 30 });
        });

        it('should construct array', async () => {
            const result = await runCommand(jq, ['[.a, .b]'], '{"a":1,"b":2}\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([1, 2]);
        });

        it('should construct empty array', async () => {
            const result = await runCommand(jq, ['[]'], '{"a":1}\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([]);
        });
    });

    // =========================================================================
    // Built-in functions
    // =========================================================================

    describe('built-in functions', () => {
        it('should get keys', async () => {
            const result = await runCommand(jq, ['keys'], '{"b":2,"a":1}\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual(['a', 'b']);
        });

        it('should get values', async () => {
            const result = await runCommand(jq, ['values'], '{"a":1,"b":2}\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([1, 2]);
        });

        it('should get length of array', async () => {
            const result = await runCommand(jq, ['length'], '[1,2,3]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('3');
        });

        it('should get length of string', async () => {
            const result = await runCommand(jq, ['length'], '"hello"\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('5');
        });

        it('should get type', async () => {
            const result = await runCommand(jq, ['type'], '"hello"\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('"string"');
        });

        it('should map over array', async () => {
            const result = await runCommand(jq, ['map(. + 1)'], '[1,2,3]\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([2, 3, 4]);
        });

        it('should select items', async () => {
            const result = await runCommand(jq, ['.[] | select(. > 2)'], '[1,2,3,4]\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines).toEqual(['3', '4']);
        });

        it('should sort array', async () => {
            const result = await runCommand(jq, ['sort'], '[3,1,2]\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([1, 2, 3]);
        });

        it('should reverse array', async () => {
            const result = await runCommand(jq, ['reverse'], '[1,2,3]\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([3, 2, 1]);
        });

        it('should get first element', async () => {
            const result = await runCommand(jq, ['first'], '[5,6,7]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('5');
        });

        it('should get last element', async () => {
            const result = await runCommand(jq, ['last'], '[5,6,7]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('7');
        });

        it('should add array elements', async () => {
            const result = await runCommand(jq, ['add'], '[1,2,3]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('6');
        });

        it('should get unique values', async () => {
            const result = await runCommand(jq, ['unique'], '[1,2,1,3,2]\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([1, 2, 3]);
        });

        it('should flatten array', async () => {
            const result = await runCommand(jq, ['flatten'], '[[1,2],[3,[4]]]\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([1, 2, 3, [4]]);
        });

        it('should get min', async () => {
            const result = await runCommand(jq, ['min'], '[3,1,2]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('1');
        });

        it('should get max', async () => {
            const result = await runCommand(jq, ['max'], '[3,1,2]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('3');
        });
    });

    describe('string functions', () => {
        it('should split string', async () => {
            const result = await runCommand(jq, ['split(",")'], '"a,b,c"\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual(['a', 'b', 'c']);
        });

        it('should join array', async () => {
            const result = await runCommand(jq, ['-r', 'join(",")'], '["a","b","c"]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('a,b,c');
        });

        it('should test regex', async () => {
            const result = await runCommand(jq, ['test("^a")'], '"abc"\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('true');
        });

        it('should convert to uppercase', async () => {
            const result = await runCommand(jq, ['-r', 'ascii_upcase'], '"hello"\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('HELLO');
        });

        it('should trim whitespace', async () => {
            const result = await runCommand(jq, ['-r', 'trim'], '"  hello  "\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('hello');
        });
    });

    describe('type conversion', () => {
        it('should convert to string', async () => {
            const result = await runCommand(jq, ['-r', 'tostring'], '42\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('42');
        });

        it('should convert to number', async () => {
            const result = await runCommand(jq, ['tonumber'], '"42"\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('42');
        });
    });

    // =========================================================================
    // Error handling
    // =========================================================================

    describe('error handling', () => {
        it('should error on missing expression', async () => {
            const result = await runCommand(jq, [], '{"a":1}\n');
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('missing');
        });

        it('should error on invalid JSON', async () => {
            const result = await runCommand(jq, ['.'], 'not json\n');
            expect(result.exitCode).not.toBe(0);
        });

        it('should error on unknown function', async () => {
            const result = await runCommand(jq, ['notafunc'], '{"a":1}\n');
            expect(result.exitCode).not.toBe(0);
            expect(result.stderr).toContain('Unknown function');
        });
    });

    // =========================================================================
    // Multiple inputs
    // =========================================================================

    describe('multiple JSON objects', () => {
        it('should process multiple objects', async () => {
            const result = await runCommand(jq, ['.a'], '{"a":1}\n{"a":2}\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines).toEqual(['1', '2']);
        });
    });

    describe('slurp mode', () => {
        it('should slurp inputs into array with -s', async () => {
            const result = await runCommand(jq, ['-s', '.'], '1\n2\n3\n');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([1, 2, 3]);
        });
    });

    describe('empty input', () => {
        it('should handle empty input', async () => {
            const result = await runCommand(jq, ['.'], '');
            expect(result.exitCode).toBe(0);
        });
    });
});
