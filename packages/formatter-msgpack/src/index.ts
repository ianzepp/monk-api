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
import { type Formatter } from '@monk/common';

export const MsgpackFormatter: Formatter = {
    encode(data: any): Uint8Array {
        return encode(data);
    },

    decode(data: Uint8Array): any {
        return decode(data);
    },

    contentType: 'application/msgpack'
};
