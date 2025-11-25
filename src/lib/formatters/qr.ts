import encodeQR from 'qr';

/**
 * QR Code formatter - Response-only
 *
 * Encodes JSON responses as scannable ASCII art QR codes.
 * Decoding is intentionally not supported (similar to Brainfuck).
 *
 * The QR codes use Unicode block characters (█ ▀ ▄) and are
 * scannable by most QR code readers when displayed in a terminal
 * or monospace font.
 */
export const QrFormatter = {
    encode(data: any): string {
        const jsonString = JSON.stringify(data, null, 2);

        // Generate ASCII QR code with border
        // Options: medium error correction, 2-block border
        return encodeQR(jsonString, 'ascii', {
            ecc: 'medium',
            border: 2,
        });
    },

    decode(text: string): any {
        throw new Error('QR code decoding is not supported. Please scan the QR code with a reader app.');
    },

    contentType: 'text/plain; charset=utf-8'
};
