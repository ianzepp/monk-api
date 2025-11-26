/**
 * @monk/qr - QR Code Formatter (Response-only)
 *
 * Encodes JSON responses as scannable ASCII art QR codes.
 * Decoding is intentionally not supported.
 *
 * The QR codes use Unicode block characters and are
 * scannable by most QR code readers when displayed in a terminal
 * or monospace font.
 */

import encodeQR from 'qr';

export interface Formatter {
    encode(data: any): string;
    decode(text: string): any;
    contentType: string;
}

export const QrFormatter: Formatter = {
    encode(data: any): string {
        const jsonString = JSON.stringify(data, null, 2);
        return encodeQR(jsonString, 'ascii', {
            ecc: 'medium',
            border: 2,
        });
    },

    decode(_text: string): any {
        throw new Error('QR code decoding is not supported. Please scan the QR code with a reader app.');
    },

    contentType: 'text/plain; charset=utf-8'
};
