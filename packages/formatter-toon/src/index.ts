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
import { type Formatter, toBytes, fromBytes } from '@monk/common';

export const ToonFormatter: Formatter = {
    encode(data: any): Uint8Array {
        return toBytes(encodeToon(data, {
            keyFolding: 'safe',
            indent: 2,
        }));
    },

    decode(data: Uint8Array): any {
        return decodeToon(fromBytes(data));
    },

    contentType: 'text/plain; charset=utf-8'
};
