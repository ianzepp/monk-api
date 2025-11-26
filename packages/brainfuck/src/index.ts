/**
 * @monk/brainfuck - Brainfuck Formatter
 *
 * Brainfuck encoding wrapper. Decoding is intentionally not implemented
 * because executing arbitrary Brainfuck code from API requests would be
 * wonderfully terrible (even more than encoding responses in Brainfuck).
 */

export interface Formatter {
    encode(data: any): string;
    decode(text: string): any;
    contentType: string;
}

export const BrainfuckFormatter: Formatter = {
    /**
     * Encode data to Brainfuck code that outputs JSON string
     * Uses simple character-by-character encoding strategy
     */
    encode(data: any): string {
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

        return brainfuck;
    },

    /**
     * Decode is not implemented for Brainfuck
     * We're not THAT crazy... yet
     */
    decode(_text: string): any {
        throw new Error('Brainfuck decoding is not supported. We have some standards.');
    },

    contentType: 'text/plain; charset=utf-8'
};
