/**
 * @monk/formatter-toon - TOON Formatter
 *
 * TOON (Token-Oriented Object Notation) format encoding/decoding.
 * TOON is a compact, human-readable data format designed for reduced token usage,
 * making it ideal for LLM agent interactions.
 *
 * Use cases:
 * - LLM agent API interactions (30-60% fewer tokens)
 * - Compact data serialization
 * - Human-readable configuration
 */

import { encode as encodeToon, decode as decodeToon } from '@toon-format/toon';

export interface Formatter {
    encode(data: any): string;
    decode(text: string): any;
    contentType: string;
}

export const ToonFormatter: Formatter = {
    encode(data: any): string {
        return encodeToon(data, {
            keyFolding: 'safe',
            indent: 2,
        });
    },

    decode(text: string): any {
        return decodeToon(text);
    },

    contentType: 'text/plain; charset=utf-8'
};
