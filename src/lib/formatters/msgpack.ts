/**
 * MessagePack Formatter
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

import { encode as encodeMsgPack, decode as decodeMsgPack } from '@msgpack/msgpack';

export const MessagePackFormatter = {
    /**
     * Encode data to MessagePack binary format
     * Returns base64-encoded string for HTTP transport
     */
    encode(data: any): string {
        const buffer = encodeMsgPack(data);
        // Convert Uint8Array to base64 for HTTP transport
        return Buffer.from(buffer).toString('base64');
    },

    /**
     * Decode MessagePack binary to data
     * Accepts base64-encoded string from HTTP transport
     */
    decode(text: string): any {
        // Decode base64 string to buffer
        const buffer = Buffer.from(text, 'base64');
        return decodeMsgPack(buffer);
    },

    /**
     * Content-Type for responses
     * Using application/msgpack as the standard MIME type
     */
    contentType: 'application/msgpack'
};
