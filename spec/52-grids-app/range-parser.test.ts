import { describe, expect, it } from 'bun:test';
import { parseRange, validateRangeBounds, isCellInRange } from '../../packages/grids/src/range-parser';

describe('Grid range parser column limits', () => {
    it('accepts single-letter Excel-style columns', () => {
        const range = parseRange('A1:Z10');

        expect(range.type).toBe('range');
        expect(range.startCol).toBe('A');
        expect(range.endCol).toBe('Z');
    });

    it('rejects multi-letter columns explicitly', () => {
        expect(() => parseRange('AA1')).toThrow('single letter A-Z');
        expect(() => parseRange('A:AA')).toThrow('single letter A-Z');
        expect(() => parseRange('A1:AA10')).toThrow('single letter A-Z');
        expect(() => parseRange('AA:ZZ')).toThrow('single letter A-Z');
    });

    it('rejects runtime grid limits that exceed parser support', () => {
        expect(() => validateRangeBounds(parseRange('A1'), 1000, 'AA')).toThrow('single letter A-Z');
        expect(() => validateRangeBounds(parseRange('A1:Z1000'), 1000, 'AA')).toThrow('single letter A-Z');
    });

    it('uses numeric column ordering in in-range checks', () => {
        const range = parseRange('B:D');

        expect(isCellInRange({ row: 1, col: 'C' }, range)).toBe(true);
        expect(isCellInRange({ row: 1, col: 'A' }, range)).toBe(false);
    });
});
