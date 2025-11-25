/**
 * Morse Code Formatter
 *
 * Text-based morse code encoding/decoding.
 * Converts text to dots (.) and dashes (-) representation.
 */

const MORSE_CODE: Record<string, string> = {
    'A': '.-',    'B': '-...',  'C': '-.-.',  'D': '-..',   'E': '.',
    'F': '..-.',  'G': '--.',   'H': '....',  'I': '..',    'J': '.---',
    'K': '-.-',   'L': '.-..',  'M': '--',    'N': '-.',    'O': '---',
    'P': '.--.',  'Q': '--.-',  'R': '.-.',   'S': '...',   'T': '-',
    'U': '..-',   'V': '...-',  'W': '.--',   'X': '-..-',  'Y': '-.--',
    'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
    '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--',
    ':': '---...', ';': '-.-.-.', '(': '-.--.', ')': '-.--.-',
    '"': '.-..-.', "'": '.----.', '-': '-....-', '/': '-..-.',
    '@': '.--.-.', '=': '-...-',  '+': '.-.-.',  ' ': '/',
    '{': '--.--',  '}': '--..-',  '[': '----..',  ']': '..--.-',
    '\n': '//'
};

// Reverse lookup: morse code to character
const MORSE_TO_CHAR: Record<string, string> = Object.fromEntries(
    Object.entries(MORSE_CODE).map(([char, morse]) => [morse, char])
);

export const MorseFormatter = {
    /**
     * Encode text to morse code (dots and dashes)
     * Uses hex encoding first to avoid case sensitivity issues
     */
    encode(data: any): string {
        // Convert data to JSON string
        const jsonString = JSON.stringify(data, null, 2);

        // Hex encode to preserve all data (case-insensitive encoding)
        const hexString = Buffer.from(jsonString).toString('hex').toUpperCase();

        // Convert hex to morse (only 0-9 and A-F needed)
        return hexString
            .split('')
            .map(char => MORSE_CODE[char] || '')
            .filter(code => code.length > 0)
            .join(' ');
    },

    /**
     * Decode morse code (dots and dashes) to text
     * Decodes from hex to restore original JSON
     */
    decode(text: string): any {
        // Split by spaces to get individual morse codes
        const hexString = text
            .split(' ')
            .map(code => MORSE_TO_CHAR[code] || '')
            .join('');

        // Hex decode to get original JSON
        const jsonString = Buffer.from(hexString, 'hex').toString();

        // Parse as JSON
        return JSON.parse(jsonString);
    },

    /**
     * Content-Type for responses
     */
    contentType: 'text/plain; charset=utf-8'
};
