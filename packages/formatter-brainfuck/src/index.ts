/**
 * @monk/formatter-brainfuck - Brainfuck Formatter
 *
 * Brainfuck encoding wrapper. Decoding is intentionally not implemented
 * because executing arbitrary Brainfuck code from API requests would be
 * wonderfully terrible (even more than encoding responses in Brainfuck).
 */

import { type Formatter, toBytes } from '@monk/common';

export const BrainfuckFormatter: Formatter = {
    encode(data: any): Uint8Array {
        const jsonString = JSON.stringify(data, null, 2);

        let brainfuck = '';
        let currentValue = 0;

        for (let i = 0; i < jsonString.length; i++) {
            const targetValue = jsonString.charCodeAt(i);
            const diff = targetValue - currentValue;

            if (diff > 0) {
                brainfuck += '+'.repeat(diff);
            } else if (diff < 0) {
                brainfuck += '-'.repeat(-diff);
            }

            brainfuck += '.';
            currentValue = targetValue;
        }

        return toBytes(brainfuck);
    },

    decode(_data: Uint8Array): any {
        throw new Error('Brainfuck decoding is not supported. We have some standards.');
    },

    contentType: 'text/plain; charset=utf-8'
};
