/**
 * @monk/formatter-msgpack - MessagePack Formatter
 *
 * MessagePack format encoding/decoding wrapper.
 * MessagePack is a binary serialization format that's more compact than JSON.
 *
 * Use cases:
 * - Binary efficiency (30-50% smaller than JSON)
 * - High-performance APIs
 * - Microservice communication
 * - IoT/embedded systems
 * - Mobile apps with bandwidth constraints
 */

import { encode, decode } from '@msgpack/msgpack';

export interface Formatter {
    encode(data: any): string;
    decode(text: string): any;
    contentType: string;
}

export const MessagePackFormatter: Formatter = {
    /**
     * Encode data to MessagePack binary format
     * Returns base64-encoded string for HTTP transport
     */
    encode(data: any): string {
        const buffer = encode(data);
        return Buffer.from(buffer).toString('base64');
    },

    /**
     * Decode MessagePack binary to data
     * Accepts base64-encoded string from HTTP transport
     */
    decode(text: string): any {
        const buffer = Buffer.from(text, 'base64');
        return decode(buffer);
    },

    contentType: 'application/msgpack'
};
