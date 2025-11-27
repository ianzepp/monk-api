/**
 * @monk/formatter-qr - QR Code Formatter (Response-only)
 *
 * Encodes JSON responses as scannable ASCII art QR codes.
 * Decoding is intentionally not supported.
 *
 * The QR codes use Unicode block characters and are
 * scannable by most QR code readers when displayed in a terminal
 * or monospace font.
 */

import encodeQR from 'qr';
import { type Formatter, toBytes } from '@monk/common';

export const QrFormatter: Formatter = {
    encode(data: any): Uint8Array {
        const jsonString = JSON.stringify(data, null, 2);
        const qr = encodeQR(jsonString, 'ascii', {
            ecc: 'medium',
            border: 2,
        });
        return toBytes(qr);
    },

    decode(_data: Uint8Array): any {
        throw new Error('QR code decoding is not supported. Please scan the QR code with a reader app.');
    },

    contentType: 'text/plain; charset=utf-8'
};
