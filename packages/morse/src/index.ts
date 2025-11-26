/**
 * @monk/morse - Morse Code Formatter
 *
 * Text-based morse code encoding/decoding.
 * Converts text to dots (.) and dashes (-) representation.
 */

export interface Formatter {
    encode(data: any): string;
    decode(text: string): any;
    contentType: string;
}

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

const MORSE_TO_CHAR: Record<string, string> = Object.fromEntries(
    Object.entries(MORSE_CODE).map(([char, morse]) => [morse, char])
);

export const MorseFormatter: Formatter = {
    /**
     * Encode text to morse code (dots and dashes)
     * Uses hex encoding first to avoid case sensitivity issues
     */
    encode(data: any): string {
        const jsonString = JSON.stringify(data, null, 2);
        const hexString = Buffer.from(jsonString).toString('hex').toUpperCase();

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
        const hexString = text
            .split(' ')
            .map(code => MORSE_TO_CHAR[code] || '')
            .join('');

        const jsonString = Buffer.from(hexString, 'hex').toString();
        return JSON.parse(jsonString);
    },

    contentType: 'text/plain; charset=utf-8'
};
