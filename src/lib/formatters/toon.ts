/**
 * TOON Formatter
 *
 * TOON format encoding/decoding wrapper.
 * TOON is a compact, human-readable data format designed for reduced token usage.
 */

import { encode as encodeToon, decode as decodeToon } from '@toon-format/toon';

export const ToonFormatter = {
    /**
     * Encode data to TOON string
     */
    encode(data: any): string {
        return encodeToon(data, {
            keyFolding: 'safe',
            indent: 2,
        });
    },

    /**
     * Decode TOON string to data
     */
    decode(text: string): any {
        return decodeToon(text);
    },

    /**
     * Content-Type for responses
     */
    contentType: 'text/plain; charset=utf-8'
};
