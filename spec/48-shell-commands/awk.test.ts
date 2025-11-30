/**
 * AWK Command Tests
 *
 * Tests for the awk pattern scanning and text processing command.
 */

import { describe, it, expect } from 'bun:test';
import { awk } from '@src/lib/tty/commands/awk/index.js';
import { runCommand, outputLines } from './command-test-helper.js';

describe('awk', () => {
    describe('basic printing', () => {
        it('should print all lines with empty program', async () => {
            const result = await runCommand(awk, ['{print}'], 'line1\nline2\nline3\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['line1', 'line2', 'line3']);
        });

        it('should print $0 (entire line) by default', async () => {
            const result = await runCommand(awk, ['{print $0}'], 'hello world\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('hello world');
        });

        it('should print specific fields', async () => {
            const result = await runCommand(awk, ['{print $1}'], 'alice bob charlie\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('alice');
        });

        it('should print multiple fields', async () => {
            const result = await runCommand(awk, ['{print $3, $1}'], 'one two three\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('three one');
        });

        it('should handle missing fields as empty', async () => {
            const result = await runCommand(awk, ['{print $5}'], 'a b c\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('');
        });
    });

    describe('field separator', () => {
        it('should use default whitespace separator', async () => {
            const result = await runCommand(awk, ['{print $2}'], 'a   b   c\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('b');
        });

        it('should use -F to set field separator', async () => {
            const result = await runCommand(awk, ['-F:', '{print $1}'], 'root:x:0:0\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('root');
        });

        it('should handle comma separator', async () => {
            const result = await runCommand(awk, ['-F,', '{print $2}'], 'a,b,c\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('b');
        });

        it('should set FS in BEGIN block', async () => {
            const result = await runCommand(awk, ['BEGIN{FS=":"} {print $1}'], 'user:pass:uid\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('user');
        });
    });

    describe('patterns', () => {
        it('should filter by regex pattern', async () => {
            const result = await runCommand(awk, ['/error/'], 'info: ok\nerror: fail\nwarn: check\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('error: fail');
        });

        it('should filter by comparison', async () => {
            const result = await runCommand(awk, ['$1 > 5'], '3\n7\n2\n9\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['7', '9']);
        });

        it('should filter by string comparison', async () => {
            const result = await runCommand(awk, ['$1 == "foo"'], 'foo\nbar\nfoo\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['foo', 'foo']);
        });

        it('should match with ~', async () => {
            const result = await runCommand(awk, ['$0 ~ /^[0-9]/'], 'abc\n123\nxyz\n456\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['123', '456']);
        });

        it('should not match with !~', async () => {
            const result = await runCommand(awk, ['$0 !~ /^[0-9]/'], 'abc\n123\nxyz\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['abc', 'xyz']);
        });
    });

    describe('BEGIN and END blocks', () => {
        it('should execute BEGIN before input', async () => {
            const result = await runCommand(awk, ['BEGIN{print "header"} {print}'], 'data\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['header', 'data']);
        });

        it('should execute END after input', async () => {
            const result = await runCommand(awk, ['{print} END{print "footer"}'], 'data\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['data', 'footer']);
        });

        it('should handle BEGIN without input', async () => {
            const result = await runCommand(awk, ['BEGIN{print "only begin"}'], '');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('only begin');
        });
    });

    describe('built-in variables', () => {
        it('should track NR (record number)', async () => {
            const result = await runCommand(awk, ['{print NR, $0}'], 'a\nb\nc\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['1 a', '2 b', '3 c']);
        });

        it('should track NF (number of fields)', async () => {
            const result = await runCommand(awk, ['{print NF}'], 'a b c\nx y\nz\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['3', '2', '1']);
        });

        it('should access last field with $NF', async () => {
            const result = await runCommand(awk, ['{print $NF}'], 'a b c\nx y z\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['c', 'z']);
        });

        it('should use OFS for output field separator', async () => {
            const result = await runCommand(awk, ['BEGIN{OFS=","} {print $1, $2}'], 'a b\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('a,b');
        });
    });

    describe('arithmetic', () => {
        it('should perform addition', async () => {
            const result = await runCommand(awk, ['{print $1 + $2}'], '3 4\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('7');
        });

        it('should perform subtraction', async () => {
            const result = await runCommand(awk, ['{print $1 - $2}'], '10 3\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('7');
        });

        it('should perform multiplication', async () => {
            const result = await runCommand(awk, ['{print $1 * $2}'], '6 7\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('42');
        });

        it('should perform division', async () => {
            const result = await runCommand(awk, ['{print $1 / $2}'], '20 4\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('5');
        });

        it('should perform modulo', async () => {
            const result = await runCommand(awk, ['{print $1 % $2}'], '17 5\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('2');
        });

        it('should perform exponentiation', async () => {
            const result = await runCommand(awk, ['{print $1 ^ $2}'], '2 10\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('1024');
        });

        it('should sum a column', async () => {
            const result = await runCommand(awk, ['{sum += $1} END{print sum}'], '10\n20\n30\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('60');
        });
    });

    describe('string functions', () => {
        it('should get length of string', async () => {
            const result = await runCommand(awk, ['{print length($1)}'], 'hello\nworld\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['5', '5']);
        });

        it('should get length of $0 by default', async () => {
            const result = await runCommand(awk, ['{print length()}'], 'abc\nabcde\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['3', '5']);
        });

        it('should extract substring', async () => {
            const result = await runCommand(awk, ['{print substr($1, 2, 3)}'], 'abcdef\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('bcd');
        });

        it('should find index of substring', async () => {
            const result = await runCommand(awk, ['{print index($0, "world")}'], 'hello world\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('7');
        });

        it('should return 0 if substring not found', async () => {
            const result = await runCommand(awk, ['{print index($0, "xyz")}'], 'hello world\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('0');
        });

        it('should convert to lowercase', async () => {
            const result = await runCommand(awk, ['{print tolower($0)}'], 'HELLO World\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('hello world');
        });

        it('should convert to uppercase', async () => {
            const result = await runCommand(awk, ['{print toupper($0)}'], 'Hello World\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('HELLO WORLD');
        });
    });

    describe('printf', () => {
        it('should format with %s', async () => {
            const result = await runCommand(awk, ['{printf "name: %s\\n", $1}'], 'alice\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('name: alice');
        });

        it('should format with %d', async () => {
            const result = await runCommand(awk, ['{printf "num: %d\\n", $1}'], '42\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('num: 42');
        });

        it('should format with width', async () => {
            const result = await runCommand(awk, ['{printf "%10s\\n", $1}'], 'hi\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('        hi\n');
        });

        it('should format with left alignment', async () => {
            const result = await runCommand(awk, ['{printf "%-10s|\\n", $1}'], 'hi\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('hi        |\n');
        });

        it('should format floats', async () => {
            const result = await runCommand(awk, ['{printf "%.2f\\n", $1}'], '3.14159\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('3.14');
        });
    });

    describe('control flow', () => {
        it('should handle if statement', async () => {
            const result = await runCommand(awk, ['{if ($1 > 5) print "big"; else print "small"}'], '3\n7\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['small', 'big']);
        });

        it('should handle while loop', async () => {
            const result = await runCommand(awk, ['BEGIN{i=1; while(i<=3){print i; i++}}'], '');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['1', '2', '3']);
        });

        it('should handle for loop', async () => {
            const result = await runCommand(awk, ['BEGIN{for(i=1; i<=3; i++) print i}'], '');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['1', '2', '3']);
        });

        it('should handle next to skip to next record', async () => {
            const result = await runCommand(awk, ['/skip/{next} {print}'], 'a\nskip\nb\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a', 'b']);
        });
    });

    describe('arrays', () => {
        it('should create and access arrays', async () => {
            const result = await runCommand(awk, ['{a[$1]=$2} END{print a["x"]}'], 'x 10\ny 20\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('10');
        });

        it('should aggregate with arrays', async () => {
            const result = await runCommand(awk, ['{sum[$1]+=$2} END{for(k in sum) print k, sum[k]}'], 'a 1\nb 2\na 3\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout).sort();
            expect(lines).toContain('a 4');
            expect(lines).toContain('b 2');
        });

        it('should test membership with in', async () => {
            const result = await runCommand(awk, ['{a[$1]=1} END{if("x" in a) print "found"}'], 'x\ny\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('found');
        });

        it('should delete array elements', async () => {
            const result = await runCommand(awk, ['{a[$1]=1} END{delete a["x"]; for(k in a) print k}'], 'x\ny\nz\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout).sort();
            expect(lines).toEqual(['y', 'z']);
        });
    });

    describe('user-defined functions', () => {
        it('should define and call functions', async () => {
            const result = await runCommand(awk, ['function double(x){return x*2} {print double($1)}'], '5\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('10');
        });

        it('should handle multiple parameters', async () => {
            const result = await runCommand(awk, ['function add(a,b){return a+b} {print add($1,$2)}'], '3 4\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('7');
        });
    });

    describe('string concatenation', () => {
        it('should concatenate strings', async () => {
            const result = await runCommand(awk, ['{print $1 $2}'], 'hello world\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('helloworld');
        });

        it('should concatenate with literals', async () => {
            const result = await runCommand(awk, ['{print "prefix_" $1 "_suffix"}'], 'test\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('prefix_test_suffix');
        });
    });

    describe('variables', () => {
        it('should use -v to set variables', async () => {
            const result = await runCommand(awk, ['-v', 'x=hello', 'BEGIN{print x}'], '');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('hello');
        });

        it('should initialize unset variables to empty/zero', async () => {
            const result = await runCommand(awk, ['BEGIN{print x + 1}'], '');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('1');
        });

        it('should support increment operators', async () => {
            const result = await runCommand(awk, ['BEGIN{x=5; print x++; print x}'], '');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['5', '6']);
        });

        it('should support prefix increment', async () => {
            const result = await runCommand(awk, ['BEGIN{x=5; print ++x; print x}'], '');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['6', '6']);
        });
    });

    describe('ternary operator', () => {
        it('should evaluate ternary expressions', async () => {
            const result = await runCommand(awk, ['{print ($1 > 5) ? "big" : "small"}'], '3\n8\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['small', 'big']);
        });
    });

    describe('math functions', () => {
        it('should compute sqrt', async () => {
            const result = await runCommand(awk, ['BEGIN{print sqrt(16)}'], '');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('4');
        });

        it('should compute int (truncate)', async () => {
            const result = await runCommand(awk, ['BEGIN{print int(3.9)}'], '');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('3');
        });

        it('should compute sin', async () => {
            const result = await runCommand(awk, ['BEGIN{printf "%.4f\\n", sin(0)}'], '');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('0.0000');
        });

        it('should compute exp and log', async () => {
            const result = await runCommand(awk, ['BEGIN{printf "%.4f\\n", log(exp(1))}'], '');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('1.0000');
        });
    });

    describe('error handling', () => {
        it('should error on missing program', async () => {
            const result = await runCommand(awk, [], '');
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('no program');
        });

        it('should error on syntax error', async () => {
            const result = await runCommand(awk, ['{print $1'], 'test\n');
            expect(result.exitCode).toBe(1);
            expect(result.stderr.length).toBeGreaterThan(0);
        });
    });

    describe('complex examples', () => {
        it('should count words', async () => {
            const result = await runCommand(awk, ['{words += NF} END{print words}'], 'one two\nthree four five\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('5');
        });

        it('should compute average', async () => {
            const result = await runCommand(awk, ['{sum += $1; n++} END{print sum/n}'], '10\n20\n30\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('20');
        });

        it('should reverse fields', async () => {
            const result = await runCommand(awk, ['{for(i=NF;i>=1;i--) printf "%s ", $i; print ""}'], 'a b c\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('c b a');
        });

        it('should remove duplicate lines', async () => {
            const result = await runCommand(awk, ['!seen[$0]++'], 'a\nb\na\nc\nb\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a', 'b', 'c']);
        });

        it('should print lines longer than N', async () => {
            const result = await runCommand(awk, ['length > 5'], 'hi\nhello world\nbye\ngreetings\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['hello world', 'greetings']);
        });
    });
});
