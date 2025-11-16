/**
 * Brainfuck Formatter
 *
 * Brainfuck encoding wrapper. Decoding is intentionally not implemented
 * because executing arbitrary Brainfuck code from API requests would be
 * wonderfully terrible (even more than encoding responses in Brainfuck).
 */

export const BrainfuckFormatter = {
    /**
     * Encode data to Brainfuck code that outputs JSON string
     * Uses simple character-by-character encoding strategy
     */
    encode(data: any): string {
        // Convert data to JSON string first
        const jsonString = JSON.stringify(data, null, 2);

        let brainfuck = '';
        let currentValue = 0;

        for (let i = 0; i < jsonString.length; i++) {
            const targetValue = jsonString.charCodeAt(i);
            const diff = targetValue - currentValue;

            if (diff > 0) {
                // Increase cell value
                brainfuck += '+'.repeat(diff);
            } else if (diff < 0) {
                // Decrease cell value
                brainfuck += '-'.repeat(-diff);
            }

            // Output the character
            brainfuck += '.';
            currentValue = targetValue;
        }

        return brainfuck;
    },

    /**
     * Decode is not implemented for Brainfuck
     * We're not THAT crazy... yet
     */
    decode(text: string): any {
        throw new Error('Brainfuck decoding is not supported. We have some standards.');
    },

    /**
     * Content-Type for responses
     */
    contentType: 'text/plain; charset=utf-8'
};
