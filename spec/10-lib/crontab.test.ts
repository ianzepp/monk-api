import { describe, expect, it } from 'bun:test';
import { isValidCron } from '@src/lib/crontab.js';

describe('Crontab cron expression validation', () => {
    it('accepts valid cron expressions', () => {
        expect(isValidCron('0 * * * *')).toBe(true);
        expect(isValidCron('*/15 * * * *')).toBe(true);
        expect(isValidCron('0,15,30,45 * * * *')).toBe(true);
        expect(isValidCron('1-5/2 * * * *')).toBe(true);
        expect(isValidCron('0 0 * * 0')).toBe(true);
    });

    it('rejects step values of zero', () => {
        expect(isValidCron('*/0 * * * *')).toBe(false);
        expect(isValidCron('0/0 * * * *')).toBe(false);
        expect(isValidCron('10-30/0 * * * *')).toBe(false);
    });

    it('rejects out-of-bounds numeric fields', () => {
        expect(isValidCron('60 * * * *')).toBe(false);
        expect(isValidCron('* 24 * * *')).toBe(false);
        expect(isValidCron('* * 32 * *')).toBe(false);
        expect(isValidCron('* * * 13 *')).toBe(false);
        expect(isValidCron('* * * * 7')).toBe(false);
    });

    it('rejects malformed cron expressions', () => {
        expect(isValidCron('1 * * *')).toBe(false);
        expect(isValidCron('*/a * * * *')).toBe(false);
        expect(isValidCron('1--2 * * * *')).toBe(false);
        expect(isValidCron('1,,2 * * * *')).toBe(false);
    });
});
